const Discord = require('discord.js');

// Track active giveaways in memory for timers/collectors
const activeGiveaways = new Map();

// Giveaway tips (Optional UI flavor)
const tips = [
    "💰 The more people join, the bigger the prize! 💰",
    "🔥 Higher streaks can lead to better luck! 🔥",
    "🎲 Everyone has an equal chance of winning by default! 🎲",
    "🏆 Winners receive credits directly to their balance! 🏆",
    "⏱️ Don't wait too long, giveaways are time-limited! ⏱️",
    "🎁 All participants receive a small portion of credits too! 🎁"
];

// Custom Emojis from stats/etc. (User can replace these later)
const EMOJIS = {
    GOLD: "<:gold:1472934905972527285>",
    INFO: "<:info:1466817220687695967>",
    PROGRESS: "<:progress:1466819928110792816>",
    LEVEL: "<:level:1466817213830009045>",
    XP: "<:userxp:1466822701724340304>",
    STREAK: "🔥", // Default placeholder
    DIVIDER: "<:extendedend:1466819484999225579>"
};

/**
 * Parse duration string into milliseconds
 */
function parseDuration(durationStr) {
    if (!durationStr) return 0;
    const durationRegex = /(\d+)([wdhms])/gi;
    let matches;
    let totalMs = 0;
    while ((matches = durationRegex.exec(durationStr)) !== null) {
        const value = parseInt(matches[1]);
        const unit = matches[2].toLowerCase();
        switch (unit) {
            case 'w': totalMs += value * 7 * 24 * 60 * 60 * 1000; break;
            case 'd': totalMs += value * 24 * 60 * 60 * 1000; break;
            case 'h': totalMs += value * 60 * 60 * 1000; break;
            case 'm': totalMs += value * 60 * 1000; break;
            case 's': totalMs += value * 1000; break;
        }
    }
    return totalMs;
}

