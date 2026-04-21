const PageEmbed = require("../../classes/PageEmbed.js")

module.exports = {
    metadata: {
        name: "coinflipleaderboard",
        description: "View the server's longest coinflip winning streaks.",
        args: [
            { type: "integer", name: "page", description: "Which page to view", required: false },
            { type: "user", name: "member", description: "Finds a certain member's position on the coinflip leaderboard (overrides page)", required: false },
            { type: "bool", name: "hidden", description: "Hides the reply so only you can see it", required: false }
        ]
    },

    async run(client, int, tools) {
        let peek = await tools.fetchSettings(int.user.id)
        let deferEphemeral = !!int.options.get("hidden")?.value || !!(peek?.settings?.leaderboard?.ephemeral)
        if (!int.deferred && !int.replied) await int.deferReply({ ephemeral: deferEphemeral })

        let db = await tools.fetchAll()
        if (!db || !db.users || !Object.keys(db.users).length) return tools.warn(`Nobody in this server is ranked yet!`);
        else if (!db.settings.enabled) return tools.warn("*xpDisabled")

        let pageNumber = int.options.get("page")?.value || 1
        let pageSize = 10

        let rankings = tools.xpObjToArray(db.users)
        
        // Filter out those with no coinflip highest streak
        rankings = rankings.filter(x => x.coinflipHighestStreak > 0 && !x.hidden).sort(function(a, b) {return (b.coinflipHighestStreak || 0) - (a.coinflipHighestStreak || 0)})

        if (db.settings.leaderboard.maxEntries > 0) rankings = rankings.slice(0, db.settings.leaderboard.maxEntries)

        if (!rankings.length) return tools.warn("Nobody has a coinflip streak in this server yet!")

        let highlight = null
        let userSearch = int.options.get("member") 
        if (userSearch) {
            let foundRanking = rankings.findIndex(x => x.id == userSearch.user.id)
            if (isNaN(foundRanking) || foundRanking < 0) return tools.warn(int.user.id == userSearch.user.id ? "You aren't on the coinflip streak leaderboard!" : "This member isn't on the coinflip streak leaderboard!")
            else pageNumber = Math.floor(foundRanking / pageSize) + 1
            highlight = userSearch.user.id
        }

        let listCol = db.settings.leaderboard.embedColor
        if (listCol == -1) listCol = null
        
        let embed = tools.createEmbed({
            color: listCol || tools.COLOR,
            author: {
                name: `Coinflip Streak Leaderboard for ${int.guild.name}`,
                iconURL: int.guild.iconURL()
            }
        });

        let isHidden = db.settings.leaderboard.ephemeral || !!int.options.get("hidden")?.value

        let embedPage = new PageEmbed(embed, rankings, {
            page: pageNumber, size: pageSize, owner: int.user.id, ephemeral: isHidden,
            mapFunction: (x, y, p) => `**${p})** ${x.id == highlight ? "**" : ""}<@${x.id}> - ${tools.commafy(Math.floor(x.coinflipHighestStreak || 0))} Streak${Math.floor(x.coinflipHighestStreak||0) == 1 ? "" : "s"}${x.id == highlight ? "**" : ""}`
        })
        
        if (!embedPage.data.length) return tools.warn("There are no members on this page!")

        await embedPage.post(int)
    }
}