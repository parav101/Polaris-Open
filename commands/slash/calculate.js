const { settings } = require("../../database_schema")
const multiplierModes = require("../../json/multiplier_modes.json")

module.exports = {
metadata: {
    name: "calculate",
    description: "Check how much XP you need to reach a certain level.",
    args: [
        { type: "integer", name: "target", description: "The desired level", min: 1, max: 1000, required: false },
        { type: "user", name: "member", description: "Which member to check", required: false }
    ]
},

async run(client, int, tools) {

    let member = int.member
    let foundUser = int.options.get("member") 
    if (foundUser) member = foundUser.member

    let db = await tools.fetchSettings(member.id)
    if (!db) return tools.warn("*noData")
    let targetLevel = Math.min(int.options.get("target")?.value || (tools.getLevel(db.users[member.id]?.xp || 0, db.settings) + 1), db.settings.maxLevel)
    let targetXP = tools.xpForLevel(targetLevel, db.settings)
    
    let cardCol = db.settings.rankCard.embedColor
    if (cardCol == -1) cardCol = null

    if (db.settings.rankCard.disabled) {
        let miniEmbed = tools.createEmbed({
            title: `${tools.commafy(targetLevel)}`,
            color: cardCol || member.displayColor || await member.user.fetch().then(x => x.accentColor),
            description: `${tools.commafy(targetXP)} XP required`,
            footer: "Rank cards are disabled, so calculations are hidden!"
        })
        return int.reply({embeds: [miniEmbed]})
    }

    let currentXP = db.users[member.id]
    if (!currentXP || !currentXP.xp) return tools.noXPYet(foundUser ? foundUser.user : int.user)
    let xp = currentXP.xp
    let userLevel = tools.getLevel(xp, db.settings)
    
    let levelData = tools.getLevel(xp, db.settings, true)       // get user's level
    let maxLevel = levelData.level >= db.settings.maxLevel      // check if level is maxxed

    let remaining = targetXP - xp
    let reached = remaining <= 0
    let levelPercent = maxLevel ? 100 : (xp - levelData.previousLevel) / (levelData.xpRequired - levelData.previousLevel) * 100

    let barSize = 33    // how many characters the xp bar is
    let barRepeat = Math.round(levelPercent / (100 / barSize)) // .round() so bar can sometimes display as completely full and completely empty
    let progressBar = `${"▓".repeat(barRepeat)}${"░".repeat(barSize - barRepeat)} (${!maxLevel ? Number(levelPercent.toFixed(2)) + "%" : "MAX"})`

    if (targetLevel == userLevel && userLevel >= db.settings.maxLevel) progressBar += `\n🎉 You reached the maximum level${db.settings.maxLevel < 1000 ? " in this server" : ""}! Congratulations!`

    let multiplierData = tools.getMultiplier(member, db.settings)
    let multiplier = multiplierData.multiplier || multiplierData.role
    if (multiplier <= 0) return int.reply("Your multiplier prevents you from gaining any XP!")

    let estimatedMin = Math.ceil(remaining / (db.settings.gain.min * multiplier))
    let estimatedMax = Math.ceil(remaining / (db.settings.gain.max * multiplier))
    let estimatedAvg = Math.round((estimatedMax + estimatedMin) / 2)
    let estimatedTime = estimatedAvg * db.settings.gain.time

    let estimatedRange = (estimatedMax == estimatedMin) ? `${tools.commafy(estimatedMax,true)}` : `${tools.commafy(estimatedMax,true)} - ${tools.commafy(estimatedMin,true)}`

    let levelDetails = [
        // `**Current XP: **${tools.commafy(xp)} (Level ${tools.commafy(userLevel)})`,
        // `**Target XP: **${tools.commafy(targetXP)}`,
        `**XP REQUIRED: **${reached? "0 (" : ""}${tools.commafy(targetXP - xp)}${reached ? ")" : ""}`
    ]

    if (!reached) levelDetails = levelDetails.concat([
        "",
        `**XP range: **${db.settings.gain.min == db.settings.gain.max ? tools.commafy(Math.round(db.settings.gain.min * multiplier)) : `${tools.commafy(Math.round(db.settings.gain.min * multiplier))} - ${tools.commafy(Math.round(db.settings.gain.max * multiplier))}`}`,
        `**Messages: **${estimatedRange}`,
    ])

    if(db.settings.enabledVoiceXp) levelDetails.push(`**Voice: **${estimatedTime == Infinity ? "Until the end of time" : tools.inline(tools.time((estimatedTime * (1 / db.settings.voice.multiplier)) * 1000, 1))} (avg)`)

    let embed = tools.createEmbed({
        author: { name: member.user.displayName, iconURL: member.displayAvatarURL() },
        title: `To reach level ${tools.commafy(targetLevel)}${reached ? " (reached!)" : ""}`,
        color: cardCol || member.displayColor || await member.user.fetch().then(x => x.accentColor),
        description: levelDetails.join("\n"), footer: progressBar
    })

    return int.reply({embeds: [embed]})

}}