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
    // const startTime = Date.now(); // Start timing

    // fetch member
    let member = int.member
    let foundUser = int.options.get("user") || int.options.get("member") // option is "user" if from context menu
    if (foundUser) member = foundUser.member
    if (!member) return tools.warn("That member couldn't be found!")

    // Get hidden flag from command option (sync check before deferring)
    const commandHidden = !!int.options.get("hidden")?.value

    // DEFER IMMEDIATELY before any async operations (Discord has 3-second timeout)
    if (!int.deferred && !int.replied) {
        await int.deferReply({ ephemeral: commandHidden });
    }

    // NOW fetch server xp settings after deferring
    let db = await tools.fetchSettings(member.id)

    if (!db) return tools.warn("*noData")
    else if (!db.settings.enabled) return tools.warn("*xpDisabled")

    // Use server's ephemeral preference if set, otherwise use command option
    let isHidden = db.settings.rankCard.ephemeral || commandHidden

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

    const randomTip = tips[Math.floor(Math.random() * tips.length)];

    let barSize = 33    // how many characters the xp bar is
    let barRepeat = Math.round(levelPercent / (100 / barSize)) // .round() so bar can sometimes display as completely full and completely empty
    let progressBar = `${"▓".repeat(barRepeat)}${"░".repeat(barSize - barRepeat)} (${!maxLevel ? Number(levelPercent.toFixed(2)) + "%" : "MAX"})`

    let cardCol = db.settings.rankCard.embedColor
    if (cardCol == -1) cardCol = null

    let memberAvatar = member.displayAvatarURL()
    let memberColor = cardCol || member.displayColor || await member.user.fetch().then(x => x.accentColor)
    
    // ===== CALCULATE RANK POSITION =====
    const allUsers = db.users || {}
    const memberIdStr = String(member.id)
    
    // Create rankings excluding users with no/invalid XP
    const userRankings = Object.entries(allUsers)
        .filter(([userId, userData]) => {
            return userData && 
                   typeof userData.xp === 'number' && 
                   userData.xp > 0
        })
        .map(([userId, userData]) => ({
            id: String(userId),
            xp: userData.xp
        }))
        .sort((a, b) => b.xp - a.xp) // Sort by XP descending (highest first)
    
    // Find user's rank - only count users this guild with higher XP
    const userRankIndex = userRankings.findIndex(u => u.id === memberIdStr)
    let userRank = userRankIndex !== -1 ? userRankIndex + 1 : "?"
    const totalRanked = userRankings.length
    
    // Debug logging if user not found
    if (userRankIndex === -1 && currentXP?.xp > 0) {
        console.warn(`[Info Rank Debug] User ${memberIdStr} with XP ${currentXP.xp} not found in rankings. Total users: ${totalRanked}`)
        console.warn(`[Info Rank Debug] User ID type: ${typeof member.id}, memberIdStr type: ${typeof memberIdStr}`)
        console.warn(`[Info Rank Debug] Current XP data:`, { id: currentXP.id, xp: currentXP.xp, name: member.user?.username })
    }

    // ===== CALCULATE TIME TO NEXT LEVEL =====
    let timeToNextLevel = "Unknown"
    if (!maxLevel && currentXP.lastDailyUpdate) {
        const dailyXp = xp - (currentXP.xpAtDayStart ?? xp)
        const xpNeeded = remaining
        if (dailyXp > 0) {
            const daysNeeded = (xpNeeded / dailyXp).toFixed(1)
            timeToNextLevel = daysNeeded <= 1 ? "Less than a day" : `~${daysNeeded} days`
        }
    }

    // ===== COUNT REWARD ROLES =====
    const userRewards = tools.getRolesForLevel(levelData.level, db.settings.rewards)
    const rewardsEarned = userRewards.length

    // ===== LAST XP GAIN =====
    const lastXpGain = currentXP.lastXpGain ? `<t:${Math.floor(currentXP.lastXpGain / 1000)}:R>` : "Never"
    
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
            { name: `Level: ${levelData.level}`, value: `**Rank:** unknown`, inline: true },
            { name: `Remaining XP: ${tools.commafy(remaining)}`, value: `**To Next:** ${timeToNextLevel}`, inline: true },
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
            value: multiplierData.roleList.length ? multiplierData.roleList.map(role => `boosting role: <@&${role.id}>`).join(", ") : "\u200b", 
            inline: true 
        }])
    } else {
        embed.addFields([{ name: "XP Boost: 100%", value: "No Boost Role", inline: true }])
    }

    // Add Daily XP snapshot info
    const dailyXp = xp - (currentXP.xpAtDayStart ?? xp);
    const lastUpdate = currentXP.lastDailyUpdate ? `<t:${Math.floor(currentXP.lastDailyUpdate / 1000)}:R>` : "Now";
    embed.addFields({ name: `Daily XP: ${tools.commafy(dailyXp)}`, value: `Earned today (boosted)`, inline: true });

    // Add Rewards Earned (highest reward role)
    embed.addFields({ 
        name: `Active Reward: ${rewardsEarned > 0 ? "✅" : "❌"}`, 
        value: rewardsEarned > 0 ? userRewards[0] ? `<@&${userRewards[0].id}>` : "None" : "None yet", 
        inline: true 
    });

    // Add Total XP
    embed.addFields({ 
        name: `Total XP: ${tools.commafy(xp)}`, 
        value: `Last gain: ${lastXpGain}`, 
        inline: true 
    });

    if (streakText) {
        embed.addFields({ name: "Streak Info", value: streakText, inline: true });
    }

    // Navigation Buttons
    let buttons = tools.button([
        { style: "Secondary", label: "Progress", customId: `stats_view~progress~${member.id}`, emoji: "<:progress:1466819928110792816>" },
        { style: "Success", label: "Info", customId: `stats_view~info~${member.id}`, emoji: "<:info:1466817220687695967>" },
        { style: "Primary", label: "Shop", customId: "shop", emoji: "<:gold:1472934905972527285>" },
        { style: "Primary", label: "Chests", customId: "chests", emoji: "<:chest:1486740653067997394>" }
    ])


    const reply = await int.editReply({embeds: [embed], components: tools.row(buttons)});

    // const endTime = Date.now();
    // const executionTime = endTime - startTime;
    // console.log(`Execution time for /info command: ${executionTime} ms`);
    return reply;
}}
