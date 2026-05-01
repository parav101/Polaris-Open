const { generateLeaderboardEmbed } = require("../../classes/ActivityLeaderboard.js")
const logger = require("../../classes/Logger.js")

module.exports = {
metadata: {
    name: "activityleaderboard",
    description: "View the top 9 most active members today.",
    args: [
        { type: "user", name: "member", description: "Highlight a specific member's position", required: false },
        { type: "bool", name: "hidden", description: "Hides the reply so only you can see it", required: false }
    ]
},

async run(client, int, tools) {
    const cmdStart = Date.now()
    const perfMeta = { command: "activityleaderboard", guildId: int.guild.id, userId: int.user.id, shardId: client.shard?.id ?? null }
    const isHidden = !!int.options.get("hidden")?.value
    await int.deferReply({ ephemeral: isHidden })

    // Fetch settings and today's active users in parallel
    const settingsPromise = tools.fetchSettings()
    const rankingsPromise = client.userStats.fetchAllSorted(int.guild.id, "activityXpAccumulated", { activeOnly: true })

    const fetchStart = Date.now()
    const [settings, statsUsers] = await Promise.all([settingsPromise, rankingsPromise])
    logger.perf("activityleaderboard.fetch", Date.now() - fetchStart, { ...perfMeta, usersCount: statsUsers.length, source: "user_stats" })

    if (!settings.settings.enabled) return int.editReply({ content: tools.errors.xpDisabled })
    if (!settings.settings.activityLeaderboard?.enabled) return int.editReply({ content: "The activity leaderboard is not enabled in this server!" })
    if (!statsUsers.length) return int.editReply({ content: "Nobody in this server is ranked yet!" })

    // Build a slim db-compatible object so generateLeaderboardEmbed works unchanged
    const usersMap = {}
    for (const u of statsUsers) {
        usersMap[u.id] = {
            xp:                    u.xp,
            hidden:                u.hidden,
            activityXpAccumulated: u.activityXpAccumulated,
            lastDailyUpdate:       u.lastDailyUpdate,
        }
    }
    const slimDb = { users: usersMap, settings: settings.settings }

    // Determine highlight
    const highlightUser = int.options.get("user") || int.options.get("member")
    const highlightId = highlightUser?.user?.id || null

    const renderStart = Date.now()
    const embed = await generateLeaderboardEmbed(int.guild, slimDb, tools, highlightId, false, int.user.id)

    if (!embed) return int.editReply({ content: "Failed to generate leaderboard." })

    await int.editReply({ embeds: [embed] })
    logger.perf("activityleaderboard.render", Date.now() - renderStart, perfMeta)
    logger.perf("activityleaderboard.total", Date.now() - cmdStart, perfMeta)
}}