module.exports = {
    metadata: {
        permission: "ManageGuild",
        name: "creditgiveaway",
        description: "Start a credit giveaway where the prize increases as more users join.",
        args: [
            { type: "integer", name: "base_credits", description: "Starting amount of credits", required: true, min: 100, max: 1000000 },
            { type: "integer", name: "credits_per_user", description: "Additional credits per participant", required: true, min: 0, max: 100000 },
            { type: "string", name: "duration", description: "Duration (e.g. 1d, 2h, 30m)", required: true },
            { type: "channel", name: "channel", description: "Target channel", required: false },
            { type: "string", name: "description", description: "Giveaway description", required: false },
            { type: "integer", name: "max_credits", description: "Maximum credit cap", required: false, min: 100 },
            { type: "integer", name: "min_participants", description: "Minimum participants needed", required: false, min: 1 },
            { type: "integer", name: "required_level", description: "Min level required", required: false, min: 0 },
            { type: "role", name: "required_role", description: "Role required to enter", required: false },
            { type: "integer", name: "required_streak", description: "Min current streak required", required: false, min: 0 },
            { type: "integer", name: "winners", description: "Number of winners (default: 1)", required: false, min: 1, max: 20 }
        ]
    },

    async run(client, int, tools) {
        if (!tools.canManageServer(int.member, false) && !tools.isDev()) {
            return tools.warn("*notMod");
        }

        const baseCredits = int.options.getInteger('base_credits');
        const creditsPerUser = int.options.getInteger('credits_per_user');
        const durationString = int.options.getString('duration');
        const targetChannel = int.options.getChannel('channel') || int.channel;
        const description = int.options.getString('description') || "Click the button below to join the giveaway!";
        const maxCredits = int.options.getInteger('max_credits') || 0;
        const minParticipants = int.options.getInteger('min_participants') || 1;
        const requiredLevel = int.options.getInteger('required_level') || 0;
        const requiredRole = int.options.getRole('required_role');
        const requiredStreak = int.options.getInteger('required_streak') || 0;
        const winnersCount = int.options.getInteger('winners') || 1;

        const durationMs = parseDuration(durationString);
        if (durationMs <= 0) return tools.warn("Invalid duration format! Examples: 1d, 2h, 30m, 1w");

        if (activeGiveaways.has(targetChannel.id)) {
            return tools.warn(`Already an active giveaway in ${targetChannel}!`);
        }

        const endTime = Date.now() + durationMs;
        const giveawayData = {
            id: Date.now().toString(), // Using time as unique ID
            messageId: null,
            channelId: targetChannel.id,
            guildId: int.guild.id,
            hostId: int.user.id,
            baseCredits: baseCredits,
            creditsPerUser: creditsPerUser,
            maxCredits: maxCredits,
            description: description,
            participants: [],
            endTime: endTime,
            minParticipants: minParticipants,
            requiredLevel: requiredLevel,
            requiredRoleId: requiredRole?.id,
            requiredStreak: requiredStreak,
            ended: false,
            currentCredits: baseCredits,
            winnerIds: [],
            winnerCount: winnersCount,
            participantRewardPercent: 5 // 5% participation bonus
        };

        const embed = await createGiveawayEmbed(giveawayData, tools);

        try {
            const rows = [
                new Discord.ActionRowBuilder().addComponents(
                    new Discord.ButtonBuilder()
                        .setCustomId('cg_enter')
                        .setLabel('Enter Giveaway')
                        .setStyle(Discord.ButtonStyle.Success)
                        .setEmoji('🎉'),
                    new Discord.ButtonBuilder()
                        .setCustomId('cg_list')
                        .setLabel('View Participants')
                        .setStyle(Discord.ButtonStyle.Secondary)
                        .setEmoji('👥')
                ),
                new Discord.ActionRowBuilder().addComponents(
                    new Discord.ButtonBuilder()
                        .setCustomId('cg_cancel')
                        .setLabel('Cancel')
                        .setStyle(Discord.ButtonStyle.Danger)
                        .setEmoji('🗑️')
                )
            ];

            const msg = await targetChannel.send({ embeds: [embed], components: rows });
            giveawayData.messageId = msg.id;
            activeGiveaways.set(targetChannel.id, giveawayData);

            // Persist to DB
            await client.db.update(int.guild.id, { $push: { giveaways: giveawayData } });

            await int.reply({ content: `✅ Giveaway started in ${targetChannel}!`, ephemeral: true });

            const collector = msg.createMessageComponentCollector({ time: durationMs });

            collector.on('collect', async (bInt) => {
                const data = activeGiveaways.get(bInt.channel.id);
                if (!data) return bInt.reply({ content: "Giveaway ended.", ephemeral: true });

                if (bInt.customId === 'cg_enter') {
                    await handleEnter(client, bInt, tools, data);
                } else if (bInt.customId === 'cg_list') {
                    await handleList(client, bInt, tools, data);
                } else if (bInt.customId === 'cg_cancel') {
                    await handleCancel(client, bInt, tools, data);
                }
            });

            setTimeout(() => endGiveaway(client, tools, giveawayData), durationMs);
            startTimer(client, tools, giveawayData);

        } catch (e) {
            console.error(e);
            return int.reply({ content: "Error starting giveaway.", ephemeral: true });
        }
    }
};

