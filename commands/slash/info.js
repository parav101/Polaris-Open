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

    let isHidden = db.settings.rankCard.ephemeral || !!int.options.get("hidden")?.value
    await int.deferReply({ ephemeral: isHidden })

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
    // let rewardRole = tools.getRolesForLevel(levelData.level, db.settings.rewards)
    let multiplier = multiplierData.multiplier

    // Get member's rank
    let wholeDB = await tools.fetchAll(int.guild.id)
    let rank = tools.getRank(member.id, wholeDB.users)

    // Tips for the footer
    const tips = [
        "Tip: You get XP from both chatting and being in voice channels!",
        "Tip: Spamming won't get you XP faster. XP is awarded periodically.",
        "Tip: Use /rank to see your rank card.",
        "Tip: Use /leaderboards to see how you stack up against others!",
        "Tip: Want to know how much XP you need for a level? Use /calculate.",
        "Tip: Maintain your daily chat streak to climb the /streakleaderboard!",
        "Tip: Don't forget to chat daily, or your streak will reset to 0!"
    ];

    
    // Find rival (next user above in rank)
    let xpArray = tools.xpObjToArray(wholeDB.users).sort((a, b) => b.xp - a.xp)
    let userIndex = xpArray.findIndex(u => u.id === member.id)
    let rival = userIndex > 0 ? xpArray[userIndex - 1] : null
    
    let rivalUser = null
    let rivalXpDiff = 0
    if (rival) {
        try {
            rivalUser = await int.guild.members.fetch(rival.id)
        } catch (e) {
            // User is not in the guild, try fetching the user directly
            try {
                rivalUser = await client.users.fetch(rival.id)
            } catch (fetchErr) {
                console.error("Could not fetch rival user:", fetchErr)
            }
        }

        if (rivalUser) {
            rivalXpDiff = rival.xp - xp
        }
    }

    let barSize = 33    // how many characters the xp bar is
    let barRepeat = Math.round(levelPercent / (100 / barSize)) // .round() so bar can sometimes display as completely full and completely empty
    let progressBar = `${"▓".repeat(barRepeat)}${"░".repeat(barSize - barRepeat)} (${!maxLevel ? Number(levelPercent.toFixed(2)) + "%" : "MAX"})`

    // let estimatedMin = Math.ceil(remaining / (db.settings.gain.min * (multiplier || multiplierData.role)))
    // let estimatedMax = Math.ceil(remaining / (db.settings.gain.max * (multiplier || multiplierData.role)))

    // estimated number of messages to level up
    // let estimatedRange = (estimatedMax == estimatedMin) ? `${tools.commafy(estimatedMax)} ${tools.extraS("message", estimatedMax)}` : `${tools.commafy(estimatedMax)}-${tools.commafy(estimatedMin)} messages`

    // xp required to level up
    // let nextLevelXP = (db.settings.rankCard.relativeLevel ? `${tools.commafy(xp - levelData.previousLevel)}/${tools.commafy(levelData.xpRequired - levelData.previousLevel)}` : `${tools.commafy(levelData.xpRequired)}`) + ` (${tools.commafy(remaining,true)} more)`

    let cardCol = db.settings.rankCard.embedColor
    if (cardCol == -1) cardCol = null

    let memberAvatar = member.displayAvatarURL()
    let memberColor = cardCol || member.displayColor || await member.user.fetch().then(x => x.accentColor)
    
    // Prepare streak info for footer if enabled
    let streakText = null;
    if (db.settings.streak?.enabled) {
        if (!db.users[member.id].streak) {
            db.users[member.id].streak = { count: 0, lastClaim: 0, highest: 0 };
        }
        const userStreak = db.users[member.id].streak;
        
        const streakInfo = [
            `**Current:** ${tools.commafy(userStreak.count)}`,
            `**Highest:** ${tools.commafy(userStreak.highest || userStreak.count)}`
        ];

        if (userStreak.lastClaim > 0) {
            streakInfo.push(`**Last claim:** <t:${Math.floor(userStreak.lastClaim / 1000)}:R>`);
        }
        
        streakText = streakInfo.join('\n');
    }

    const randomTip = tips[Math.floor(Math.random() * tips.length)];

    // Create the new embed format
    let embed = tools.createEmbed({
        author: { 
            name: member.user.displayName,
            iconURL: int.guild.iconURL({ dynamic: true })
        },
        description: `\`\`\`${progressBar}\`\`\``,
        thumbnail: memberAvatar,
        color: memberColor,
        fields: [
            { name: `Level: ${levelData.level}`, value: "\u200b", inline: true },
            { name: `Rank: # ${rank}`, value: "\u200b", inline: true },
            // { name: `Progress: ${Number(levelPercent.toFixed(0))}%`, value: "\u200b", inline: true },
        ],
        footer: {
            text: randomTip,
            iconURL: "https://cdn3.emoji.gg/emojis/9385-sparkles-pinkpastel.gif"
        }
    })
    
    // Add XP Boost field
    if (multiplier !== 1 && !db.settings.hideMultipliers) {
        embed.addFields([{ 
            name: `XP Boost: ${multiplier * 100}%`, 
            value: multiplierData.roleList.length ? multiplierData.roleList.map(role => `<@&${role.id}>`).join(", ") : "\u200b", 
            inline: true 
        }])
    } else {
        embed.addFields([{ name: "XP Boost: 100%", value: "No Boost Role", inline: true }])
    }
    // Add rival field
    // if (rivalUser) {
    //     embed.addFields([{
    //         name: "Your Rival:",
    //         value: `<@${rivalUser.id}>`,
    //         inline: true
    //     }])
    // } else {
    //     embed.addFields([{
    //         name: "Your Rival:",
    //         value: "You're at the top!",
    //         inline: true
    //     }])
    // }

    //add Daily xp snapshot info
    const dailyXp = xp - (currentXP.xpAtDayStart ?? xp);
    const lastUpdate = currentXP.lastDailyUpdate ? `<t:${Math.floor(currentXP.lastDailyUpdate / 1000)}:R>` : "Now";
    embed.addFields({ name: `XP Gained: ${tools.commafy(dailyXp)}`, value: `since ${lastUpdate}`, inline: true });

    // Add XP required to beat rival
    embed.addFields([{
        name: `XP Required: ${rivalXpDiff > 0 ? tools.commafy(rivalXpDiff, false) : '0'}`,
        value: rivalUser ? `to beat <@${rivalUser.id}>` : "No rival left",
        inline: true
    }])

    if (streakText) {
        embed.addFields({ name: "Streak Info", value: streakText, inline: true });
    }

    // let isHidden = db.settings.rankCard.ephemeral || !!int.options.get("hidden")?.value
    return int.editReply({embeds: [embed]})
}}
