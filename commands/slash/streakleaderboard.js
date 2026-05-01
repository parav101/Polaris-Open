const PageEmbed = require("../../classes/PageEmbed.js")
const logger = require("../../classes/Logger.js")

module.exports = {
metadata: {
    name: "streakleaderboard",
    description: "View the server's streak leaderboard.",
    args: [
        { type: "integer", name: "page", description: "Which page to view (negative to start from last page)", required: false },
        { type: "user", name: "member", description: "Finds a certain member's position on the streak leaderboard (overrides page)", required: false },
        { type: "bool", name: "hidden", description: "Hides the reply so only you can see it", required: false },
        { type: "string", name: "type", description: "Type of streak leaderboard", required: false, choices: [
            { name: "Current Streak", value: "current" },
            { name: "Highest Streak", value: "highest" }
        ]}
    ]
},

async run(client, int, tools) {
    const cmdStart = Date.now()
    const perfMeta = { command: "streakleaderboard", guildId: int.guild.id, userId: int.user.id, shardId: client.shard?.id ?? null }

    const streakType = int.options.get("type")?.value || "current"
    const sortKey = streakType === "highest" ? "streakHighest" : "streakCurrent"

    // Fetch settings and sorted stats in parallel
    const settingsPromise = tools.fetchSettings()
    const rankingsPromise = client.userStats.fetchAllSorted(int.guild.id, sortKey)

    let peek = await settingsPromise
    let deferEphemeral = !!int.options.get("hidden")?.value || !!(peek?.settings?.leaderboard?.ephemeral)
    if (!int.deferred && !int.replied) await int.deferReply({ ephemeral: deferEphemeral })

    const fetchStart = Date.now()
    let rankings = await rankingsPromise
    logger.perf("streakleaderboard.fetch", Date.now() - fetchStart, { ...perfMeta, usersCount: rankings.length, source: "user_stats" })

    if (!rankings.length) return tools.warn(`Nobody in this server is ranked yet!`)
    if (!peek.settings.enabled) return tools.warn("*xpDisabled")
    if (!peek.settings.streak?.enabled) return tools.warn("Streaks are not enabled in this server!" + (tools.canManageServer(int.member) ? ` (enable with ${tools.commandTag("config")})` : ""))

    let pageNumber = int.options.get("page")?.value || 1
    let pageSize = 10

    // For current streaks: filter to users who claimed within the last 1 day
    const sortStart = Date.now()
    if (streakType === "current") {
        rankings = rankings.filter(user => {
            if (!user.lastClaim) return false
            const daysSince = Math.floor((Date.now() - user.lastClaim) / (24 * 60 * 60 * 1000))
            return daysSince <= 1
        })
    }
    logger.perf("streakleaderboard.sort", Date.now() - sortStart, { ...perfMeta, resultCount: rankings.length, streakType })

    if (!rankings.length) return tools.warn("Nobody in this server has any streaks yet!")

    let highlight = null
    let userSearch = int.options.get("user") || int.options.get("member")
    if (userSearch) {
        let foundRanking = rankings.findIndex(x => x.id == userSearch.user.id)
        if (isNaN(foundRanking) || foundRanking < 0) return tools.warn(int.user.id == userSearch.user.id ? "You aren't on the streak leaderboard!" : "This member isn't on the streak leaderboard!")
        else pageNumber = Math.floor(foundRanking / pageSize) + 1
        highlight = userSearch.user.id
    }

    let listCol = peek.settings.leaderboard?.embedColor
    if (listCol == -1) listCol = null

    let embed = tools.createEmbed({
        color: listCol || tools.COLOR,
        author: {
            name: `${streakType === "highest" ? "Highest" : "Current"} Streak Leaderboard for ${int.guild.name}`,
            iconURL: int.guild.iconURL()
        },
        description: streakType === "highest" ?
            "Showing members' all-time highest streaks" :
            "Showing members' current active streaks",
        footer: {
            text: `${tools.commafy(rankings.length)} member${rankings.length !== 1 ? "s" : ""} with streaks`
        }
    })

    let isHidden = peek.settings.leaderboard?.ephemeral || !!int.options.get("hidden")?.value

    let streakEmbed = new PageEmbed(embed, rankings, {
        page: pageNumber, size: pageSize, owner: int.user.id, ephemeral: isHidden,
        mapFunction: (x, y, p) => {
            let streakValue = streakType === "highest" ? x.streakHighest : x.streakCurrent

            let timeInfo = ""
            if (streakType === "current" && x.lastClaim) {
                let daysSince = Math.floor((Date.now() - x.lastClaim) / (24 * 60 * 60 * 1000))
                if (daysSince === 0) timeInfo = " (active today)"
                else if (daysSince === 1) timeInfo = " (1 day ago)"
            }

            return `**${p})** ${x.id == highlight ? "**" : ""}${tools.commafy(streakValue)} day${streakValue !== 1 ? "s" : ""} - <@${x.id}>${timeInfo}${x.id == highlight ? "**" : ""}`
        }
    })

    if (!streakEmbed.data.length) return tools.warn("There are no members on this page!")

    const renderStart = Date.now()
    await streakEmbed.post(int)
    logger.perf("streakleaderboard.render", Date.now() - renderStart, { ...perfMeta, page: pageNumber, pageSize, streakType })
    logger.perf("streakleaderboard.total", Date.now() - cmdStart, { ...perfMeta, page: pageNumber, resultCount: rankings.length, streakType })
}}
