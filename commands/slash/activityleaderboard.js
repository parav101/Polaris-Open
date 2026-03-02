const { buildActivityLeaderboard, nextAnchorUnix, snapInterval } = require("../../classes/ActivityLeaderboard.js")

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

    let db = await tools.fetchAll()
    if (!db || !db.users || !Object.keys(db.users).length)
        return int.editReply({ content: "Nobody in this server is ranked yet!" })
    if (!db.settings.enabled)
        return int.editReply({ content: tools.errors.xpDisabled })
    if (!db.settings.activityLeaderboard?.enabled)
        return int.editReply({ content: "The activity leaderboard is not enabled in this server!" })

    const rankings = await buildActivityLeaderboard(int.guild, db)

    const intervalHours = snapInterval(db.settings.activityLeaderboard.interval || 24)
    const nextPost = nextAnchorUnix(Date.now(), intervalHours)
    const _d = new Date()
    const nextMidnight = Math.floor(Date.UTC(_d.getUTCFullYear(), _d.getUTCMonth(), _d.getUTCDate() + 1) / 1000)

    if (!rankings.length) {
        return int.editReply({
            content: `<:info:1466817220687695967> No activity recorded today yet! Members need to chat or be in voice to appear here. Next post: <t:${nextPost}:R>.`
        })
    }

    // Determine highlight
    const highlightUser = int.options.get("user") || int.options.get("member")
    const highlightId = highlightUser?.user?.id || null

    const lines = rankings.map((entry, i) => {
        const rankEmoji = RANK_EMOJIS[i]
        const isHighlight = entry.id === highlightId
        const line = `${rankEmoji} <@${entry.id}> — **${tools.commafy(entry.activityXP)}** <:userxp:1466822701724340304>`
        return isHighlight ? `__${line}__` : line
    })

    // If requested member is outside top 9, append their position
    let outsiderLine = ""
    if (highlightId && !rankings.find(r => r.id === highlightId)) {
        outsiderLine = `\n\n<:info:1466817220687695967> *<@${highlightId}> is not in the top 9 today.*`
    }

    const postLine = `\n\n<:progress:1466819928110792816> Next reward <t:${nextPost}:R>\n<:userxp:1466822701724340304> XP resets <t:${nextMidnight}:R>`

    const embed = tools.createEmbed({
        color: tools.COLOR,
        author: {
            name: `Activity Leaderboard — ${int.guild.name}`,
            iconURL: int.guild.iconURL()
        },
        description: lines.join("\n") + outsiderLine + postLine
    })

    // Show top reward info if configured
    const topCredits = db.settings.activityLeaderboard.topCredits || 0
    const topRoleId  = db.settings.activityLeaderboard.topRoleId  || ""
    if (topCredits > 0 || topRoleId) {
        const rewardParts = []
        if (topCredits > 0) rewardParts.push(`<:extendedend:1466819484999225579><:gold:1472934905972527285> **${tools.commafy(topCredits)}** credits`)
        if (topRoleId)      rewardParts.push(`<:extendedend:1466819484999225579><@&${topRoleId}>`)
        embed.addFields([{ name: "<:info:1466817220687695967> Top User Reward", value: rewardParts.join("  ·  "), inline: false }])
    }

    await int.editReply({ embeds: [embed] })
}}
