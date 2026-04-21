const { generateLeaderboardEmbed } = require("../../classes/ActivityLeaderboard.js")

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
    const isHidden = !!int.options.get("hidden")?.value
    await int.deferReply({ ephemeral: isHidden })

    let db = await tools.fetchAll(int.guild.id)

    if (!db || !db.users || !Object.keys(db.users).length) {
        return int.editReply({ content: "Nobody in this server is ranked yet!" })
    }
    if (!db.settings.enabled) {
        return int.editReply({ content: tools.errors.xpDisabled })
    }
    if (!db.settings.activityLeaderboard?.enabled) {
        return int.editReply({ content: "The activity leaderboard is not enabled in this server!" })
    }

    // Determine highlight
    const highlightUser = int.options.get("user") || int.options.get("member")
    const highlightId = highlightUser?.user?.id || null

    const embed = await generateLeaderboardEmbed(int.guild, db, tools, highlightId, false, int.user.id)

    if (!embed) {
        return int.editReply({ content: "Failed to generate leaderboard." })
    }

    await int.editReply({ embeds: [embed] })
}}
