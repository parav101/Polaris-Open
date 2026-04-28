const PageEmbed = require("../../classes/PageEmbed.js")

module.exports = {
    metadata: {
        name: "creditleaderboard", // the user requested a credit leaderboard command
        description: "View the server's credit leaderboard.",
        args: [
            { type: "integer", name: "page", description: "Which page to view", required: false },
            { type: "user", name: "member", description: "Finds a certain member's position on the credit leaderboard (overrides page)", required: false },
            { type: "bool", name: "hidden", description: "Hides the reply so only you can see it", required: false }
        ]
    },

    async run(client, int, tools) {
        const peekPromise = tools.fetchSettings(int.user.id) // fetching partial first for ephemeral check
        const dbPromise = tools.fetchAll()
        let peek = await peekPromise
        let deferEphemeral = !!int.options.get("hidden")?.value || !!(peek?.settings?.leaderboard?.ephemeral)
        if (!int.deferred && !int.replied) await int.deferReply({ ephemeral: deferEphemeral })

        let db = await dbPromise
        if (!db || !db.users || !Object.keys(db.users).length) return tools.warn(`Nobody in this server is ranked yet!`);
        else if (!db.settings.enabled) return tools.warn("*xpDisabled")

        let pageNumber = int.options.get("page")?.value || 1
        let pageSize = 10

        let rankings = tools.xpObjToArray(db.users)
        
        // Filter out those with no credits
        rankings = rankings.filter(x => x.credits > 0 && !x.hidden).sort(function(a, b) {return (b.credits || 0) - (a.credits || 0)})

        if (db.settings.leaderboard.maxEntries > 0) rankings = rankings.slice(0, db.settings.leaderboard.maxEntries)

        if (!rankings.length) return tools.warn("Nobody has any credits in this server yet!")

        let highlight = null
        let userSearch = int.options.get("member") 
        if (userSearch) {
            let foundRanking = rankings.findIndex(x => x.id == userSearch.user.id)
            if (isNaN(foundRanking) || foundRanking < 0) return tools.warn(int.user.id == userSearch.user.id ? "You aren't on the credit leaderboard!" : "This member isn't on the credit leaderboard!")
            else pageNumber = Math.floor(foundRanking / pageSize) + 1
            highlight = userSearch.user.id
        }

        let listCol = db.settings.leaderboard.embedColor
        if (listCol == -1) listCol = null
        
        let embed = tools.createEmbed({
            color: listCol || tools.COLOR,
            author: {
                name: `Credit Leaderboard for ${int.guild.name}`,
                iconURL: int.guild.iconURL()
            }
        });

        let isHidden = db.settings.leaderboard.ephemeral || !!int.options.get("hidden")?.value

        let embedPage = new PageEmbed(embed, rankings, {
            page: pageNumber, size: pageSize, owner: int.user.id, ephemeral: isHidden,
            mapFunction: (x, y, p) => `**${p})** ${x.id == highlight ? "**" : ""}<@${x.id}> - ${tools.commafy(Math.floor(x.credits || 0))} Credit${Math.floor(x.credits||0) == 1 ? "" : "s"}${x.id == highlight ? "**" : ""}`
        })
        
        if (!embedPage.data.length) return tools.warn("There are no members on this page!")

        await embedPage.post(int)
    }
}