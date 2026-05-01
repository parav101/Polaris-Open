const Discord = require('discord.js');
const path = require('path');
const logger = require("../../classes/Logger.js")
module.exports = {
    metadata: {
        name: "prettyleaderboard",
        description: "View a fancy server leaderboard with customizable layout.",
        args: [
            { type: "string", name: "variant", description: "The layout variant to use", required: false, choices: [
                { name: "Default", value: "default" },
                { name: "Simple", value: "simple" }
            ]
           }
        ]
    },

    async run(client, int, tools) {
        const cmdStart = Date.now()
        const perfMeta = { command: "prettyleaderboard", guildId: int.guild.id, userId: int.user.id, shardId: client.shard?.id ?? null }
        // Defer reply immediately
        await int.deferReply();

        try {
            // Get server data
            const fetchStart = Date.now()
            let db = await tools.fetchAll()
            logger.perf("prettyleaderboard.fetch", Date.now() - fetchStart, { ...perfMeta, usersCount: Object.keys(db?.users || {}).length })
            if (!db || !db.users || !Object.keys(db.users).length) 
                return int.editReply(tools.warn(`Nobody in this server is ranked yet!`));
            if (!db.settings.enabled) 
                return int.editReply(tools.warn("*xpDisabled"));
            if (db.settings.leaderboard.disabled) 
                return int.editReply(tools.warn("The leaderboard is disabled in this server!"));

            // Filter and sort members
            let minLeaderboardXP = db.settings.leaderboard.minLevel > 1 
                ? tools.xpForLevel(db.settings.leaderboard.minLevel, db.settings) 
                : 0;

            const variant = int.options.getString('variant') || 'default';
            let number = 10;
            if(variant === 'default') number = 7;
            const sortStart = Date.now()
            let rankings = tools.xpObjToArray(db.users)
                .filter(x => x.xp > minLeaderboardXP && !x.hidden)
                .sort((a, b) => b.xp - a.xp)
                .slice(0, number); // Top 10 only
            logger.perf("prettyleaderboard.sort", Date.now() - sortStart, { ...perfMeta, resultCount: rankings.length, variant })

            if (!rankings.length) 
                return int.editReply(tools.warn("Nobody in this server is on the leaderboard yet!"));

            // Format member data
            const renderStart = Date.now()
            const memberList = await Promise.all(rankings.map(async (user, index) => {
                const member = await int.guild.members.fetch(user.id).catch(() => null);
                if (!member) return null;
                let avatarURL = member.user.displayAvatarURL({forceStatic:true, size: 128});
                return {
                    avatar: avatarURL,
                    username: member.user.username,
                    displayName: member.displayName,
                    level: tools.getLevel(user.xp, db.settings),
                    xp: user.xp,
                    rank: index + 1
                };
            }));

            // Filter out null entries (members who left)
            const validMembers = memberList.filter(m => m !== null);
        const backgroundImagePath = path.resolve(__dirname, '../../app/assets/beautiful-anime-character-cartoon-scene_23-2151035158.jpg');
            const image = await tools.leaderboardBuilder({
                title: `${int.guild.name} Leaderboard`,
                subtitle: `Top ${validMembers.length} Members`,
                image: int.guild.iconURL({ forceStatic:true, size: 128 }),
                memberList: validMembers,
                variant: int.options.getString('variant') || 'default',
                backgroundImage: backgroundImagePath,
            });

            // Edit the deferred reply with the image
            await int.editReply({
                files: [{ attachment: image, name: 'leaderboard.png' }]
            });
            logger.perf("prettyleaderboard.render", Date.now() - renderStart, { ...perfMeta, resultCount: validMembers.length, variant })
            logger.perf("prettyleaderboard.total", Date.now() - cmdStart, { ...perfMeta, resultCount: validMembers.length, variant })

        } catch (error) {
            console.error('Leaderboard generation error:', error);
            logger.error("command", {
                msg: "prettyleaderboard failed",
                meta: { ...perfMeta, error: error.message }
            })
            await int.editReply(tools.warn("Failed to generate the leaderboard image!"));
        }
    }
};