async function createGiveawayEmbed(data, tools) {
    const { baseCredits, creditsPerUser, maxCredits, participants, endTime, minParticipants, requiredLevel, requiredRoleId, requiredStreak, winnerCount } = data;

    let total = baseCredits + (participants.length * creditsPerUser);
    if (maxCredits > 0 && total > maxCredits) total = maxCredits;
    data.currentCredits = total;

    const timeRemaining = endTime - Date.now();
    const timeStr = timeRemaining > 0 ? `<t:${Math.floor(endTime / 1000)}:R>` : 'Ended';

    let reqs = [];
    if (minParticipants > 1) reqs.push(`• Min ${minParticipants} participants`);
    if (requiredLevel > 0) reqs.push(`${EMOJIS.LEVEL} Level ${requiredLevel}+`);
    if (requiredRoleId) reqs.push(`• <@&${requiredRoleId}> role`);
    if (requiredStreak > 0) reqs.push(`${EMOJIS.STREAK} Streak ${requiredStreak}+`);

    const embed = new Discord.EmbedBuilder()
        .setTitle('🎉 Credit Giveaway 🎉')
        .setDescription(`${data.description}\n\n${EMOJIS.DIVIDER}`)
        .setColor(0x00AE86)
        .addFields(
            { name: `${EMOJIS.GOLD} Prize Pool`, value: `**${tools.commafy(total)}** credits\n(${winnerCount} winners)`, inline: true },
            { name: `👥 Participants`, value: `**${participants.length}** entered${minParticipants > 1 ? ` (Min: ${minParticipants})` : ''}`, inline: true },
            { name: `⏱️ Ends`, value: timeStr, inline: true }
        )
        .setFooter({ text: tools.choose(tips), iconURL: "https://cdn3.emoji.gg/emojis/9385-sparkles-pinkpastel.gif" })
        .setTimestamp();

    if (reqs.length > 0) embed.addFields({ name: `${EMOJIS.INFO} Requirements`, value: reqs.join('\n') });

    embed.addFields({
        name: '📈 Growth Info',
        value: `Starts at **${tools.commafy(baseCredits)}** credits\n+**${tools.commafy(creditsPerUser)}** per user${maxCredits > 0 ? `\nMax: **${tools.commafy(maxCredits)}**` : ''}`
    });

    return embed;
}

async function handleEnter(client, int, tools, data) {
    if (data.ended || Date.now() >= data.endTime) return int.reply({ content: "Ended!", ephemeral: true });
    if (data.participants.includes(int.user.id)) return int.reply({ content: "Already entered!", ephemeral: true });

    const db = await tools.fetchSettings(int.user.id, int.guild.id);
    const user = db.users?.[int.user.id] || { xp: 0, streak: 0 };

    if (data.requiredLevel > 0) {
        const lvl = tools.getLevel(user.xp, db.settings);
        if (lvl < data.requiredLevel) return int.reply({ content: `Level ${data.requiredLevel} required (You: ${lvl})`, ephemeral: true });
    }

    if (data.requiredStreak > 0) {
        if ((user.streak || 0) < data.requiredStreak) return int.reply({ content: `Streak ${data.requiredStreak} required (You: ${user.streak || 0})`, ephemeral: true });
    }

    if (data.requiredRoleId) {
        const m = await int.guild.members.fetch(int.user.id).catch(() => null);
        if (!m || !m.roles.cache.has(data.requiredRoleId)) return int.reply({ content: `Required role missing!`, ephemeral: true });
    }

    data.participants.push(int.user.id);
    await client.db.update(int.guild.id, 
        { $push: { "giveaways.$[elem].participants": int.user.id } },
        { arrayFilters: [{ "elem.id": data.id }] }
    );

    await int.deferUpdate();
    await updateMsg(client, tools, data);
}

async function handleList(client, int, tools, data) {
    if (data.participants.length === 0) return int.reply({ content: "No one yet!", ephemeral: true });
    
    // Chunk participants list for display
    const list = data.participants.slice(0, 50).map((id, i) => `${i + 1}. <@${id}>`).join('\n') || "Empty";
    const embed = new Discord.EmbedBuilder()
        .setTitle('Participants List')
        .setDescription(list)
        .setColor(0x00AE86)
        .setFooter({ text: `Showing top 50 participants` });
    
    return int.reply({ embeds: [embed], ephemeral: true });
}

