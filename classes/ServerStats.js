const PERIODS = {
    daily: { key: "daily", label: "Daily", days: 1, thresholdKey: "activeThresholdDaily" },
    weekly: { key: "weekly", label: "Weekly", days: 7, thresholdKey: "activeThresholdWeekly" },
    monthly: { key: "monthly", label: "Monthly", days: 30, thresholdKey: "activeThresholdMonthly" },
    quarterly: { key: "quarterly", label: "Quarterly", days: 90, thresholdKey: "activeThresholdQuarterly" },
}

const PERIOD_ORDER = ["daily", "weekly", "monthly", "quarterly"]
const MAX_DAILY_STATS_DAYS = 400

function getUtcDateKey(date = new Date()) {
    if (!(date instanceof Date)) date = new Date(date)
    return date.toISOString().slice(0, 10)
}

function parseUtcDateKey(key) {
    return new Date(`${key}T00:00:00.000Z`)
}

function shiftUtcDateKey(key, deltaDays) {
    const date = parseUtcDateKey(key)
    date.setUTCDate(date.getUTCDate() + deltaDays)
    return getUtcDateKey(date)
}

function getUtcDateKeyOffset(deltaDays, baseDate = new Date()) {
    const base = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), baseDate.getUTCDate()))
    base.setUTCDate(base.getUTCDate() + deltaDays)
    return getUtcDateKey(base)
}

function getWindowDateKeys(days, endKey) {
    const keys = []
    for (let offset = days - 1; offset >= 0; offset--) keys.push(shiftUtcDateKey(endKey, -offset))
    return keys
}

function mergeCounts(target, source) {
    if (!source) return
    for (const [key, rawValue] of Object.entries(source)) {
        const value = Number(rawValue || 0)
        if (!value) continue
        target[key] = (target[key] || 0) + value
    }
}

function sortCountsDesc(counts) {
    return Object.entries(counts || {}).sort((a, b) => b[1] - a[1])
}

function aggregateWindow(statsDaily, days, endKey, threshold) {
    const keys = getWindowDateKeys(days, endKey)
    const memberCounts = {}
    const channelCounts = {}
    let totalMessages = 0

    for (const key of keys) {
        const snapshot = statsDaily?.[key]
        if (!snapshot) continue

        totalMessages += Number(snapshot.totalMessages || 0)
        mergeCounts(memberCounts, snapshot.memberCounts)
        mergeCounts(channelCounts, snapshot.channelCounts)
    }

    const activeMemberIds = Object.keys(memberCounts).filter(id => memberCounts[id] >= threshold)

    return {
        keys,
        endKey,
        totalMessages,
        threshold,
        memberCounts,
        channelCounts,
        activeMemberIds,
        activeCount: activeMemberIds.length,
        topMembers: sortCountsDesc(memberCounts),
        topChannels: sortCountsDesc(channelCounts),
    }
}

function buildPeriodSummaries(statsDaily, statsSettings, endKey) {
    const summaries = {}

    for (const periodKey of PERIOD_ORDER) {
        const period = PERIODS[periodKey]
        const threshold = Number(statsSettings?.[period.thresholdKey] || 1)
        const current = aggregateWindow(statsDaily, period.days, endKey, threshold)
        const previous = aggregateWindow(statsDaily, period.days, shiftUtcDateKey(endKey, -period.days), threshold)
        const previousActive = new Set(previous.activeMemberIds)

        summaries[periodKey] = {
            ...current,
            label: period.label,
            periodKey,
            days: period.days,
            newlyActiveMemberIds: current.activeMemberIds.filter(id => !previousActive.has(id)),
        }
        summaries[periodKey].newlyActiveCount = summaries[periodKey].newlyActiveMemberIds.length
    }

    return summaries
}

function createStatsIncrementUpdate(message) {
    const dayKey = getUtcDateKey()
    return {
        $inc: {
            [`statsDaily.${dayKey}.totalMessages`]: 1,
            [`statsDaily.${dayKey}.channelCounts.${message.channel.id}`]: 1,
            [`statsDaily.${dayKey}.memberCounts.${message.author.id}`]: 1,
        }
    }
}

function getStatsRetentionUnset(statsDaily, maxDays = MAX_DAILY_STATS_DAYS) {
    const keys = Object.keys(statsDaily || {}).sort()
    if (keys.length <= maxDays) return null

    const unset = {}
    keys.slice(0, keys.length - maxDays).forEach(key => {
        unset[`statsDaily.${key}`] = ""
    })
    return unset
}

