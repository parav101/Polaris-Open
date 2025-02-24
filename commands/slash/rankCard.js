const multiplierModes = require("../../json/multiplier_modes.json")
const { AttachmentBuilder } = require('discord.js');
const { RankCardBuilder, loadFont } = require("discord-card-canvas")
const path = require('path');
const fs = require('fs');

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
        let nextLevelXP = (db.settings.rankCard.relativeLevel ? `${tools.commafy(xp - levelData.previousLevel)}/${tools.commafy(levelData.xpRequired - levelData.previousLevel)}` : `${tools.commafy(levelData.xpRequired)}`) + ` (${tools.commafy(remaining, true)} more)`

        let cardCol = db.settings.rankCard.embedColor
        if (cardCol == -1) cardCol = null

        let memberAvatar = member.displayAvatarURL({ forceStatic: true, size: 128, extension: "png" });
        let memberColor = cardCol || member.displayColor || await member.user.fetch().then(x => x.accentColor)


        try {


            // Acknowledge the interaction to avoid expiry
            const rank = tools.getRank(member.id, wholeDB.users);
            await int.deferReply();

            // Register a single font
            loadFont(path.join(__dirname, '../../app/assets/fonts/Inter-VariableFont_opsz,wght.ttf'), {
                family: 'Inter',
                weight: '700',
                style: 'normal',
            });
            const rankCard = await new RankCardBuilder({
                currentLvl: levelData.level,
                currentRank: rank,
                currentXP: xp - levelData.previousLevel,
                requiredXP: levelData.xpRequired - levelData.previousLevel,
                fontDefault: 'Inter',
                backgroundColor: { background: '#1a1125', bubbles: '#9b59b6' },
                avatarImgURL: memberAvatar,
                nicknameText: { content: member.displayName, font: 'Inter', color: '#d2b4de' },
                userStatus: member.presence?.status || 'offline',
                requiredXPColor: '#95a5a6',
                currentXPColor: '#8e44ad',
                avatarBackgroundColor: '#6c3483',
                colorTextDefault: '#d2b4de',
                progressBarColor: '#9b59b6',
                lvlNumFormat: { font: 'Inter', size: 60, weight: '700', color: '#d2b4de' },
                rankNumFormat: { font: 'Inter', size: 60, weight: '700', color: '#d2b4de' },

            }).build();

            // Saving an image
            // fs.writeFileSync('rankCard.png', rankCard.toBuffer());

            // Example of sending to a channel
            const attachment = new AttachmentBuilder(rankCard.toBuffer(), { name: 'rankCard.png' });
            await int.followUp({ files: [attachment] });
        } catch (err) {
            console.error("Failed to create rank card:", err);
            await int.followUp("There was an error creating the rank card.");
        }

        // let isHidden = db.settings.rankCard.ephemeral || !!int.options.get("hidden")?.value
        // return int.reply({embeds: [embed], ephemeral: isHidden})

    }
}