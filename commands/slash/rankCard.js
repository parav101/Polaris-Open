const multiplierModes = require("../../json/multiplier_modes.json")
const { AttachmentBuilder } = require('discord.js');

module.exports = {
metadata: {
    name: "rank",
    description: "View your rank card",
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
    let wholeDB = await tools.fetchAll()
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

    let memberAvatar = member.displayAvatarURL({ forceStatic:true, size: 128 });
    let memberColor = cardCol || member.displayColor || await member.user.fetch().then(x => x.accentColor)

    // let embed = tools.createEmbed({
    //     // author: { name: member.user.displayName },
    //     title: member.user.displayName,
    //     thumbnail: memberAvatar,
    //     color: memberColor,
    //     footer: maxLevel ? progressBar : ((estimatedMin == Infinity || estimatedMin < 0) ? "You are unable to gain XP!" : `${progressBar}\n${estimatedRange} to go!`),
    //     fields: [
    //         { name: `✨ Level: ${levelData.level}`, value: `${int.guild.id != rewardRole[0].id ? `Rank:<@&${rewardRole[0].id}>` : "No Rank"}`, inline: true },
    //         { name: "⏩ Xp req", value: !maxLevel ? nextLevelXP : "Max level! Woah!"},
    //     ]
    // })

    // let hideMult = db.settings.hideMultipliers

    // let multRoles = multiplierData.roleList
    // let multiplierInfo = []
    // if ((!hideMult || multiplierData.role == 0) && multRoles.length) {
    //     let xpStr = multiplierData.role > 0 ? `${multiplierData.role}x XP` : "Cannot gain XP!"
    //     let roleMultiplierStr = multRoles.length == 1 ? `${int.guild.id != multRoles[0].id ? `<@&${multRoles[0].id}>` : "Everyone"} - ${xpStr}` : `**${multRoles.length} roles** - ${xpStr}`
    //     multiplierInfo.push(roleMultiplierStr)
    // }

    // let multChannels = multiplierData.channelList
    // if ((!hideMult || multiplierData.channel == 0) && multChannels.length && multiplierData.role > 0 && (multiplierData.role != 1 || multiplierData.channel != 1)) {
    //     let chXPStr = multChannels[0].boost > 0 ? `${multiplierData.channel}x XP` : "Cannot gain XP!"
    //     let chMultiplierStr = `<#${multChannels[0].id}> - ${chXPStr}` // leaving room for multiple channels, via categories or vcs or something
    //     multiplierInfo.push(chMultiplierStr)
    //     if (multRoles.length) multiplierInfo.push(`**Total multiplier: ${multiplier}x XP** (${multiplierModes.channelStacking[multiplierData.channelStacking].toLowerCase()})`)
    // }

    // if (multiplierInfo.length) embed.addFields([{ name: "🌟 Multiplier", value: multiplierInfo.join("\n") }])

    // else if (!db.settings.rewardSyncing.noManual && !db.settings.rewardSyncing.noWarning) {
    //     let syncCheck = tools.checkLevelRoles(int.guild.roles.cache, member.roles.cache, levelData.level, db.settings.rewards)
    //     if (syncCheck.incorrect.length || syncCheck.missing.length) embed.addFields([{ name: "⚠ Note", value: `Your level roles are not properly synced! Type ${tools.commandTag("sync")} to fix this.` }])
    // }

    try {
        // Acknowledge the interaction to avoid expiry
        const rank = tools.getRank(member.id, wholeDB.users);
        let avtarBorderColour = null;
        switch (rank) {
            case 1:
                avtarBorderColour = "#a98e00";
                break;
            case 2:
                avtarBorderColour = "#C0C0C0";
                break;
            case 3:
                avtarBorderColour = "#764d24";
                break;
            default:
                avtarBorderColour = null;
                break;
        }
        await int.deferReply();
        
        const rankCardImage = await tools.createRankCard({
            displayName: member.user.displayName,
            username: member.user.username,
            avatarURL: memberAvatar,
            currentXP: xp - levelData.previousLevel,
            requiredXP: levelData.xpRequired - levelData.previousLevel,
            level: levelData.level,
            rank: rank,
            overlay: 90,
            background: "#23272a", // or "./path/to/image.png"
            // status: "online",
            progress: Number(levelPercent.toFixed(2)),
            size: "25px",
            avtarBorderColour: avtarBorderColour
        });

        const attachment = new AttachmentBuilder(rankCardImage, { name: 'rankCard.png' });
        await int.followUp({ files: [attachment] });
    } catch (err) {
        console.error("Failed to create rank card:", err);
        await int.followUp("There was an error creating the rank card.");
    }

    // let isHidden = db.settings.rankCard.ephemeral || !!int.options.get("hidden")?.value
    // return int.reply({embeds: [embed], ephemeral: isHidden})

}}