const Tools = require("./Tools.js")

/**
 * Builds the activity leaderboard for a guild.
 *
 * Activity XP = (user.xp - user.xpIntervalSnapshot) / currentMultiplier
 * Approximated using the user's current multiplier at post time.
 *
 * @param {import("discord.js").Guild} guild
 * @param {object} db  Full guild document (db.users, db.settings)
 * @returns {Promise<Array<{id: string, activityXP: number, member: import("discord.js").GuildMember|null}>>}
 *   Sorted descending, top 9, only users with activityXP > 0
 */
async function buildActivityLeaderboard(guild, db) {
    const tools = Tools.global
    const usersArray = tools.xpObjToArray(db.users).filter(u => !u.hidden)

    // Step 1: compute raw diff for every user (no network calls), filter zeros, sort descending
    // Use xpAtDayStart as baseline (same as /info daily XP display), divided by multiplier.
    // IMPORTANT: only count users whose lastDailyUpdate is TODAY (UTC) — this filters out
    // users who were active on a previous day but haven't sent a message yet today,
    // since their xpAtDayStart is stale and would produce a false non-zero diff.
    const now = new Date()
    const candidates = usersArray
        .map(user => {
            const lastUpdate = user.lastDailyUpdate ? new Date(user.lastDailyUpdate) : null
            const isActiveToday = lastUpdate &&
                lastUpdate.getUTCFullYear() === now.getUTCFullYear() &&
                lastUpdate.getUTCMonth()    === now.getUTCMonth()    &&
                lastUpdate.getUTCDate()     === now.getUTCDate()
            if (!isActiveToday) return { id: user.id, rawDiff: 0, user }
            const baseline = user.xpAtDayStart ?? user.xp ?? 0
            const rawDiff = Math.max(0, (user.xp || 0) - baseline)
            return { id: user.id, rawDiff, user }
        })
        .filter(u => u.rawDiff > 0)
        .sort((a, b) => b.rawDiff - a.rawDiff)
        .slice(0, 20)

    if (!candidates.length) return []

    // Step 2: fetch only those top-20 members in parallel (cache-first, no sequential awaits)
    const memberMap = new Map()
    await Promise.all(candidates.map(async ({ id }) => {
        const cached = guild.members.cache.get(id)
        if (cached) { memberMap.set(id, cached); return }
        const fetched = await guild.members.fetch(id).catch(() => null)
        if (fetched) memberMap.set(id, fetched)
    }))

    // Step 3: apply multiplier, re-filter, re-sort, slice to 9
    const results = candidates.map(({ id, rawDiff }) => {
        const member = memberMap.get(id) || null
        let multiplier = 1
        if (member) {
            // Pass null as channel explicitly — avoids the `int.channel` default which throws
            // when called outside of an interaction context (Tools.global). Role multipliers
            // still apply correctly; channel multipliers are intentionally ignored here.
            multiplier = tools.getMultiplier(member, db.settings, null).multiplier || 1
        }
        return { id, activityXP: Math.floor(rawDiff / multiplier), member }
    })
    .filter(r => r.activityXP > 0)
    .sort((a, b) => b.activityXP - a.activityXP)
    .slice(0, 9)

    return results
}

const VALID_INTERVALS = [4, 6, 8, 12, 24]

/**
 * Snaps an arbitrary hour value to the nearest valid preset (4, 6, 8, 12, 24).
 * This ensures UTC-midnight alignment is always maintained.
 */
function snapInterval(hours) {
    const h = parseInt(hours) || 24
    return VALID_INTERVALS.reduce((prev, curr) =>
        Math.abs(curr - h) < Math.abs(prev - h) ? curr : prev
    )
}

/**
 * Anchors are fixed UTC epoch-aligned: e.g. every 8hrs = 0:00, 8:00, 16:00 UTC.
 *
 * @param {number} nowMs        Current time in ms
 * @param {number} intervalHours
 * @returns {number} Unix seconds of next anchor
 */
function nextAnchorUnix(nowMs, intervalHours) {
    const intervalMs = intervalHours * 3600000
    return Math.floor((Math.floor(nowMs / intervalMs) + 1) * intervalMs / 1000)
}

/**
 * Returns true if a new anchor period has started since `lastPostedMs`.
 *
 * @param {number} nowMs
 * @param {number} lastPostedMs
 * @param {number} intervalHours
 */
function isDue(nowMs, lastPostedMs, intervalHours) {
    const intervalMs = intervalHours * 3600000
    return Math.floor(nowMs / intervalMs) > Math.floor((lastPostedMs || 0) / intervalMs)
}

module.exports = { buildActivityLeaderboard, nextAnchorUnix, isDue, snapInterval }
