const PageEmbed = require("../../classes/PageEmbed.js")
const logger = require("../../classes/Logger.js")

module.exports = {
    metadata: {
        name: "creditleaderboard",
        description: "View the server's credit leaderboard.",
        args: [
            { type: "integer", name: "page", description: "Which page to view", required: false },
            { type: "user", name: "member", description: "Finds a certain member's position on the credit leaderboard (overrides page)", required: false },
            { type: "bool", name: "hidden", description: "Hides the reply so only you can see it", required: false }
        ]
    },

    async run(client, int, tools) {
        const cmdStart = Date.now()
        const perfMeta = { command: "creditleaderboard", guildId: int.guild.id, userId: int.user.id, shardId: client.shard?.id ?? null }

        // Fetch settings and sorted stats in parallel
        const settingsPromise = tools.fetchSettings(int.user.id)
        const rankingsPromise = client.userStats.fetchAllSorted(int.guild.id, "credits")

        let peek = await settingsPromise
        let deferEphemeral = !!int.options.get("hidden")?.value || !!(peek?.settings?.leaderboard?.ephemeral)
        if (!int.deferred && !int.replied) await int.deferReply({ ephemeral: deferEphemeral })

        const fetchStart = Date.now()
        let rankings = await rankingsPromise
        logger.perf("creditleaderboard.fetch", Date.now() - fetchStart, { ...perfMeta, usersCount: rankings.length, source: "user_stats" })

        if (!rankings.length) return tools.warn(`Nobody in this server is ranked yet!`)
        if (!peek.settings.enabled) return tools.warn("*xpDisabled")

        let pageNumber = int.options.get("page")?.value || 1
        let pageSize = 10

        const sortStart = Date.now()
        if (peek.settings.leaderboard.maxEntries > 0) rankings = rankings.slice(0, peek.settings.leaderboard.maxEntries)
        logger.perf("creditleaderboard.sort", Date.now() - sortStart, { ...perfMeta, resultCount: rankings.length })

        if (!rankings.length) return tools.warn("Nobody has any credits in this server yet!")

        let highlight = null
        let userSearch = int.options.get("member")
        if (userSearch) {
            let foundRanking = rankings.findIndex(x => x.id == userSearch.user.id)
            if (isNaN(foundRanking) || foundRanking < 0) return tools.warn(int.user.id == userSearch.user.id ? "You aren't on the credit leaderboard!" : "This member isn't on the credit leaderboard!")
            else pageNumber = Math.floor(foundRanking / pageSize) + 1
            highlight = userSearch.user.id
        }

        let listCol = peek.settings.leaderboard.embedColor
        if (listCol == -1) listCol = null

        let embed = tools.createEmbed({
            color: listCol || tools.COLOR,
            author: {
                name: `Credit Leaderboard for ${int.guild.name}`,
                iconURL: int.guild.iconURL()
            }
        })

        let isHidden = peek.settings.leaderboard.ephemeral || !!int.options.get("hidden")?.value

        let embedPage = new PageEmbed(embed, rankings, {
            page: pageNumber, size: pageSize, owner: int.user.id, ephemeral: isHidden,
            mapFunction: (x, y, p) => `**${p})** ${x.id == highlight ? "**" : ""}<@${x.id}> - ${tools.commafy(Math.floor(x.credits || 0))} Credit${Math.floor(x.credits || 0) == 1 ? "" : "s"}${x.id == highlight ? "**" : ""}`
        })

        if (!embedPage.data.length) return tools.warn("There are no members on this page!")

        const renderStart = Date.now()
        await embedPage.post(int)
        logger.perf("creditleaderboard.render", Date.now() - renderStart, { ...perfMeta, page: pageNumber, pageSize })
        logger.perf("creditleaderboard.total", Date.now() - cmdStart, { ...perfMeta, page: pageNumber, resultCount: rankings.length })
    }
}
