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
            { type: "integer", name: "rank", description: "Which rank to view", required: false },
            { type: "bool", name: "hidden", description: "Hides the reply so only you can see it", required: false }
        ]
    },

    async run(client, int, tools) {

        await int.deferReply();

        try {
            // fetch member
            let member = int.member
            const rankOption = int.options.get("rank") ? int.options.get("rank").value : null
            const wholeDB = await tools.fetchAll()

            let foundUser = int.options.get("user") || int.options.get("member") // option is "user" if from context menu 
            if (foundUser) member = foundUser.member

            if (rankOption) {
                const rankUser = tools.getUserByRank(rankOption, wholeDB.users)
                member = int.guild.members.cache.get(rankUser?.id) || await int.guild.members.fetch(rankUser?.id).catch(() => null)
            }

            if (!member) return int.editReply({ content: "That member couldn't be found!" });

            // fetch server xp settings
            const db = await tools.fetchSettings(member.id)
            if (!db) return int.editReply({ content: tools.errors.noData });
            else if (!db.settings.enabled) return int.editReply({ content: tools.errors.xpDisabled });

            let currentXP = db.users[member.id]

            if (db.settings.rankCard.disabled) return int.editReply({ content: "Rank cards are disabled in this server!" });

            // if user has no xp, stop here
            if (!currentXP || !currentXP.xp) return int.editReply({ content: tools.noXPYet(foundUser ? foundUser.user : int.user) });

            let xp = currentXP.xp

            let levelData = tools.getLevel(xp, db.settings, true)       // get user's level
            let memberAvatar = member.displayAvatarURL({ forceStatic: true, size: 128, extension: "png" });

            // Acknowledge the interaction to avoid expiry
            const rank = tools.getRank(member.id, wholeDB.users);
            let cardOptions;

            switch (rank) {
                case 1: // Gold
                    cardOptions = {
                        backgroundColor: { background: '#2c2700', bubbles: '#ffeb3b' },
                        nicknameText: { content: member.displayName, font: 'Inter', color: '#ffeb3b' },
                        requiredXPColor: '#b0a04a',
                        currentXPColor: '#ffeb3b',
                        avatarBackgroundColor: '#8f7d1b',
                        colorTextDefault: '#ffeb3b',
                        progressBarColor: '#ffeb3b',
                        lvlNumFormat: { font: 'Inter', size: 60, weight: '700', color: '#ffeb3b' },
                        rankNumFormat: { font: 'Inter', size: 60, weight: '700', color: '#ffeb3b' },
                    };
                    break;
                case 2: // Silver
                    cardOptions = {
                        backgroundColor: { background: '#2d2d2d', bubbles: '#c0c0c0' },
                        nicknameText: { content: member.displayName, font: 'Inter', color: '#c0c0c0' },
                        requiredXPColor: '#a8a8a8',
                        currentXPColor: '#c0c0c0',
                        avatarBackgroundColor: '#8c8c8c',
                        colorTextDefault: '#c0c0c0',
                        progressBarColor: '#c0c0c0',
                        lvlNumFormat: { font: 'Inter', size: 60, weight: '700', color: '#c0c0c0' },
                        rankNumFormat: { font: 'Inter', size: 60, weight: '700', color: '#c0c0c0' },
                    };
                    break;
                case 3: // Bronze
                    cardOptions = {
                        backgroundColor: { background: '#3c280d', bubbles: '#cd7f32' },
                        nicknameText: { content: member.displayName, font: 'Inter', color: '#cd7f32' },
                        requiredXPColor: '#a4774b',
                        currentXPColor: '#cd7f32',
                        avatarBackgroundColor: '#8b5a2b',
                        colorTextDefault: '#cd7f32',
                        progressBarColor: '#cd7f32',
                        lvlNumFormat: { font: 'Inter', size: 60, weight: '700', color: '#cd7f32' },
                        rankNumFormat: { font: 'Inter', size: 60, weight: '700', color: '#cd7f32' },
                    };
                    break;
                default: // Default
                    cardOptions = {
                        backgroundColor: { background: '#1a1125', bubbles: '#9b59b6' },
                        nicknameText: { content: member.displayName, font: 'Inter', color: '#d2b4de' },
                        requiredXPColor: '#95a5a6',
                        currentXPColor: '#8e44ad',
                        avatarBackgroundColor: '#6c3483',
                        colorTextDefault: '#d2b4de',
                        progressBarColor: '#9b59b6',
                        lvlNumFormat: { font: 'Inter', size: 60, weight: '700', color: '#d2b4de' },
                        rankNumFormat: { font: 'Inter', size: 60, weight: '700', color: '#d2b4de' },
                    };
                    break;
            }


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
                avatarImgURL: memberAvatar,
                userStatus: member.presence?.status || 'offline',
                ...cardOptions
            }).build();

            const attachment = new AttachmentBuilder(rankCard.toBuffer(), { name: 'rankCard.png' });
            


            await int.editReply({ files: [attachment] });

        } catch (err) {
            console.error("Failed to execute rank command:", err);
            if (!int.replied) { // Fallback in case defer fails for some reason
                await int.reply({ content: "There was an error creating the rank card.", ephemeral: true });
            } else {
                await int.editReply({ content: "There was an error creating the rank card." });
            }
        }
    }
}