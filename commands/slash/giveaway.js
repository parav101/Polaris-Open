const Discord = require('discord.js');

const activeGiveaways = new Map();

const tips = [
    "🎉 Everyone has an equal chance of winning!",
    "⏱️ Don't wait too long — giveaways are time-limited!",
    "🎲 Winners are chosen completely at random!",
    "🏆 Make sure you meet the requirements before entering!",
    "🔔 Stay active in the server for more giveaway chances!",
    "👥 Invite friends so more giveaways get hosted!"
];

const EMOJIS = {
    INFO: "<:info:1466817220687695967>",
    LEVEL: "<:level:1466817213830009045>",
    STREAK: "🔥",
    DIVIDER: "<:extendedend:1466819484999225579>"
};

function resolveEmoji(client, guild, candidates, fallback) {
    const names = Array.isArray(candidates) ? candidates : [candidates];
    const lowerNames = names.map((n) => String(n).toLowerCase());
    const fromGuild = guild?.emojis?.cache?.find((e) => lowerNames.includes(e.name.toLowerCase()));
    if (fromGuild) return `<:${fromGuild.name}:${fromGuild.id}>`;
    const fromClient = client?.emojis?.cache?.find((e) => lowerNames.includes(e.name.toLowerCase()));
    if (fromClient) return `<:${fromClient.name}:${fromClient.id}>`;
    return fallback;
}

