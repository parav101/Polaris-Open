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

        // Update streak based on activity (this will also handle XP and milestones)
        await tools.updateStreak(member, db, client);

        // Re-fetch user streak data after update
        db = await tools.fetchSettings(member.id);
        const userStreak = db.users[member.id].streak;

        // Calculate next UTC midnight for time left
        const now = Date.now();
        const nextUTCMidnight = (() => {
            const d = new Date(now);
            d.setUTCHours(24, 0, 0, 0);
            return d.getTime();
        })();
        const nextClaimUnix = Math.floor(nextUTCMidnight / 1000);

        let claimMsg = `Your streak has been updated!`;
        if (userStreak.lastClaim && (now - userStreak.lastClaim) < ms('24h')) { // Check if claimed recently
            claimMsg = `⏳ You already updated your streak today!\nNext update: <t:${nextClaimUnix}:R>`;
        } else {
            // This part might not be strictly necessary if updateStreak handles all logic,
            // but it ensures the message reflects the outcome of the update.
            let xp = db.settings.streak.xpPerClaim || 0;
            let multiplierData = tools.getMultiplier(member, db.settings);
            let multiplier = multiplierData.multiplier || 1;
            let xpWithMultiplier = Math.round(xp * multiplier);

            let multiplierMsg = (multiplier !== 1 && !db.settings.hideMultipliers)
                ? `\nXP Boost: **${multiplier * 100}%**`
                : "";
            
            claimMsg = `✅ Your streak has been updated!\nYou earned **${tools.commafy(xpWithMultiplier)} XP**.${multiplierMsg}`;
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

