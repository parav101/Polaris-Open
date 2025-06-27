const PageEmbed = require("../../classes/PageEmbed.js")

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

    let db = await tools.fetchAll()
    if (!db || !db.users || !Object.keys(db.users).length) return tools.warn(`Nobody in this server is ranked yet!`);
    else if (!db.settings.enabled) return tools.warn("*xpDisabled")
    else if (!db.settings.streak?.enabled) return tools.warn("Streaks are not enabled in this server!" + (tools.canManageServer(int.member) ? ` (enable with ${tools.commandTag("config")})` : ""))

    let pageNumber = int.options.get("page")?.value || 1
    let pageSize = 10
    let streakType = int.options.get("type")?.value || "current"

    // Convert users object to array and filter for users with streak data
    let rankings = tools.xpObjToArray(db.users)
    rankings = rankings.filter(x => x.streak && !x.hidden).map(user => ({
        id: user.id,
        currentStreak: user.streak.count || 0,
        highestStreak: user.streak.highest || user.streak.count || 0,
        lastClaim: user.streak.lastClaim || 0
    }))

    // Sort by the selected streak type
    if (streakType === "highest") {
        rankings = rankings.filter(x => x.highestStreak > 0).sort((a, b) => b.highestStreak - a.highestStreak)
    } else {
        rankings = rankings.filter(x => x.currentStreak > 0).sort((a, b) => b.currentStreak - a.currentStreak)
    }

    if (!rankings.length) return tools.warn("Nobody in this server has any streaks yet!")

    let highlight = null
    let userSearch = int.options.get("user") || int.options.get("member")
    if (userSearch) {
        let foundRanking = rankings.findIndex(x => x.id == userSearch.user.id)
        if (isNaN(foundRanking) || foundRanking < 0) return tools.warn(int.user.id == userSearch.user.id ? "You aren't on the streak leaderboard!" : "This member isn't on the streak leaderboard!")
        else pageNumber = Math.floor(foundRanking / pageSize) + 1
        highlight = userSearch.user.id
    }

    let listCol = db.settings.leaderboard?.embedColor
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

    let isHidden = db.settings.leaderboard?.ephemeral || !!int.options.get("hidden")?.value

    let streakEmbed = new PageEmbed(embed, rankings, {
        page: pageNumber, size: pageSize, owner: int.user.id, ephemeral: isHidden,
        mapFunction: (x, y, p) => {
            let streakValue = streakType === "highest" ? x.highestStreak : x.currentStreak
            
            // Format last claim time for current streaks
            let timeInfo = ""
            if (streakType === "current" && x.lastClaim) {
                let daysSinceLastClaim = Math.floor((Date.now() - x.lastClaim) / (24 * 60 * 60 * 1000))
                if (daysSinceLastClaim === 0) {
                    timeInfo = " (active today)"
                } else if (daysSinceLastClaim === 1) {
                    timeInfo = " (1 day ago)"
                } else if (daysSinceLastClaim > 1) {
                    timeInfo = ` (${daysSinceLastClaim} days ago)`
                }
            }
            
            return `**${p})** ${x.id == highlight ? "**" : ""}${tools.commafy(streakValue)} day${streakValue !== 1 ? "s" : ""} - <@${x.id}>${timeInfo}${x.id == highlight ? "**" : ""}`
        }
    })
    
    if (!streakEmbed.data.length) return tools.warn("There are no members on this page!")

    streakEmbed.post(int)

}}