function shouldPostScheduledReport(doc, now = new Date()) {
    const statsSettings = doc?.settings?.stats
    if (!statsSettings?.enabled || !statsSettings.logChannelId) return false

    const reportKey = getUtcDateKeyOffset(-1, now)
    const reportHourUtc = Number(statsSettings.reportHourUtc || 0)
    if (now.getUTCHours() !== reportHourUtc) return false
    if (doc.info?.statsLastReportKey === reportKey) return false

    return true
}

function formatCount(tools, value) {
    return tools.commafy(Math.floor(Number(value || 0)))
}

function buildRankingList(entries, formatter, tools, emptyText) {
    if (!entries?.length) return emptyText

    return entries.slice(0, 5).map(([id, count], index) => {
        return `**${index + 1}.** ${formatter(id)} - **${formatCount(tools, count)}**`
    }).join("\n")
}

function buildPeriodValue(summary, tools) {
    return [
        `Messages: **${formatCount(tools, summary.totalMessages)}**`,
        `Active members: **${formatCount(tools, summary.activeCount)}**`,
        `Newly active: **${formatCount(tools, summary.newlyActiveCount)}**`,
        `Threshold: **${formatCount(tools, summary.threshold)}** message${summary.threshold === 1 ? "" : "s"}`,
    ].join("\n")
}

function buildScheduledStatsEmbed(guild, statsDaily, statsSettings, tools, endKey) {
    const summaries = buildPeriodSummaries(statsDaily, statsSettings, endKey)
    const daily = summaries.daily

    return tools.createEmbed({
        title: "Server Activity Report",
        description: `Rolling activity summary ending on **${endKey}** (UTC).`,
        color: tools.COLOR,
        timestamp: true,
        author: {
            name: guild.name,
            iconURL: guild.iconURL() || undefined,
        },
        fields: [
            { name: "Daily", value: buildPeriodValue(summaries.daily, tools), inline: true },
            { name: "Weekly", value: buildPeriodValue(summaries.weekly, tools), inline: true },
            { name: "Monthly", value: buildPeriodValue(summaries.monthly, tools), inline: true },
            { name: "Quarterly", value: buildPeriodValue(summaries.quarterly, tools), inline: true },
            {
                name: "Top Channels (Daily)",
                value: buildRankingList(daily.topChannels, id => `<#${id}>`, tools, "_No messages recorded._"),
                inline: false
            },
            {
                name: "Top Members (Daily)",
                value: buildRankingList(daily.topMembers, id => `<@${id}>`, tools, "_No messages recorded._"),
                inline: false
            }
        ]
    })
}

function buildPeriodStatsEmbed(guild, statsDaily, statsSettings, tools, periodKey, endKey) {
    const period = PERIODS[periodKey] || PERIODS.daily
    const summaries = buildPeriodSummaries(statsDaily, statsSettings, endKey)
    const summary = summaries[period.key]

    return tools.createEmbed({
        title: `${period.label} Server Stats`,
        description: `Rolling **${period.days}-day** window ending on **${endKey}** (UTC).`,
        color: tools.COLOR,
        timestamp: true,
        author: {
            name: guild.name,
            iconURL: guild.iconURL() || undefined,
        },
        fields: [
            {
                name: `${period.label} Summary`,
                value: buildPeriodValue(summary, tools),
                inline: false,
            },
            {
                name: "Top Channels",
                value: buildRankingList(summary.topChannels, id => `<#${id}>`, tools, "_No messages recorded in this period._"),
                inline: false,
            },
            {
                name: "Top Members",
                value: buildRankingList(summary.topMembers, id => `<@${id}>`, tools, "_No messages recorded in this period._"),
                inline: false,
            }
        ]
    })
}

module.exports = {
    MAX_DAILY_STATS_DAYS,
    PERIODS,
    PERIOD_ORDER,
    aggregateWindow,
    buildPeriodSummaries,
    buildPeriodStatsEmbed,
    buildScheduledStatsEmbed,
    createStatsIncrementUpdate,
    getStatsRetentionUnset,
    getUtcDateKey,
    getUtcDateKeyOffset,
    shouldPostScheduledReport,
    shiftUtcDateKey,
}