function getVisuals(client, guild) {
    return {
        INFO: resolveEmoji(client, guild, ["info", "information"], EMOJIS.INFO),
        LEVEL: resolveEmoji(client, guild, ["level", "lvl"], EMOJIS.LEVEL),
        STREAK: resolveEmoji(client, guild, ["streak", "fire"], EMOJIS.STREAK),
        DIVIDER: resolveEmoji(client, guild, ["extendedend", "divider"], EMOJIS.DIVIDER),
        ENTER: resolveEmoji(client, guild, ["party", "giveaway", "gift"], "🎉"),
        PEOPLE: resolveEmoji(client, guild, ["users", "members", "people"], "👥"),
        CANCEL: resolveEmoji(client, guild, ["trash", "delete", "cancel"], "🗑️"),
        TIME: resolveEmoji(client, guild, ["time", "clock"], "⏱️"),
        TROPHY: resolveEmoji(client, guild, ["trophy", "winner"], "🏆"),
        PRIZE: resolveEmoji(client, guild, ["gift", "present", "box"], "🎁")
    };
}

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
        name: "giveaway",
        description: "Start a giveaway with a custom prize title.",
        args: [
            { type: "string", name: "title", description: "What are you giving away? (e.g. Nitro, Steam Key)", required: true },
            { type: "string", name: "duration", description: "Duration (e.g. 1d, 2h, 30m)", required: true },
            { type: "channel", name: "channel", description: "Target channel", required: false },
            { type: "string", name: "description", description: "Giveaway description", required: false },
            { type: "integer", name: "min_participants", description: "Minimum participants needed", required: false, min: 1 },
            { type: "integer", name: "required_level", description: "Min level required to enter", required: false, min: 0 },
            { type: "role", name: "required_role", description: "Role required to enter", required: false },
            { type: "integer", name: "required_streak", description: "Min current streak required", required: false, min: 0 },
            { type: "integer", name: "winners", description: "Number of winners (default: 1)", required: false, min: 1, max: 20 }
        ]
    },

    async run(client, int, tools) {
        if (!tools.canManageServer(int.member, false) && !tools.isDev()) {
            return tools.warn("*notMod");
        }

        const title = int.options.getString('title');
        const durationString = int.options.getString('duration');
        const targetChannel = int.options.getChannel('channel') || int.channel;
        const description = int.options.getString('description') || "Click the button below to join the giveaway!";
        const minParticipants = int.options.getInteger('min_participants') || 1;
        const requiredLevel = int.options.getInteger('required_level') || 0;
        const requiredRole = int.options.getRole('required_role');
        const requiredStreak = int.options.getInteger('required_streak') || 0;
        const winnersCount = int.options.getInteger('winners') || 1;

        const durationMs = parseDuration(durationString);
        if (durationMs <= 0) return tools.warn("Invalid duration format! Examples: 1d, 2h, 30m, 1w");

        if (activeGiveaways.has(targetChannel.id)) {
            return tools.warn(`There is already an active giveaway in ${targetChannel}!`);
        }

        await int.deferReply({ ephemeral: true });

        const endTime = Date.now() + durationMs;
        const visuals = getVisuals(client, int.guild);
        const giveawayData = {
            id: Date.now().toString(),
            messageId: null,
            channelId: targetChannel.id,
            guildId: int.guild.id,
            hostId: int.user.id,
            prize: title,
            type: "giveaway",
            description: description,
            participants: [],
            endTime: endTime,
            minParticipants: minParticipants,
            requiredLevel: requiredLevel,
            requiredRoleId: requiredRole?.id,
            requiredStreak: requiredStreak,
            ended: false,
            winnerIds: [],
            winnerCount: winnersCount,
            cancelled: false,
            createdAt: Date.now(),
            visuals
        };

        const embed = createGiveawayEmbed(giveawayData, tools);

        try {
            const rows = [
                new Discord.ActionRowBuilder().addComponents(
                    new Discord.ButtonBuilder()
                        .setCustomId('ga_enter')
                        .setLabel('Join Giveaway')
                        .setStyle(Discord.ButtonStyle.Success)
                        .setEmoji(visuals.ENTER),
                    new Discord.ButtonBuilder()
                        .setCustomId('ga_list')
                        .setLabel('Participants')
                        .setStyle(Discord.ButtonStyle.Secondary)
                        .setEmoji(visuals.PEOPLE)
                ),
                new Discord.ActionRowBuilder().addComponents(
                    new Discord.ButtonBuilder()
                        .setCustomId('ga_cancel')
                        .setLabel('Cancel')
                        .setStyle(Discord.ButtonStyle.Danger)
                        .setEmoji(visuals.CANCEL)
                )
            ];

            const msg = await targetChannel.send({ embeds: [embed], components: rows });
            giveawayData.messageId = msg.id;
            activeGiveaways.set(targetChannel.id, giveawayData);

            await client.db.update(int.guild.id, { $push: { giveaways: giveawayData } });
            await int.editReply({ content: `✅ Giveaway started in ${targetChannel}!` });

            attachCollector(msg, client, tools, giveawayData);
            scheduleGiveawayEnd(client, tools, giveawayData);

        } catch (e) {
            console.error(e);
            return int.editReply({ content: "Error starting giveaway." });
        }
    },

    async recoverActiveGiveaways(client, tools) {
        if (client._giveawayRecoveryDone) return;
        client._giveawayRecoveryDone = true;

        let recovered = 0;
        for (const guild of client.guilds.cache.values()) {
            try {
                const doc = await client.db.fetch(guild.id, ["giveaways"]).catch(() => null);
                const giveaways = Array.isArray(doc?.giveaways) ? doc.giveaways : [];
                const active = giveaways.filter((g) => !g?.ended && Number(g?.endTime) > 0 && g?.type === "giveaway");
                if (active.length === 0) continue;

                for (const g of active) {
                    try {
                        if (!g.id) {
                            g.id = `${g.messageId || g.channelId || guild.id}-${g.endTime || Date.now()}`;
                            await client.db.update(guild.id, {
                                $set: { "giveaways.$[elem].id": g.id }
                            }, {
                                arrayFilters: [{ "elem.messageId": g.messageId }]
                            });
                        }

                        const channel = await client.channels.fetch(g.channelId).catch(() => null);
                        if (!channel) continue;
                        const message = await channel.messages.fetch(g.messageId).catch(() => null);
                        if (!message) continue;

                        g.guildId = g.guildId || guild.id;
                        g.participants = Array.isArray(g.participants) ? g.participants : [];
                        g.winnerCount = Number(g.winnerCount ?? 1);
                        g.minParticipants = Number(g.minParticipants ?? 1);
                        g.visuals = getVisuals(client, guild);

                        activeGiveaways.set(g.channelId, g);
                        await updateMsg(client, tools, g);
                        attachCollector(message, client, tools, g);

                        const remaining = Number(g.endTime) - Date.now();
                        if (remaining <= 0) await endGiveaway(client, tools, g);
                        else scheduleGiveawayEnd(client, tools, g);
                        console.log(`[Giveaway] Recovered giveaway ${g.id} in guild ${guild.id} (channel ${g.channelId}, ends ${Math.max(0, Math.floor(remaining / 1000))}s)`);
                        recovered++;
                    } catch (error) {
                        console.error("[Giveaway] Failed to recover giveaway:", error);
                    }
                }
            } catch (error) {
                console.error(`[Giveaway] Recovery failed for guild ${guild.id}:`, error);
            }
        }

        if (recovered > 0) console.log(`[Giveaway] Recovered ${recovered} active giveaway(s).`);
    }
};

