const { buildActivityLeaderboard, generateLeaderboardEmbed } = require("../../classes/ActivityLeaderboard.js")

module.exports = {
    metadata: {
        name: "resetactivity",
        description: "Manually reset the activity leaderboard and post rewards immediately.",
        permission: "ManageGuild"
    },

    async run(client, int, tools) {
        // Permission check: requires Manage Guild or developer status
        if (!tools.canManageServer(int.member) && !tools.isDev(int.user)) {
            return tools.warn("You don't have permission to use this command! (Requires Manage Server)")
        }

        await int.deferReply();

        let db = await client.db.fetch(int.guild.id);
        const settings = db?.settings?.activityLeaderboard;

        if (!settings?.enabled) {
            return int.editReply({ content: "<:info:1466817220687695967> The activity leaderboard is not enabled in this server." });
        }

        const channel = int.guild.channels.cache.get(settings.channelId) 
            || await int.guild.channels.fetch(settings.channelId).catch(() => null);

        if (!channel) {
            return int.editReply({ content: "<:info:1466817220687695967> The activity leaderboard channel could not be found. Please check your config." });
        }

        // 1. Post the leaderboard and rewards
        const embed = await generateLeaderboardEmbed(int.guild, db, tools, null, true);
        if (!embed) {
            return int.editReply({ content: "Failed to generate activity leaderboard embed." });
        }

        await channel.send({ embeds: [embed] }).catch(e => console.error(`[Manual Reset] Failed to post in ${int.guild.id}:`, e.message));

        // 2. Handle Rewards (duplicated logic from index.js for immediate effect)
        const logChannelId = settings.rewardLogChannelId;
        const logChannel = logChannelId ? (int.guild.channels.cache.get(logChannelId) || await int.guild.channels.fetch(logChannelId).catch(() => null)) : null;

        const rankings = await buildActivityLeaderboard(int.guild, db);
        const topEntry = rankings[0];
        const prevTopId = db.info?.lastTopUserId || "";

        const topCredits = settings.topCredits || 0;
        const topRoleId  = settings.topRoleId  || "";

        if (topEntry && (topCredits > 0 || topRoleId)) {
            const topMember = topEntry.member || await int.guild.members.fetch(topEntry.id).catch(() => null);

            // Give credits
            if (topMember && topCredits > 0) {
                const currentCredits = db.users?.[topEntry.id]?.credits || 0;
                await client.db.update(int.guild.id, {
                    $set: { [`users.${topEntry.id}.credits`]: currentCredits + topCredits }
                }).exec().catch(() => {});
                
                if (logChannel) {
                    await logChannel.send({
                        embeds: [tools.createEmbed({
                            title: "Activity Reward: Credits (Manual Reset)",
                            description: `**${topMember.user.tag}** has been awarded **${tools.commafy(topCredits)} credits** for being #1 on the activity leaderboard!`,
                            color: tools.COLOR,
                            timestamp: true
                        })]
                    }).catch(() => {});
                }
            }

            // Give top role
            if (topMember && topRoleId) {
                const botMember = int.guild.members.me || await int.guild.members.fetch(client.user.id).catch(() => null);
                if (botMember?.permissions.has("ManageRoles")) {
                    await topMember.roles.add(topRoleId).catch(() => {});
                    
                    if (logChannel) {
                        await logChannel.send({
                            embeds: [tools.createEmbed({
                                title: "Activity Reward: Role (Manual Reset)",
                                description: `**${topMember.user.tag}** has been given the <@&${topRoleId}> role for being #1 on the activity leaderboard!`,
                                color: tools.COLOR,
                                timestamp: true
                            })]
                        }).catch(() => {});
                    }
                }
            }
        }

        // --- Remove role from previous top user if different ---
        if (topRoleId && prevTopId && prevTopId !== topEntry?.id) {
            const prevMember = int.guild.members.cache.get(prevTopId)
                || await int.guild.members.fetch(prevTopId).catch(() => null);
            const botMember = int.guild.members.me || await int.guild.members.fetch(client.user.id).catch(() => null);
            if (prevMember && botMember?.permissions.has("ManageRoles")) {
                await prevMember.roles.remove(topRoleId).catch(() => {});
                
                if (logChannel) {
                    await logChannel.send({
                        embeds: [tools.createEmbed({
                            title: "Activity Reward: Role Removed (Manual Reset)",
                            description: `<@&${topRoleId}> has been removed from **${prevMember.user.tag}** as they are no longer #1.`,
                            color: 0xff4444,
                            timestamp: true
                        })]
                    }).catch(() => {});
                }
            }
        }

        // 3. Reset the leaderboard data
        const updates = {
            $set: {
                "info.activityLastPosted": Date.now(),
                "info.lastTopUserId": topEntry?.id || ""
            }
        };

        // Reset activity XP for everyone in the database who has it
        // Since we can't easily iterate all users and update them individually in one $set without knowing paths,
        // we'll use the same logic as the daily reset where they're cleared on next message, 
        // OR we can do a broad update if your DB structure allows. 
        // For Polaris-Open, users are in a 'users' object.
        
        // Let's clear the accumulated XP for all users currently in the doc to be thorough for the reset.
        if (db.users) {
            for (const userId in db.users) {
                if (db.users[userId].activityXpAccumulated) {
                    updates.$set[`users.${userId}.activityXpAccumulated`] = 0;
                }
            }
        }

        await client.db.update(int.guild.id, updates).exec();

        return int.editReply({ content: `<:check:1466820251147571210> Activity leaderboard has been manually reset and posted in ${channel}!` });
    }
};
