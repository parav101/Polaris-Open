const fs = require("fs")
const path = require("path")

class Logger {
    constructor() {
        this.logDir = path.join(__dirname, "..", "logs")
        this.retentionDays = 14
        this.maxBytesPerDay = 20 * 1024 * 1024 // 20MB per day file before suffix split
        this.lastPruneAt = 0
        this.pruneIntervalMs = 60 * 60 * 1000 // 1 hour
        this.ensureDir()
    }

    ensureDir() {
        if (!fs.existsSync(this.logDir)) fs.mkdirSync(this.logDir, { recursive: true })
    }

    dateKey() {
        return new Date().toISOString().slice(0, 10)
    }

    eventPayload(level, category, payload = {}) {
        const msg = payload.msg || payload.message || ""
        const shardId = payload.shardId ?? process.env.SHARD_ID ?? null
        return {
            ts: Date.now(),
            iso: new Date().toISOString(),
            level,
            category,
            shardId,
            msg,
            meta: payload.meta || {}
        }
    }

    perfPayload(name, durationMs, meta = {}) {
        return {
            ts: Date.now(),
            iso: new Date().toISOString(),
            level: "info",
            category: "perf",
            shardId: meta.shardId ?? process.env.SHARD_ID ?? null,
            msg: name,
            meta: {
                name,
                durationMs: Math.round(Number(durationMs) || 0),
                ...meta
            }
        }
    }

    baseFileName(type) {
        const day = this.dateKey()
        return `bot-${type}-${day}.log`
    }

    resolveFilePath(type) {
        const base = this.baseFileName(type)
        const basePath = path.join(this.logDir, base)
        try {
            if (!fs.existsSync(basePath)) return basePath
            const stat = fs.statSync(basePath)
            if (stat.size < this.maxBytesPerDay) return basePath
        } catch (e) {
            return basePath
        }

        let n = 1
        while (n < 200) {
            const alt = path.join(this.logDir, base.replace(".log", `.${n}.log`))
            try {
                if (!fs.existsSync(alt)) return alt
                const stat = fs.statSync(alt)
                if (stat.size < this.maxBytesPerDay) return alt
            } catch (e) {
                return alt
            }
            n++
        }
        return basePath
    }

    pruneOldFiles() {
        const now = Date.now()
        if (now - this.lastPruneAt < this.pruneIntervalMs) return
        this.lastPruneAt = now

        let files = []
        try {
            files = fs.readdirSync(this.logDir).filter(f => /^bot-(events|perf)-\d{4}-\d{2}-\d{2}(\.\d+)?\.log$/.test(f))
        } catch (e) {
            return
        }

        const cutoff = now - (this.retentionDays * 24 * 60 * 60 * 1000)
        files.forEach(file => {
            const full = path.join(this.logDir, file)
            try {
                const stat = fs.statSync(full)
                if (stat.mtimeMs < cutoff) fs.unlinkSync(full)
            } catch (e) {}
        })
    }

    write(type, obj) {
        try {
            this.ensureDir()
            this.pruneOldFiles()
            const line = JSON.stringify(obj) + "\n"
            const filePath = this.resolveFilePath(type)
            fs.appendFileSync(filePath, line, "utf8")
        } catch (e) {
            // never throw from logger
        }
    }

    info(category, payload = {}) { this.write("events", this.eventPayload("info", category, payload)) }
    warn(category, payload = {}) { this.write("events", this.eventPayload("warn", category, payload)) }
    error(category, payload = {}) { this.write("events", this.eventPayload("error", category, payload)) }
    perf(name, durationMs, meta = {}) { this.write("perf", this.perfPayload(name, durationMs, meta)) }

    listFiles(type = "events") {
        this.ensureDir()
        let files = fs.readdirSync(this.logDir)
            .filter(f => f.startsWith(`bot-${type}-`) && f.endsWith(".log"))
            .map(name => path.join(this.logDir, name))
        files.sort((a, b) => {
            const sa = fs.statSync(a).mtimeMs
            const sb = fs.statSync(b).mtimeMs
            return sb - sa
        })
        return files
    }

    parseLine(line) {
        try {
            return JSON.parse(line)
        } catch (e) {
            return null
        }
    }

    readLogs(type = "events", opts = {}) {
        const limit = Math.min(Math.max(Number(opts.limit) || 200, 1), 2000)
        const since = Number(opts.since) || 0
        const level = opts.level || null
        const category = opts.category || null
        const command = opts.command || null
        const shardId = opts.shardId !== undefined && opts.shardId !== "" ? String(opts.shardId) : null

        const out = []
        const files = this.listFiles(type)
        for (const file of files) {
            if (out.length >= limit) break
            let text = ""
            try {
                text = fs.readFileSync(file, "utf8")
            } catch (e) {
                continue
            }
            const lines = text.split("\n").filter(Boolean).reverse()
            for (const line of lines) {
                const item = this.parseLine(line)
                if (!item) continue
                if (since && item.ts < since) continue
                if (level && item.level !== level) continue
                if (category && item.category !== category) continue
                if (command && item.meta?.command !== command) continue
                if (shardId !== null && String(item.shardId) !== shardId) continue
                out.push(item)
                if (out.length >= limit) break
            }
        }
        return out
    }

    percentile(values, p) {
        if (!values.length) return 0
        const arr = [...values].sort((a, b) => a - b)
        const idx = Math.min(arr.length - 1, Math.max(0, Math.ceil((p / 100) * arr.length) - 1))
        return arr[idx]
    }

    summary() {
        const now = Date.now()
        const since = now - (24 * 60 * 60 * 1000)
        const events = this.readLogs("events", { since, limit: 5000 })
        const perf = this.readLogs("perf", { since, limit: 5000 })

        const errorCount = events.filter(x => x.level === "error").length
        const warnCount = events.filter(x => x.level === "warn").length

        const byCommand = {}
        for (const p of perf) {
            const cmd = p.meta?.command || p.meta?.name || p.msg || "unknown"
            if (!byCommand[cmd]) byCommand[cmd] = []
            byCommand[cmd].push(Number(p.meta?.durationMs) || 0)
        }

        const perfSummary = Object.entries(byCommand).map(([command, vals]) => ({
            command,
            count: vals.length,
            p50: this.percentile(vals, 50),
            p95: this.percentile(vals, 95),
            max: vals.length ? Math.max(...vals) : 0
        })).sort((a, b) => b.p95 - a.p95)

        const topErrorsMap = {}
        for (const e of events.filter(x => x.level === "error" || x.level === "warn")) {
            const key = `${e.level}:${e.category}:${e.msg || ""}`.slice(0, 280)
            topErrorsMap[key] = (topErrorsMap[key] || 0) + 1
        }
        const topErrors = Object.entries(topErrorsMap).map(([key, count]) => ({ key, count }))
            .sort((a, b) => b.count - a.count).slice(0, 15)

        return {
            since,
            now,
            events: { errorCount, warnCount, total: events.length },
            perf: perfSummary,
            topErrors
        }
    }
}

module.exports = new Logger()
