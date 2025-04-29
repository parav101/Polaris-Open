const Discord = require('discord.js');
const ms = require('ms');
const streakButtonCustomId = 'streak_claim_button';

module.exports = {
    metadata: {
        name: "streakbutton",
        description: "Send a message with a button for users to claim their daily streak.",
        args: [
            { type: "channel", name: "channel", description: "Channel to send the streak button in", required: false },
            { type: "string", name: "message", description: "Custom message to display above the button", required: false }
        ]
    },

    async run(client, int, tools) {
        const targetChannel = int.options.getChannel('channel') || int.channel;
        const customMsg = int.options.getString('message') || "Click the button below to claim your daily streak!";

        // Fetch last claimed user from cache or DB (simple in-memory for this message)
        let lastClaimedUser = null;
        let lastClaimedTime = null;

        // Send the streak button message
        const embed = new Discord.EmbedBuilder()
            .setTitle('🔥 Daily Streak Challenge 🔥')
            .setDescription(customMsg)
            .setColor(0x00ff80)
            .addFields(
                { name: "Last Claimed By", value: "No one yet! Be the first!", inline: false }
            )
            .setFooter({ text: "Claim your streak every day for rewards!", iconURL: "https://cdn3.emoji.gg/emojis/9385-sparkles-pinkpastel.gif" });

        const row = new Discord.ActionRowBuilder().addComponents(
            new Discord.ButtonBuilder()
                .setCustomId(streakButtonCustomId)
                .setLabel('Claim Streak')
                .setStyle(Discord.ButtonStyle.Success)
                .setEmoji('🔥')
        );

        const sentMsg = await targetChannel.send({ embeds: [embed], components: [row] });

        await int.reply({ content: `✅ Streak button sent in ${targetChannel}!`, ephemeral: true });

        // Set up collector for the button
        const collector = sentMsg.createMessageComponentCollector({
            componentType: Discord.ComponentType.Button,
            time: ms('7d') // Collector lasts 7 days, adjust as needed
        });

        // Store last claimed user for this message
        let lastClaimed = {
            user: null,
            time: null
        };

        collector.on('collect', async (buttonInt) => {
            if (buttonInt.customId !== streakButtonCustomId) return;

            // Run the streak claim logic for the user, but always ephemeral
            const claimResult = await handleStreakClaim(client, buttonInt, tools);

            // Only update the embed if the claim was successful
            if (claimResult && claimResult.success) {
                lastClaimed.user = buttonInt.user;
                lastClaimed.time = Date.now();

                const funFacts = [
                    "Did you know? The longest recorded daily streak in history is over 2000 days!",
                    "Tip: Invite your friends to win gold",
                    "Fun Fact: Claiming your streak boosts your XP and unlocks cool roles.",
                    "Pro Tip: Set a reminder so you never miss your streak!",
                    "🔥 Keep the fire burning! Every day counts."
                ];
                const randomFact = funFacts[Math.floor(Math.random() * funFacts.length)];

                // Show the user's total streak in the message
                const streakCount = claimResult.streakCount || 1;
                function ordinal(n) {
                    const s = ["th", "st", "nd", "rd"],
                        v = n % 100;
                    return n + (s[(v - 20) % 10] || s[v] || s[0]);
                }

                const updatedEmbed = Discord.EmbedBuilder.from(sentMsg.embeds[0])
                    .setFields([
                        {
                            name: "Last Claimed By",
                            value: `<@${lastClaimed.user.id}> just claimed their **${ordinal(streakCount)}** streak!\n<t:${Math.floor(lastClaimed.time/1000)}:R>`,
                            inline: false
                        }
                    ])
                    .setFooter({ text: randomFact, iconURL: "https://cdn3.emoji.gg/emojis/9385-sparkles-pinkpastel.gif" });

                await sentMsg.edit({ embeds: [updatedEmbed] });
            }
        });

        collector.on('end', async () => {
            try {
                await sentMsg.edit({ components: [] });
            } catch (e) {}
        });
    }
};

// --- Helper function to handle streak claim logic (adapted from streak.js) ---
async function handleStreakClaim(client, int, tools) {
    let member = int.member;
    // Defer reply as soon as possible to avoid timeout
    await int.deferReply({ ephemeral: true });
    // fetch server streak settings
    let db = await tools.fetchSettings(member.id);
    if (!db) return int.editReply({ content: "*noData", ephemeral: true });
    if (!db.settings.streak?.enabled) return int.editReply({ content: "Streak system is not enabled on this server.", ephemeral: true });

    // fetch user streak data
    if (!db.users[member.id]) db.users[member.id] = {};
    if (!db.users[member.id].streak) {
        db.users[member.id].streak = { count: 0, lastClaim: 0, highest: 0 };
    }
    const userStreak = db.users[member.id].streak;

    const now = Date.now();
    function getUTCDateString(ts) {
        const d = new Date(ts);
        return d.getUTCFullYear() + '-' +
            String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
            String(d.getUTCDate()).padStart(2, '0');
    }
    const todayUTC = getUTCDateString(now);
    const lastClaimUTC = userStreak.lastClaim ? getUTCDateString(userStreak.lastClaim) : null;

    const canClaim = todayUTC !== lastClaimUTC;
    const nextUTCMidnight = (() => {
        const d = new Date(now);
        d.setUTCHours(24, 0, 0, 0);
        return d.getTime();
    })();
    const timeLeft = nextUTCMidnight - now;

    let claimMsg = "";
    let xp = db.settings.streak.xpPerClaim || 0;
    let milestoneMsg = "";

    let multiplierData = tools.getMultiplier(member, db.settings);
    let multiplier = multiplierData.multiplier || 1;
    let xpWithMultiplier = Math.round(xp * multiplier);

    if (canClaim) {
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

        if (!db.users[member.id].xp) db.users[member.id].xp = 0;
        db.users[member.id].xp += xpWithMultiplier;

        await client.db.update(int.guild.id, {
            $set: { [`users.${member.id}.xp`]: db.users[member.id].xp }
        }).exec();

        // Check milestones
        const milestones = db.settings.streak.milestones || [];
        for (const msObj of milestones) {
            if (msObj.days === userStreak.count && msObj.roleId) {
                const guildMember = await int.guild.members.fetch(member.id).catch(() => null);
                if (guildMember && !guildMember.roles.cache.has(msObj.roleId)) {
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

        await client.db.update(int.guild.id, { $set: { [`users.${member.id}`]: db.users[member.id] } }).exec();

        let multiplierMsg = (multiplier !== 1 && !db.settings.hideMultipliers)
            ? `\nXP Boost: **${multiplier * 100}%**`
            : "";

        claimMsg = `✅ You claimed your daily streak!\nYou earned **${tools.commafy(xpWithMultiplier)} XP**.${multiplierMsg}${milestoneMsg}`;
        // Indicate success and pass streak count
        var claimSuccess = true;
        var streakCount = userStreak.count;
    } else {
        const nextClaimUnix = Math.floor(nextUTCMidnight / 1000);
        claimMsg = `⏳ You already claimed your streak today!\nNext claim: <t:${nextClaimUnix}:R>`;
        var claimSuccess = false;
        var streakCount = userStreak.count;
    }

    let streakFields = [
        { name: "Current Streak", value: tools.commafy(userStreak.count), inline: true },
        { name: "Highest Streak", value: tools.commafy(userStreak.highest || userStreak.count), inline: true }
    ];

    const milestones = db.settings.streak.milestones || [];
    if (milestones.length) {
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

    await int.editReply({
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
        ephemeral: true
    });
    return { success: claimSuccess, streakCount };
}