function attachCollector(message, client, tools, data) {
    const remaining = Math.max(1000, Number(data?.endTime || Date.now()) - Date.now());
    const collector = message.createMessageComponentCollector({ time: remaining });
    collector.on('collect', async (bInt) => {
        const current = activeGiveaways.get(bInt.channel.id);
        if (!current) return bInt.reply({ content: "Giveaway ended.", ephemeral: true });
        if (bInt.message.id !== current.messageId) return bInt.deferUpdate();

        if (bInt.customId === 'ga_enter') {
            await handleEnter(client, bInt, tools, current);
        } else if (bInt.customId === 'ga_list') {
            await handleList(client, bInt, tools, current);
        } else if (bInt.customId === 'ga_cancel') {
            await handleCancel(client, bInt, tools, current);
        }
    });
}

function scheduleGiveawayEnd(client, tools, data) {
    const remaining = Number(data.endTime) - Date.now();
    if (remaining <= 0) {
        endGiveaway(client, tools, data);
        return;
    }
    setTimeout(() => endGiveaway(client, tools, data), remaining);
}

function createGiveawayEmbed(data, tools) {
    const visuals = data.visuals || EMOJIS;
    const participants = Array.isArray(data.participants) ? data.participants : [];
    const endTime = data.endTime;
    const minParticipants = Number(data.minParticipants ?? 1);
    const requiredLevel = Number(data.requiredLevel ?? 0);
    const requiredRoleId = data.requiredRoleId;
    const requiredStreak = Number(data.requiredStreak ?? 0);
    const winnerCount = Number(data.winnerCount ?? 1);

    const timeRemaining = endTime - Date.now();
    const timeStr = timeRemaining > 0 ? `<t:${Math.floor(endTime / 1000)}:R>` : 'Ended';

    let reqs = [];
    if (minParticipants > 1) reqs.push(`• Min ${minParticipants} participants`);
    if (requiredLevel > 0) reqs.push(`${visuals.LEVEL} Level ${requiredLevel}+`);
    if (requiredRoleId) reqs.push(`• <@&${requiredRoleId}> role`);
    if (requiredStreak > 0) reqs.push(`${visuals.STREAK} Streak ${requiredStreak}+`);

    const embed = new Discord.EmbedBuilder()
        .setTitle(`${visuals.ENTER} Giveaway`)
        .setDescription(`${data.description}\n\n${visuals.DIVIDER} Hosted by <@${data.hostId}>`)
        .setColor(0x9b59b6)
        .addFields(
            { name: `${visuals.PRIZE} Prize`, value: `**${data.prize}**\n${visuals.TROPHY} ${winnerCount} winner${winnerCount > 1 ? "s" : ""}`, inline: true },
            { name: `${visuals.PEOPLE} Participants`, value: `**${participants.length}** joined${minParticipants > 1 ? `\nMin: **${minParticipants}**` : ''}`, inline: true },
            { name: `${visuals.TIME} Ends`, value: timeStr, inline: true }
        )
        .setFooter({ text: tips[Math.floor(Math.random() * tips.length)] })
        .setTimestamp();

    if (reqs.length > 0) embed.addFields({ name: `${visuals.INFO} Requirements`, value: reqs.join('\n') });

    return embed;
}