async function handleCancel(client, int, tools, data) {
    const isMod = tools.canManageServer(int.member, false);
    if (!isMod && int.user.id !== data.hostId && !tools.isDev()) return int.reply({ content: "No permission!", ephemeral: true });

    data.ended = true;
    activeGiveaways.delete(data.channelId);
    
    await client.db.update(int.guild.id, 
        { $set: { "giveaways.$[elem].ended": true, "giveaways.$[elem].cancelled": true } },
        { arrayFilters: [{ "elem.id": data.id }] }
    );

    const embed = new Discord.EmbedBuilder().setTitle('Giveaway Cancelled').setColor(0xFF0000);
    await int.update({ embeds: [embed], components: [] });
}

async function updateMsg(client, tools, data) {
    try {
        const c = await client.channels.fetch(data.channelId);
        const m = await c.messages.fetch(data.messageId);
        const e = await createGiveawayEmbed(data, tools);
        await m.edit({ embeds: [e] });
    } catch (e) {}
}

function startTimer(client, tools, data) {
    const id = setInterval(() => {
        if (data.ended || Date.now() >= data.endTime) return clearInterval(id);
        updateMsg(client, tools, data);
    }, 45000);
}

async function endGiveaway(client, tools, data) {
    if (data.ended) return;
    data.ended = true;
    activeGiveaways.delete(data.channelId);

    try {
        const c = await client.channels.fetch(data.channelId);
        const m = await c.messages.fetch(data.messageId);

        if (data.participants.length < data.minParticipants) {
            await client.db.update(data.guildId, 
                { $set: { "giveaways.$[elem].ended": true } },
                { arrayFilters: [{ "elem.id": data.id }] }
            );
            return m.edit({ components: [], embeds: [new Discord.EmbedBuilder().setTitle('Cancelled').setDescription(`Not enough users (${data.participants.length}/${data.minParticipants}).`).setColor(0xFF0000)] });
        }

        const winners = [];
        const pool = [...data.participants];
        for (let i = 0; i < data.winnerCount && pool.length > 0; i++) {
            const idx = Math.floor(Math.random() * pool.length);
            winners.push(pool.splice(idx, 1)[0]);
        }

        const prize = data.currentCredits;
        // Direct DB update for winners + log
        for (const wId of winners) {
            // Fetch current balance for accurate log
            const wDoc = await client.db.fetch(data.guildId, [`users.${wId}`]).catch(() => null)
            const wOldCredits = wDoc?.users?.[wId]?.credits || 0
            const wNewCredits = wOldCredits + prize

            await client.db.update(data.guildId, {
                $set: { [`users.${wId}.credits`]: wNewCredits }
            });

            // Log the giveaway win
            const globalTools = client.globalTools
            if (globalTools?.addCreditLog) {
                await globalTools.addCreditLog(client.db, data.guildId, wId, {
                    type: "giveaway",
                    amount: prize,
                    balance: wNewCredits,
                    note: `Won credit giveaway (${data.participants.length} participants)`
                })
            }
        }

        // Finalize in DB
        await client.db.update(data.guildId, 
            { $set: { "giveaways.$[elem].ended": true, "giveaways.$[elem].winnerIds": winners } },
            { arrayFilters: [{ "elem.id": data.id }] }
        );

        const winnerMentions = winners.map(id => `<@${id}>`).join(', ');
        const endEmbed = new Discord.EmbedBuilder()
            .setTitle('🎊 Giveaway Ended 🎊')
            .setColor(0x00FF00)
            .addFields(
                { name: '🏆 Winners', value: winnerMentions || "None" },
                { name: `${EMOJIS.GOLD} Prize`, value: `${tools.commafy(prize)} credits each` }
            );

        await m.edit({ embeds: [endEmbed], components: [] });
        await c.send({ content: `Congratulations ${winnerMentions}! You won **${tools.commafy(prize)}** credits! 🎉` });

    } catch (e) {
        console.error(e);
    }
}
