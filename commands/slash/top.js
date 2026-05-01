const PageEmbed = require("../../classes/PageEmbed.js")
const logger = require("../../classes/Logger.js")

module.exports = {
metadata: {
    name: "leaderboard",
    description: "View the server's XP leaderboard (shows active members by default).",
    args: [
        { type: "integer", name: "page", description: "Which page to view (negative to start from last page)", required: false },
        { type: "user", name: "member", description: "Finds a certain member's position on the leaderboard (overrides page)", required: false },
        { type: "bool", name: "active_only", description: "Show only the active users ", required: false },
        { type: "bool", name: "hidden", description: "Hides the reply so only you can see it", required: false }
    ]
},

async run(client, int, tools) {
    const cmdStart = Date.now()
    const perfMeta = { command: "leaderboard", guildId: int.guild.id, userId: int.user.id, shardId: client.shard?.id ?? null }

    let lbLink = `${tools.WEBSITE}/leaderboard/${int.guild.id}`

    // Fetch settings and sorted stats in parallel
    const settingsPromise = tools.fetchSettings()
    const rankingsPromise = client.userStats.fetchAllSorted(int.guild.id, "xp")

    let peek = await settingsPromise
    let deferEphemeral = !!int.options.get("hidden")?.value || !!(peek?.settings?.leaderboard?.ephemeral)
    if (!int.deferred && !int.replied) await int.deferReply({ ephemeral: deferEphemeral })

    const fetchStart = Date.now()
    let rankings = await rankingsPromise
    logger.perf("leaderboard.fetch", Date.now() - fetchStart, { ...perfMeta, usersCount: rankings.length, source: "user_stats" })

    if (!rankings.length) return tools.warn(`Nobody in this server is ranked yet!`)
    if (!peek.settings.enabled) return tools.warn("*xpDisabled")
    if (peek.settings.leaderboard.disabled) return tools.warn("The leaderboard is disabled in this server!" + (tools.canManageServer(int.member) ? ` As a moderator, you can still privately view the leaderboard here: ${lbLink}` : ""))

    let pageNumber = int.options.get("page")?.value || 1
    let pageSize = 10

    let minLeaderboardXP = peek.settings.leaderboard.minLevel > 1 ? tools.xpForLevel(peek.settings.leaderboard.minLevel, peek.settings) : 0

    const sortStart = Date.now()
    const active_only = int.options.get("active_only")?.value || false
    if (active_only) rankings = rankings.filter(u => tools.isUserActive(u))
    if (minLeaderboardXP > 0) rankings = rankings.filter(x => x.xp > minLeaderboardXP)
    if (peek.settings.leaderboard.maxEntries > 0) rankings = rankings.slice(0, peek.settings.leaderboard.maxEntries)
    logger.perf("leaderboard.sort", Date.now() - sortStart, { ...perfMeta, resultCount: rankings.length, activeOnly: active_only })

    if (!rankings.length) return tools.warn("Nobody in this server is on the leaderboard yet!")

    let highlight = null
    let userSearch = int.options.get("user") || int.options.get("member")
    if (userSearch) {
        let foundRanking = rankings.findIndex(x => x.id == userSearch.user.id)
        if (isNaN(foundRanking) || foundRanking < 0) return tools.warn(int.user.id == userSearch.user.id ? "You aren't on the leaderboard!" : "This member isn't on the leaderboard!")
        else pageNumber = Math.floor(foundRanking / pageSize) + 1
        highlight = userSearch.user.id
    }

    let listCol = peek.settings.leaderboard.embedColor
    if (listCol == -1) listCol = null

    let embed = tools.createEmbed({
        color: listCol || tools.COLOR,
        author: {
            name: `Leaderboard for ${int.guild.name}${active_only ? " (Active Only)" : ""}`,
            iconURL: int.guild.iconURL()
        }
    })

    let isHidden = peek.settings.leaderboard.ephemeral || !!int.options.get("hidden")?.value

    let xpEmbed = new PageEmbed(embed, rankings, {
        page: pageNumber, size: pageSize, owner: int.user.id, ephemeral: isHidden,
        mapFunction: (x, y, p) => `**${p})** ${x.id == highlight ? "**" : ""}Lv. ${tools.getLevel(x.xp, peek.settings)} - <@${x.id}> (${tools.commafy(x.xp)} XP)${x.id == highlight ? "**" : ""}`,
        extraButtons: [
            tools.button({style: "Link", label: "Online Leaderboard", url: lbLink}),
        ]
    })
    if (!xpEmbed.data.length) return tools.warn("There are no members on this page!")

    const renderStart = Date.now()
    await xpEmbed.post(int)
    logger.perf("leaderboard.render", Date.now() - renderStart, { ...perfMeta, page: pageNumber, pageSize })
    logger.perf("leaderboard.total", Date.now() - cmdStart, { ...perfMeta, page: pageNumber, resultCount: rankings.length })
}}
