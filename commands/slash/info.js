const multiplierModes = require("../../json/multiplier_modes.json")

module.exports = {
metadata: {
    name: "info",
    description: "View your current XP, level, and cooldown.",
    args: [
        { type: "user", name: "member", description: "Which member to view", required: false },
        { type: "bool", name: "hidden", description: "Hides the reply so only you can see it", required: false }
    ]
},

async run(client, int, tools) {

    // fetch member
    let member = int.member
    let foundUser = int.options.get("user") || int.options.get("member") // option is "user" if from context menu
    if (foundUser) member = foundUser.member
    if (!member) return tools.warn("That member couldn't be found!")

    // fetch server xp settings
    let db = await tools.fetchSettings(member.id)
    if (!db) return tools.warn("*noData")
    else if (!db.settings.enabled) return tools.warn("*xpDisabled")

    let currentXP = db.users[member.id]

    if (db.settings.rankCard.disabled) return tools.warn("Rank cards are disabled in this server!")
    
    // if user has no xp, stop here
    if (!currentXP || !currentXP.xp) return tools.noXPYet(foundUser ? foundUser.user : int.user)

    let xp = currentXP.xp

    let levelData = tools.getLevel(xp, db.settings, true)       // get user's level
    let maxLevel = levelData.level >= db.settings.maxLevel      // check if level is maxxed

    let remaining = levelData.xpRequired - xp
    let levelPercent = maxLevel ? 100 : (xp - levelData.previousLevel) / (levelData.xpRequired - levelData.previousLevel) * 100

    let multiplierData = tools.getMultiplier(member, db.settings)
    let rewardRole = tools.getRolesForLevel(levelData.level, db.settings.rewards)
    let multiplier = multiplierData.multiplier

    // Get member's rank
    let wholeDB = await tools.fetchAll(int.guild.id)
    let rank = tools.getRank(member.id, wholeDB.users)
    
    // Find rival (next user above in rank)
    let xpArray = tools.xpObjToArray(wholeDB.users).sort((a, b) => b.xp - a.xp)
    let userIndex = xpArray.findIndex(u => u.id === member.id)
    let rival = userIndex > 0 ? xpArray[userIndex - 1] : null
    
    let rivalUser = null
    let rivalXpDiff = 0
    if (rival) {
        try {
            rivalUser = await int.guild.members.fetch(rival.id)
            rivalXpDiff = rival.xp - xp
        } catch (e) {
            console.error("Could not fetch rival user:", e)
        }
    }

    let barSize = 33    // how many characters the xp bar is
    let barRepeat = Math.round(levelPercent / (100 / barSize)) // .round() so bar can sometimes display as completely full and completely empty
    let progressBar = `${"▓".repeat(barRepeat)}${"░".repeat(barSize - barRepeat)} (${!maxLevel ? Number(levelPercent.toFixed(2)) + "%" : "MAX"})`

    let estimatedMin = Math.ceil(remaining / (db.settings.gain.min * (multiplier || multiplierData.role)))
    let estimatedMax = Math.ceil(remaining / (db.settings.gain.max * (multiplier || multiplierData.role)))

    // estimated number of messages to level up
    let estimatedRange = (estimatedMax == estimatedMin) ? `${tools.commafy(estimatedMax)} ${tools.extraS("message", estimatedMax)}` : `${tools.commafy(estimatedMax)}-${tools.commafy(estimatedMin)} messages`

    // xp required to level up
    let nextLevelXP = (db.settings.rankCard.relativeLevel ? `${tools.commafy(xp - levelData.previousLevel)}/${tools.commafy(levelData.xpRequired - levelData.previousLevel)}` : `${tools.commafy(levelData.xpRequired)}`) + ` (${tools.commafy(remaining,true)} more)`

    let cardCol = db.settings.rankCard.embedColor
    if (cardCol == -1) cardCol = null

    let memberAvatar = member.displayAvatarURL()
    let memberColor = cardCol || member.displayColor || await member.user.fetch().then(x => x.accentColor)
    
    // Create the new embed format
    let embed = tools.createEmbed({
        author: { 
            name: int.guild.name,
            iconURL: int.guild.iconURL({ dynamic: true })
        },
        description: `\`\`\`Player: ${member.user.displayName}\`\`\``,
        thumbnail: memberAvatar,
        color: memberColor,
        fields: [
            { name: `Level: ${levelData.level}`, value: "\u200b", inline: true },
            { name: `Rank: #${rank}`, value: "\u200b", inline: true },
            { name: `Progress: ${Number(levelPercent.toFixed(0))}%`, value: "\u200b", inline: true },
        ],
        footer: {
            text: getRandomTip(), 
            iconURL: "https://cdn3.emoji.gg/emojis/9385-sparkles-pinkpastel.gif"
        }
    })
    
    // Function to get a random tip to display in the footer
    function getRandomTip() {
        const tips = [
            "✨ Use XP boost to level up faster ✨",
            "✨ You get XP for being in voice channels ✨",
            "✨ You get XP after each minute for messaging ✨",
            "✨ Stay active to climb the ranks ✨",
            "✨ Check your rank regularly to track progress ✨"
        ];
        return tips[Math.floor(Math.random() * tips.length)];
    }
    
    // Add XP Boost field
    if (multiplier !== 1 && !db.settings.hideMultipliers) {
        embed.addFields([{ 
            name: `XP Boost: ${multiplier * 100}%`, 
            value: multiplierData.roleList.length ? multiplierData.roleList.map(role => `<@&${role.id}>`).join(", ") : "\u200b", 
            inline: true 
        }])
    } else {
        embed.addFields([{ name: "XP Boost: 100%", value: "\u200b", inline: true }])
    }
    
    // Add rival field
    if (rivalUser) {
        embed.addFields([{
            name: "Your Rival",
            value: `<@${rivalUser.id}>`,
            inline: true
        }])
    } else {
        embed.addFields([{
            name: "Your Rival",
            value: "You're at the top!",
            inline: true
        }])
    }
    
    // Add XP required to beat rival
    embed.addFields([{
        name: `XP req: ${rivalXpDiff > 0 ? tools.commafy(rivalXpDiff, true) : '0'}`,
        value: rivalUser ? "to beat rival" : "You're the leader!",
        inline: true
    }])

    let isHidden = db.settings.rankCard.ephemeral || !!int.options.get("hidden")?.value
    return int.reply({embeds: [embed], ephemeral: isHidden})
}}