async function handleEnter(client, int, tools, data) {
    await int.deferUpdate();

    if (data.ended || Date.now() >= data.endTime) return int.followUp({ content: "This giveaway has ended!", ephemeral: true });
    if (data.participants.includes(int.user.id)) return int.followUp({ content: "You have already entered!", ephemeral: true });

    const db = await tools.fetchSettings(int.user.id, int.guild.id);
    const user = db.users?.[int.user.id] || { xp: 0, streak: 0 };

    if (data.requiredLevel > 0) {
        const lvl = tools.getLevel(user.xp, db.settings);
        if (lvl < data.requiredLevel) return int.followUp({ content: `Level ${data.requiredLevel} required (You: ${lvl})`, ephemeral: true });
    }

    if (data.requiredStreak > 0) {
        if ((user.streak || 0) < data.requiredStreak) return int.followUp({ content: `Streak ${data.requiredStreak} required (You: ${user.streak || 0})`, ephemeral: true });
    }

    if (data.requiredRoleId) {
        const m = await int.guild.members.fetch(int.user.id).catch(() => null);
        if (!m || !m.roles.cache.has(data.requiredRoleId)) return int.followUp({ content: "You don't have the required role!", ephemeral: true });
    }

    data.participants.push(int.user.id);
    await client.db.update(int.guild.id,
        { $push: { "giveaways.$[elem].participants": int.user.id } },
        { arrayFilters: [{ "elem.id": data.id }] }
    );

    await updateMsg(client, tools, data);
}

async function handleList(client, int, tools, data) {
    if (data.participants.length === 0) return int.reply({ content: "No one has entered yet!", ephemeral: true });

    const list = data.participants.slice(0, 50).map((id, i) => `${i + 1}. <@${id}>`).join('\n');
    const embed = new Discord.EmbedBuilder()
        .setTitle('Participants List')
        .setDescription(list)
        .setColor(0x00AE86)
        .setFooter({ text: `Showing up to 50 participants` });

    return int.reply({ embeds: [embed], ephemeral: true });
}

async function handleCancel(client, int, tools, data) {
    const isMod = tools.canManageServer(int.member, false);
    if (!isMod && int.user.id !== data.hostId && !tools.isDev()) {
        return int.reply({ content: "You don't have permission to cancel this giveaway!", ephemeral: true });
    }

    data.ended = true;
    activeGiveaways.delete(data.channelId);

    await client.db.update(int.guild.id,
        { $set: { "giveaways.$[elem].ended": true, "giveaways.$[elem].cancelled": true } },
        { arrayFilters: [{ "elem.id": data.id }] }
    );

    const embed = new Discord.EmbedBuilder()
        .setTitle('Giveaway Cancelled')
        .setDescription(`The **${data.prize}** giveaway has been cancelled.`)
        .setColor(0xFF0000);

    await int.update({ embeds: [embed], components: [] });
}

async function updateMsg(client, tools, data) {
    try {
        const c = await client.channels.fetch(data.channelId);
        const m = await c.messages.fetch(data.messageId);
        const e = createGiveawayEmbed(data, tools);
        await m.edit({ embeds: [e] });
    } catch (e) {}
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
            return m.edit({
                components: [],
                embeds: [
                    new Discord.EmbedBuilder()
                        .setTitle('Giveaway Cancelled')
                        .setDescription(`Not enough participants (${data.participants.length}/${data.minParticipants}).`)
                        .setColor(0xFF0000)
                ]
            });
        }

        const winners = [];
        const pool = [...data.participants];
        for (let i = 0; i < data.winnerCount && pool.length > 0; i++) {
            const idx = Math.floor(Math.random() * pool.length);
            winners.push(pool.splice(idx, 1)[0]);
        }

        await client.db.update(data.guildId,
            { $set: { "giveaways.$[elem].ended": true, "giveaways.$[elem].winnerIds": winners } },
            { arrayFilters: [{ "elem.id": data.id }] }
        );

        const visuals = data.visuals || {};
        const winnerMentions = winners.map(id => `<@${id}>`).join(', ');

        const endEmbed = new Discord.EmbedBuilder()
            .setTitle(`${visuals.TROPHY || "🏆"} Giveaway Ended`)
            .setColor(0x00FF00)
            .addFields(
                { name: `${visuals.PRIZE || "🎁"} Prize`, value: `**${data.prize}**` },
                { name: `${visuals.TROPHY || "🏆"} Winner${winners.length > 1 ? "s" : ""}`, value: winnerMentions || "None" }
            );

        await m.edit({ embeds: [endEmbed], components: [] });
        await c.send({ content: `Congratulations ${winnerMentions}! You won **${data.prize}**! 🎉` });

    } catch (e) {
        console.error("[Giveaway] Error ending giveaway:", e);
    }
}
