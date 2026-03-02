const Tools = require("./Tools.js")

const RANK_EMOJIS = [
    "<:1_:1477998075535429713>",
    "<:2_:1477998064756326471>",
    "<:3_:1477998056224985190>",
    "<:4_:1477998060780126270>",
    "<:5_:1477998058175205523>",
    "<:6_:1477998062914895925>",
    "<:7_:1477998069587902566>",
    "<:8_:1477998071508893756>",
    "<:9_:1477998073413111979>",
]

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
async function buildActivityLeaderboard(guild, db, limit = 9) {
    const results = await buildActivityLeaderboardInternal(guild, db)
    return results.slice(0, limit)
}

/**
 * Internal logic to compute all rankings.
 */
async function buildActivityLeaderboardInternal(guild, db) {
    const tools = Tools.global
    const usersArray = tools.xpObjToArray(db.users).filter(u => !u.hidden)
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

    if (!candidates.length) return []

    // Fetch members involved
    const memberMap = new Map()
    await Promise.all(candidates.slice(0, 100).map(async ({ id }) => {
        const cached = guild.members.cache.get(id)
        if (cached) { memberMap.set(id, cached); return }
        const fetched = await guild.members.fetch(id).catch(() => null)
        if (fetched) memberMap.set(id, fetched)
    }))

    const results = candidates.map(({ id, rawDiff }) => {
        const member = memberMap.get(id) || null
        let multiplier = 1
        if (member) {
            multiplier = tools.getMultiplier(member, db.settings, null).multiplier || 1
        }
        return { id, activityXP: Math.floor(rawDiff / multiplier), member }
    })
    .filter(r => r.activityXP > 0)
    .sort((a, b) => b.activityXP - a.activityXP)

    return results
}

/**
 * Shared function to generate the activity leaderboard embed.
 * 
 * @param {import("discord.js").Guild} guild
 * @param {object} db  Full guild document
 * @param {object} tools Global tools
 * @param {string|null} highlightId User ID to highlight (slash command use case)
 * @param {boolean} showWinner Whether to show the "winner" line (auto-post use case)
 * @param {string|null} commandUserId The ID of the user who ran the command
 * @returns {Promise<import("discord.js").EmbedBuilder>}
 */
async function generateLeaderboardEmbed(guild, db, tools, highlightId = null, showWinner = false, commandUserId = null) {
    const settings = db.settings.activityLeaderboard
    if (!settings?.enabled) return null

    const rankings = await buildActivityLeaderboard(guild, db)

    const intervalHours = snapInterval(settings.interval || 24)
    const nextPost = nextAnchorUnix(Date.now(), intervalHours)
    const _d = new Date()
    const nextMidnight = Math.floor(Date.UTC(_d.getUTCFullYear(), _d.getUTCMonth(), _d.getUTCDate() + 1) / 1000)

    const postLine = `\n\n<:progress:1466819928110792816> Next reward <t:${nextPost}:R>\n<:userxp:1466822701724340304> XP resets <t:${nextMidnight}:R>`

    let description
    if (!rankings.length) {
        description = "<:info:1466817220687695967> No activity recorded today yet! Members need to chat or be in voice to appear here." + postLine
    } else {
        description = rankings.map((entry, i) => {
            const rankEmoji = RANK_EMOJIS[i]
            const isHighlight = entry.id === highlightId
            const line = `${rankEmoji} <@${entry.id}> — **${tools.commafy(entry.activityXP)}** Daily XP`
            return isHighlight ? `__${line}__` : line
        }).join("\n")

        // Winner line for auto-post results
        if (showWinner) {
            const topCredits = settings.topCredits || 0
            const topRoleId  = settings.topRoleId  || ""
            if (rankings[0] && (topCredits > 0 || topRoleId)) {
                 description += `\n\n<:star:1475076863809294397> <@${rankings[0].id}> wins this interval's reward!`
            }
        }

        description += postLine
    }

    // If requested member is outside top 9, append their position
    let outsiderLine = ""
    if (highlightId && !rankings.find(r => r.id === highlightId)) {
        outsiderLine = `\n\n<:info:1466817220687695967> *<@${highlightId}> is not in the top 9 today.*`
    }

    // Append command user's position if applicable
    if (commandUserId) {
        // Need full rankings to find position if > 9
        const fullRankings = await buildActivityLeaderboardInternal(guild, db)
        const pos = fullRankings.findIndex(r => r.id === commandUserId)
        
        // Only show if user is NOT in the top 9 already
        if (pos >= 9) {
            const entry = fullRankings[pos]
            const rank = pos + 1
            // ... (rest of emoji logic or simple text)
            outsiderLine += `\n\n<@${commandUserId}> your place is **#${rank}** with **${tools.commafy(entry.activityXP)}** Daily XP`
        }
    }

    const embed = tools.createEmbed({
        color: tools.COLOR,
        author: {
            name: `Activity Leaderboard — ${guild.name}`,
            iconURL: guild.iconURL()
        },
        description: description + outsiderLine
    })

    const topCredits = settings.topCredits || 0
    const topRoleId  = settings.topRoleId  || ""
    if (topCredits > 0 || topRoleId) {
        const rewardParts = []
        if (topCredits > 0) rewardParts.push(`<:extendedend:1466819484999225579><:gold:1472934905972527285> **${tools.commafy(topCredits)}** credits`)
        if (topRoleId)      rewardParts.push(`<:extendedend:1466819484999225579><@&${topRoleId}>`)
        embed.addFields([{ name: "<:info:1466817220687695967> Top User Reward", value: rewardParts.join("  ·  "), inline: false }])
    }

    return embed
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

module.exports = { buildActivityLeaderboard, generateLeaderboardEmbed, nextAnchorUnix, isDue, snapInterval }
