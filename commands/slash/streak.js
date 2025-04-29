const ms = require('ms');

module.exports = {
    metadata: {
        name: "streak",
        description: "Claim your daily streak.",
        args: [
            { type: "bool", name: "hidden", description: "Hides the reply so only you can see it", required: false }
        ]
    },

    async run(client, int, tools) {
        // Only allow self-claim
        let member = int.member;

        // Defer reply as soon as possible to avoid timeout
        let isHidden = !!int.options.get("hidden")?.value;
        await int.deferReply({ ephemeral: isHidden || false });

        // fetch server streak settings
        let db = await tools.fetchSettings(member.id);
        if (!db) return tools.warn("*noData");
        if (!db.settings.streak?.enabled) return tools.warn("Streak system is not enabled on this server.");

        // fetch user streak data
        if (!db.users[member.id]) db.users[member.id] = {};
        if (!db.users[member.id].streak) {
            db.users[member.id].streak = { count: 0, lastClaim: 0, highest: 0 };
        }
        const userStreak = db.users[member.id].streak;

        // streak info
        const now = Date.now();

        // Calculate current UTC day (YYYY-MM-DD)
        function getUTCDateString(ts) {
            const d = new Date(ts);
            return d.getUTCFullYear() + '-' +
                String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
                String(d.getUTCDate()).padStart(2, '0');
        }
        const todayUTC = getUTCDateString(now);
        const lastClaimUTC = userStreak.lastClaim ? getUTCDateString(userStreak.lastClaim) : null;

        const canClaim = todayUTC !== lastClaimUTC;
        // Calculate next UTC midnight for time left
        const nextUTCMidnight = (() => {
            const d = new Date(now);
            d.setUTCHours(24, 0, 0, 0);
            return d.getTime();
        })();
        const timeLeft = nextUTCMidnight - now;

        let claimMsg = "";
        let xp = db.settings.streak.xpPerClaim || 0;
        let milestoneMsg = "";

        // Get multiplier for this member (same as message.js/info.js)
        let multiplierData = tools.getMultiplier(member, db.settings);
        let multiplier = multiplierData.multiplier || 1;
        let xpWithMultiplier = Math.round(xp * multiplier);

        
        if (canClaim) {
            // Claimed
            // If last claim was yesterday (by UTC), increment streak, else reset to 1
            let yesterdayUTC = (() => {
                const d = new Date(now);
                d.setUTCDate(d.getUTCDate() - 1);
                return getUTCDateString(d.getTime());
            })();
            if (lastClaimUTC === yesterdayUTC && userStreak.lastClaim) {
                userStreak.count += 1;
            } else {
                userStreak.count = 1;
            }
            userStreak.lastClaim = now;
            if (userStreak.count > (userStreak.highest || 0)) userStreak.highest = userStreak.count;

            // Give XP with multiplier
            if (!db.users[member.id].xp) db.users[member.id].xp = 0;
            db.users[member.id].xp += xpWithMultiplier;

            // Update user XP in database
            await client.db.update(int.guild.id, {
                $set: { [`users.${member.id}.xp`]: db.users[member.id].xp }
            }).exec();

            // Check milestones
            const milestones = db.settings.streak.milestones || [];
            for (const msObj of milestones) {
                if (msObj.days === userStreak.count && msObj.roleId) {
                    const guildMember = await int.guild.members.fetch(member.id).catch(() => null);
                    if (guildMember && !guildMember.roles.cache.has(msObj.roleId)) {
                        // Remove any previous milestone roles before adding the new one
                        const prevRoles = milestones
                            .filter(m => m.roleId && m.roleId !== msObj.roleId && guildMember.roles.cache.has(m.roleId))
                            .map(m => m.roleId);
                        if (prevRoles.length) {
                            await guildMember.roles.remove(prevRoles).catch(() => {});
                        }
                        await guildMember.roles.add(msObj.roleId).catch(() => {});
                        milestoneMsg = `\nYou reached a streak of **${msObj.days}** days and earned a special role!`;
                    }
                }
            }

            // Save changes
            await client.db.update(int.guild.id, { $set: { [`users.${member.id}`]: db.users[member.id] } }).exec();

            // Show multiplier in claim message if > 1
            let multiplierMsg = (multiplier !== 1 && !db.settings.hideMultipliers)
                ? `\nXP Boost: **${multiplier * 100}%**`
                : "";

            claimMsg = `✅ You claimed your daily streak!\nYou earned **${tools.commafy(xpWithMultiplier)} XP**.${multiplierMsg}${milestoneMsg}`;
        } else {
            // Use Discord dynamic timestamp for next claim
            const nextClaimUnix = Math.floor(nextUTCMidnight / 1000);
            claimMsg = `⏳ You already claimed your streak today!\nNext claim: <t:${nextClaimUnix}:R>`;
        }

        let streakFields = [
            { name: "Current Streak", value: tools.commafy(userStreak.count), inline: true },
            { name: "Highest Streak", value: tools.commafy(userStreak.highest || userStreak.count), inline: true }
        ];

        // Show next milestone if present
        const milestones = db.settings.streak.milestones || [];
        if (milestones.length) {
            // Find the next milestone above current streak
            const nextMilestone = milestones
                .filter(m => m.days > userStreak.count)
                .sort((a, b) => a.days - b.days)[0];
            if (nextMilestone) {
                streakFields.push({
                    name: "Next Milestone",
                    value: `At **${tools.commafy(nextMilestone.days)}** days${nextMilestone.roleId ? `: <@&${nextMilestone.roleId}>` : ""}`,
                    inline: false
                });
            }
        }

        // Function to get a random tip to display in the footer
        function getRandomTip() {
            const tips = [
                "🔥 Claim your streak every day to earn more XP!",
                "🏆 Reach streak milestones for special rewards!",
                "⏰ Don't miss a day or your streak will reset!",
                "💡 Use /info to check your progress daily.",
                "🎁 Higher streaks can unlock exclusive roles!"
            ];
            return tips[Math.floor(Math.random() * tips.length)];
        }

        return int.editReply({
            embeds: [tools.createEmbed({
                author: { name: int.user.displayName, iconURL: int.user.displayAvatarURL() },
                description: claimMsg,
                color: 0x00ff80,
                fields: streakFields,
                footer: {
                    text: getRandomTip(),
                    iconURL: "https://cdn3.emoji.gg/emojis/9385-sparkles-pinkpastel.gif"
                }
            })],
            ephemeral: isHidden || false,
        });
    }
}

