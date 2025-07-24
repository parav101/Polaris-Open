// const Discord = require('discord.js');

// // Track active giveaways
// const activeGiveaways = new Map();

// // Giveaway tips
// const tips = [
//     "💰 The more people join, the bigger the prize! 💰",
//     "✨ Higher level users get better luck in some giveaways! ✨",
//     "🎲 Everyone has an equal chance of winning by default! 🎲",
//     "🏆 Winners receive gold directly to their bank account! 🏆",
//     "⏱️ Don't wait too long, giveaways are time-limited! ⏱️",
//     "🎁 All participants receive a small portion of gold too! 🎁"
// ];

// /**
//  * Parse duration string into milliseconds
//  * Supports formats like: 1d, 2h, 30m, 1w, 1d12h, etc.
//  */
// function parseDuration(durationStr) {
//     if (!durationStr) return 0;

//     const durationRegex = /(\d+)([wdhms])/gi;
//     let matches;
//     let totalMs = 0;

//     while ((matches = durationRegex.exec(durationStr)) !== null) {
//         const value = parseInt(matches[1]);
//         const unit = matches[2].toLowerCase();

//         switch (unit) {
//             case 'w': totalMs += value * 7 * 24 * 60 * 60 * 1000; break; // weeks
//             case 'd': totalMs += value * 24 * 60 * 60 * 1000; break;      // days
//             case 'h': totalMs += value * 60 * 60 * 1000; break;           // hours
//             case 'm': totalMs += value * 60 * 1000; break;                // minutes
//             case 's': totalMs += value * 1000; break;                     // seconds
//         }
//     }

//     return totalMs;
// }

// module.exports = {
//     metadata: {
//         permission: "ManageGuild",
//         name: "goldgiveaway",
//         description: "Start a gold giveaway where the prize increases as more users join.",
//         args: [
//             { type: "integer", name: "base_gold", description: "Starting amount of gold for the giveaway", required: true, min: 100, max: 1000000 },
//             { type: "integer", name: "gold_per_user", description: "Additional gold per participant", required: true, min: 0, max: 100000 },
//             { type: "string", name: "duration", description: "Duration of the giveaway (e.g. 1d, 2h, 30m, 1w)", required: true },
//             { type: "channel", name: "channel", description: "Channel to send the giveaway in", required: false },
//             { type: "string", name: "description", description: "Optional description for the giveaway", required: false },
//             { type: "integer", name: "max_gold", description: "Maximum gold cap (optional)", required: false, min: 100, max: 10000000 },
//             { type: "integer", name: "min_participants", description: "Minimum participants required", required: false, min: 1, max: 1000 },
//             { type: "integer", name: "required_level", description: "Minimum level required to enter", required: false, min: 1, max: 1000 },
//             { type: "role", name: "required_role", description: "Role required to enter the giveaway", required: false },
//             { type: "integer", name: "winners", description: "Number of winners (default: 1)", required: false, min: 1, max: 10 },
//             { type: "string", name: "required_rank", description: "Required rank to enter (optional)", required: false } // <-- added
//         ]
//     },

//     async run(client, int, tools) {
//         // Check permissions
//         if (!tools.canManageServer(int.member, false) && !tools.isDev()) {
//             return tools.warn("*notMod");
//         }

//         // Get parameters
//         const baseGold = int.options.getInteger('base_gold');
//         const goldPerUser = int.options.getInteger('gold_per_user');
//         const durationString = int.options.getString('duration');
//         const targetChannel = int.options.getChannel('channel') || int.channel;
//         const description = int.options.getString('description') || "Click the button below to enter!";
//         const maxGold = int.options.getInteger('max_gold') || 0; // 0 means no cap
//         const minParticipants = int.options.getInteger('min_participants') || 1;
//         const requiredLevel = int.options.getInteger('required_level') || 0;
//         const requiredRole = int.options.getRole('required_role');
//         const winners = int.options.getInteger('winners') || 1;
//         const requiredRank = int.options.getString('required_rank'); // <-- added

//         // Parse duration
//         const durationMs = parseDuration(durationString);
//         if (durationMs <= 0) {
//             return tools.warn("Invalid duration format! Examples: 1d, 2h, 30m, 1w, 1d12h");
//         }

//         // Convert to minutes for display
//         const durationMinutes = Math.ceil(durationMs / 60000);

//         // Validate parameters
//         if (baseGold <= 0) {
//             return tools.warn("Base gold amount must be greater than 0!");
//         }

//         // Check if there's already an active giveaway in the target channel
//         if (activeGiveaways.has(targetChannel.id)) {
//             return tools.warn(`There is already an active giveaway in ${targetChannel}!`);
//         }

//         // Fetch server settings
//         const db = await tools.fetchSettings();
//         if (!db) return tools.warn("*noData");

//         // Calculate end time
//         const endTime = Date.now() + durationMs;

//         // Create giveaway data
//         const giveawayData = {
//             messageId: null,
//             channelId: targetChannel.id,
//             guildId: int.guild.id,
//             hostId: int.user.id,
//             baseGold: baseGold,
//             goldPerUser: goldPerUser,
//             maxGold: maxGold,
//             description: description,
//             participants: [],
//             endTime: endTime,
//             minParticipants: minParticipants,
//             requiredLevel: requiredLevel,
//             requiredRoleId: requiredRole?.id,
//             requiredRank: requiredRank, // <-- added
//             ended: false,
//             currentGold: baseGold,
//             winnerId: null,
//             winnerIds: [],
//             participantRewardPercent: 10, // 10% reward for participants
//             winnerCount: winners,
//             cancelled: false
//         };

//         // Acknowledge the interaction
//         await int.deferReply();

//         // Create the initial embed
//         const embed = await createGiveawayEmbed(giveawayData, int, tools);

//         // Send the giveaway message with buttons
//         try {
//             const giveawayMessage = await targetChannel.send({
//                 embeds: [embed],
//                 components: [
//                     new Discord.ActionRowBuilder().addComponents(
//                         new Discord.ButtonBuilder()
//                             .setCustomId('giveaway_enter')
//                             .setLabel('Enter Giveaway')
//                             .setStyle(Discord.ButtonStyle.Primary)
//                             .setEmoji('🎉'),
//                         new Discord.ButtonBuilder()
//                             .setCustomId('giveaway_participants')
//                             .setLabel('View Participants')
//                             .setStyle(Discord.ButtonStyle.Secondary)
//                             .setEmoji('👥')
//                     ),
//                     new Discord.ActionRowBuilder().addComponents(
//                         new Discord.ButtonBuilder()
//                             .setCustomId('giveaway_cancel')
//                             .setLabel('Cancel Giveaway')
//                             .setStyle(Discord.ButtonStyle.Danger)
//                             .setEmoji('❌')
//                     )
//                 ]
//             });

//             // Update the giveaway data with the message ID
//             giveawayData.messageId = giveawayMessage.id;

//             // Add to active giveaways map
//             activeGiveaways.set(targetChannel.id, giveawayData);

//             // Store in database
//             await storeGiveawayInDB(client, giveawayData);

//             // Reply to the user
//             await int.followUp({
//                 content: `✅ Giveaway started in ${targetChannel}! It will end in ${tools.time(durationMs, 1)}.`,
//             });

//             // --- InteractionCollector for buttons ---
//             const collector = giveawayMessage.createMessageComponentCollector({
//                 componentType: Discord.ComponentType.Button,
//                 time: durationMs
//             });

//             collector.on('collect', async (buttonInt) => {
//                 // Get the giveaway data from the channel ID
//                 const giveawayData = activeGiveaways.get(buttonInt.channel.id);

//                 if (!giveawayData) {
//                     if (!buttonInt.replied && !buttonInt.deferred) await buttonInt.reply({
//                         content: "This giveaway is no longer active or has been moved to another channel.",
//                         ephemeral: true
//                     });
//                     return;
//                 }

//                 switch (buttonInt.customId) {
//                     case 'giveaway_enter':
//                         await handleGiveawayEnter(client, buttonInt, tools, giveawayData);
//                         break;
//                     case 'giveaway_participants':
//                         await handleGiveawayParticipants(client, buttonInt, tools, giveawayData);
//                         break;
//                     case 'giveaway_cancel':
//                         await handleGiveawayCancel(client, buttonInt, tools, giveawayData);
//                         break;
//                     default:
//                         if (!buttonInt.replied && !buttonInt.deferred) await buttonInt.reply({
//                             content: "Unknown button action.",
//                             ephemeral: true
//                         });
//                 }
//             });

//             collector.on('end', async () => {
//                 // Optionally, disable buttons when collector ends
//                 try {
//                     const msg = await targetChannel.messages.fetch(giveawayMessage.id);
//                     if (msg) {
//                         await msg.edit({ components: [] });
//                     }
//                 } catch (e) { }
//             });
//             // --- End InteractionCollector ---

//             // Create a timeout for ending the giveaway
//             setTimeout(() => endGiveaway(client, int, tools, giveawayData), durationMs);

//             // Start the timer for updating the embed
//             startUpdateTimer(client, int, tools, giveawayData);
//         } catch (error) {
//             console.error("Error creating giveaway:", error);
//             return int.followUp({
//                 content: "There was an error creating the giveaway. Please try again later.",
//                 ephemeral: true
//             });
//         }
//     },

//     async handlePagination(client, int, tools) {
//         return handlePagination(client, int, tools);
//     },

//     async recoverActiveGiveaways(client, tools) {
//         return recoverActiveGiveaways(client, tools);
//     }
// };

// /**
//  * Creates an embed for the giveaway
//  */
// async function createGiveawayEmbed(giveawayData, int, tools) {
//     const { baseGold, goldPerUser, maxGold, description, participants, endTime, minParticipants, requiredLevel, requiredRoleId, participantRewardPercent, winnerCount, requiredRank } = giveawayData;

//     // Calculate current gold amount
//     let currentGold = baseGold + (participants.length * goldPerUser);
//     if (maxGold > 0 && currentGold > maxGold) {
//         currentGold = maxGold;
//     }
//     giveawayData.currentGold = currentGold;

//     // Calculate time remaining
//     const timeRemaining = endTime - Date.now();
//     const timeString = timeRemaining > 0
//         ? `<t:${Math.floor(endTime / 1000)}:R>`
//         : 'Ended';

//     // Format requirements text
//     let requirementsText = [];
//     if (minParticipants > 1) {
//         requirementsText.push(`• Minimum ${minParticipants} participants required`);
//     }
//     if (requiredLevel > 0) {
//         requirementsText.push(`• Level ${requiredLevel}+ required to enter`);
//     }
//     if (requiredRoleId) {
//         requirementsText.push(`• <@&${requiredRoleId}> role required`);
//     }
//     if (requiredRank) {
//         requirementsText.push(`• Rank "${requiredRank}" required`);
//     }

//     // Choose a random tip
//     const tip = tools.choose(tips);

//     // Create the embed
//     const embed = new Discord.EmbedBuilder()
//         .setTitle('🎉 Gold Giveaway 🎉')
//         .setDescription(description)
//         .setColor(0xFFD700) // Gold color
//         .addFields(
//             { name: '💰 Prize', value: `${tools.commafy(currentGold)} gold${winnerCount > 1 ? ` (${winnerCount} winners)` : ''}`, inline: true },
//             { name: '👥 Participants', value: `${participants.length}${minParticipants > 1 ? `/${minParticipants} minimum` : ''}`, inline: true },
//             { name: '⏱️ Time Remaining', value: timeRemaining > 0 ? timeString : 'Ended', inline: true }
//         )
//         .setFooter({
//             text: tip,
//             iconURL: "https://cdn3.emoji.gg/emojis/9385-sparkles-pinkpastel.gif"
//         })
//         .setTimestamp();

//     // Add requirements field if needed
//     if (requirementsText.length > 0) {
//         embed.addFields({ name: '⚠️ Requirements', value: requirementsText.join('\n') });
//     }

//     // Add prize growth information
//     embed.addFields({
//         name: '📈 Prize Growth',
//         value: `Base: ${tools.commafy(baseGold)} gold\n+${tools.commafy(goldPerUser)} gold per participant${maxGold > 0 ? `\nMax cap: ${tools.commafy(maxGold)} gold` : ''}`
//     });

//     // Add participant reward info
//     embed.addFields({
//         name: '🎁 Participant Reward',
//         value: `All participants will receive ${participantRewardPercent}% of the prize!`
//     });

//     // Add winner selection method info
//     embed.addFields({
//         name: '🏆 Winner Selection',
//         value: `${winnerCount > 1 ? `${winnerCount} winners will be` : 'Winner will be'} selected with equal chances for everyone.`
//     });

//     // Add host information
//     embed.addFields({ name: '🎮 Host', value: `<@${giveawayData.hostId}>` });

//     return embed;
// }

// /**
//  * Updates the giveaway message with current information
//  */
// async function updateGiveawayMessage(client, int, tools, giveawayData) {
//     if (giveawayData.ended) return;

//     try {
//         const channel = await client.channels.fetch(giveawayData.channelId);
//         if (!channel) return;

//         const message = await channel.messages.fetch(giveawayData.messageId);
//         if (!message) return;

//         const embed = await createGiveawayEmbed(giveawayData, int, tools);

//         // Update the message with the new embed
//         await message.edit({
//             embeds: [embed],
//             components: [
//                 new Discord.ActionRowBuilder().addComponents(
//                     new Discord.ButtonBuilder()
//                         .setCustomId('giveaway_enter')
//                         .setLabel('Enter Giveaway')
//                         .setStyle(Discord.ButtonStyle.Primary)
//                         .setEmoji('🎉'),
//                     new Discord.ButtonBuilder()
//                         .setCustomId('giveaway_participants')
//                         .setLabel('View Participants')
//                         .setStyle(Discord.ButtonStyle.Secondary)
//                         .setEmoji('👥')
//                 ),
//                 new Discord.ActionRowBuilder().addComponents(
//                     new Discord.ButtonBuilder()
//                         .setCustomId('giveaway_cancel')
//                         .setLabel('Cancel Giveaway')
//                         .setStyle(Discord.ButtonStyle.Danger)
//                         .setEmoji('❌')
//                 )
//             ]
//         });
//     } catch (error) {
//         console.error("Error updating giveaway message:", error);
//     }
// }

// /**
//  * Starts a timer to update the giveaway embed periodically
//  */
// function startUpdateTimer(client, int, tools, giveawayData) {
//     // Update every 30 seconds
//     const intervalId = setInterval(async () => {
//         if (giveawayData.ended || Date.now() >= giveawayData.endTime) {
//             clearInterval(intervalId);
//             return;
//         }

//         await updateGiveawayMessage(client, int, tools, giveawayData);
//     }, 30000);
// }

// /**
//  * Handles pagination for participant lists and other paginated content
//  */
// function handlePagination(client, int, tools) {
//     // Only handle pagination for participants view right now
//     if (int.message.embeds[0]?.title?.includes('Giveaway Participants')) {
//         // Get current page and total pages from footer
//         const footer = int.message.embeds[0].footer?.text || '';
//         const match = footer.match(/Page (\d+)\/(\d+)/);

//         if (!match) return int.deferUpdate();

//         let currentPage = parseInt(match[1]);
//         const totalPages = parseInt(match[2]);

//         // Update current page based on button clicked
//         if (int.customId === 'prev_page' && currentPage > 1) {
//             currentPage--;
//         } else if (int.customId === 'next_page' && currentPage < totalPages) {
//             currentPage++;
//         } else {
//             return int.deferUpdate();
//         }

//         // Get description from current embed to extract content
//         const description = int.message.embeds[0].description;
//         if (!description) return int.deferUpdate();

//         // This implementation assumes we have the full content in memory
//         // In a real implementation, you might want to re-fetch the data

//         // Create navigation row
//         const row = new Discord.ActionRowBuilder().addComponents(
//             new Discord.ButtonBuilder()
//                 .setCustomId('prev_page')
//                 .setLabel('Previous')
//                 .setStyle(Discord.ButtonStyle.Secondary)
//                 .setEmoji('⬅️')
//                 .setDisabled(currentPage === 1),
//             new Discord.ButtonBuilder()
//                 .setCustomId('next_page')
//                 .setLabel('Next')
//                 .setStyle(Discord.ButtonStyle.Secondary)
//                 .setEmoji('➡️')
//                 .setDisabled(currentPage === totalPages)
//         );

//         // Update the embed with the new page
//         const embed = Discord.EmbedBuilder.from(int.message.embeds[0])
//             .setFooter({ text: `Page ${currentPage}/${totalPages}` });

//         return int.update({ embeds: [embed], components: [row] });
//     }

//     // For other pagination, defer
//     return int.deferUpdate();
// }

// /**
//  * Ends the giveaway and selects winner(s)
//  */
// async function endGiveaway(client, int, tools, giveawayData) {
//     if (giveawayData.ended || giveawayData.cancelled) return;

//     // Mark as ended
//     giveawayData.ended = true;

//     try {
//         const channel = await client.channels.fetch(giveawayData.channelId);
//         if (!channel) return;

//         const message = await channel.messages.fetch(giveawayData.messageId);
//         if (!message) return;

//         // Check if minimum participants requirement is met
//         if (giveawayData.participants.length < giveawayData.minParticipants) {
//             // Cancel the giveaway due to not enough participants
//             const embed = Discord.EmbedBuilder.from(message.embeds[0])
//                 .setColor(0xFF0000)
//                 .setTitle('🎉 Giveaway Cancelled 🎉')
//                 .addFields({ name: '❌ Reason', value: `Not enough participants! (${giveawayData.participants.length}/${giveawayData.minParticipants} required)` })
//                 .setFooter({ text: 'Better luck next time!' });

//             await message.edit({
//                 embeds: [embed],
//                 components: []
//             });

//             // Remove from active giveaways
//             activeGiveaways.delete(giveawayData.channelId);
//             return;
//         }

//         // Select winner(s)
//         const winners = await selectWinners(giveawayData, client, tools);
//         giveawayData.winnerIds = winners.map(w => w.id);

//         if (winners.length === 0) {
//             // No valid winners found
//             const embed = Discord.EmbedBuilder.from(message.embeds[0])
//                 .setColor(0xFF0000)
//                 .setTitle('🎉 Giveaway Ended - No Winners 🎉')
//                 .addFields({ name: '❌ Result', value: 'No valid winners could be selected.' })
//                 .setFooter({ text: 'Try again later!' });

//             await message.edit({
//                 embeds: [embed],
//                 components: []
//             });
//         } else {
//             // Calculate rewards
//             const winnerGold = Math.floor(giveawayData.currentGold * (1 - giveawayData.participantRewardPercent / 100) / winners.length);
//             const participantGold = Math.floor(giveawayData.currentGold * (giveawayData.participantRewardPercent / 100) / giveawayData.participants.length);

//             // Give gold to winner(s) and participants
//             try {
//                 await distributeGoldRewards(client, giveawayData, winners, winnerGold, participantGold);
//             } catch (error) {
//                 console.error("Error distributing gold rewards:", error);
//             }

//             // Update the embed
//             const winnersText = winners.map(w => `<@${w.id}>`).join(', ');
//             const embed = Discord.EmbedBuilder.from(message.embeds[0])
//                 .setColor(0x00FF00)
//                 .setTitle('🎉 Giveaway Ended 🎉')
//                 .addFields(
//                     { name: '🏆 Winner(s)', value: winnersText },
//                     { name: '💰 Prize', value: `${tools.commafy(winnerGold)} gold per winner` },
//                     { name: '🎁 Participation Reward', value: `${tools.commafy(participantGold)} gold per participant` }
//                 )
//                 .setFooter({ text: 'Thanks for participating!' });

//             await message.edit({
//                 embeds: [embed],
//                 components: []
//             });

//             // Send a congratulation message
//             await channel.send({
//                 content: `Congratulations ${winnersText}! You won **${tools.commafy(winnerGold)} gold** in the giveaway!
// All participants received **${tools.commafy(participantGold)} gold** each as a participation reward.`,
//                 allowedMentions: { parse: ['users'] }
//             });
//         }

//         // Remove from active giveaways
//         activeGiveaways.delete(giveawayData.channelId);

//     } catch (error) {
//         console.error("Error ending giveaway:", error);
//     }
// }

// /**
//  * Distributes gold rewards to winners and participants
//  */
// async function distributeGoldRewards(client, giveawayData, winners, winnerGold, participantGold) {
//     // Use UNB API for gold distribution
//     const guildId = giveawayData.guildId;

//     // Give gold to winner(s)
//     for (const winner of winners) {
//         try {
//             // Add gold to winner's cash
//             await unbClient.editUserBalance(guildId, winner.id, { cash: winnerGold });
//         } catch (error) {
//             console.error(`Error giving gold to winner ${winner.id}:`, error);
//         }
//     }

//     // Give participation gold to all participants (except winners)
//     for (const participantId of giveawayData.participants) {
//         try {
//             if (!winners.some(w => w.id === participantId)) {
//                 await unbClient.editUserBalance(guildId, participantId, { cash: participantGold });
//             }
//         } catch (error) {
//             console.error(`Error giving participation gold to ${participantId}:`, error);
//         }
//     }
// }

// /**
//  * Selects winners based on random selection
//  */
// async function selectWinners(giveawayData, client, tools) {
//     const { participants, winnerCount } = giveawayData;
//     if (participants.length === 0) return [];
//     return getRandomWinners([...participants], winnerCount);
// }

// /**
//  * Helper to get random winners
//  */
// function getRandomWinners(participants, count) {
//     const winners = [];
//     const eligibleParticipants = [...participants];

//     for (let i = 0; i < count && eligibleParticipants.length > 0; i++) {
//         const randomIndex = Math.floor(Math.random() * eligibleParticipants.length);
//         winners.push({ id: eligibleParticipants[randomIndex] });
//         eligibleParticipants.splice(randomIndex, 1);
//     }

//     return winners;
// }

// /**
//  * Stores giveaway data in database
//  */
// async function storeGiveawayInDB(client, giveawayData) {
//     try {
//         // Use client.db if available
//         if (client.db && typeof client.db.updateGuildData === 'function') {
//             const guildId = giveawayData.guildId;

//             // Get current giveaways array or create new one
//             let guildData = await client.db.findById(guildId) || {};
//             let giveaways = guildData.giveaways || [];

//             // Add current giveaway and limit to 10 stored giveaways
//             giveaways.unshift({
//                 id: giveawayData.messageId,
//                 channelId: giveawayData.channelId,
//                 endTime: giveawayData.endTime,
//                 ended: giveawayData.ended,
//                 data: JSON.stringify(giveawayData)
//             });

//             if (giveaways.length > 10) giveaways = giveaways.slice(0, 10);

//             // Update database
//             await client.db.updateGuildData(guildId, { giveaways });
//             console.log(`Stored giveaway ${giveawayData.messageId} in database`);
//         } else {
//             // Fallback to console log for testing
//             console.log(`[MOCK DB] Storing giveaway ${giveawayData.messageId} in database`);
//         }
//     } catch (error) {
//         console.error("Error storing giveaway in DB:", error);
//     }
// }

// /**
//  * Handles when a user enters a giveaway
//  */
// async function handleGiveawayEnter(client, int, tools, giveawayData) {
//     // Check if giveaway has ended
//     if (giveawayData.ended || giveawayData.cancelled || Date.now() >= giveawayData.endTime) {
//         if (!int.replied && !int.deferred) await int.reply({
//             content: "This giveaway has already ended!",
//             ephemeral: true
//         });
//         return;
//     }

//     // Check if user is already in the giveaway
//     if (giveawayData.participants.includes(int.user.id)) {
//         if (!int.replied && !int.deferred) await int.reply({
//             content: "You have already entered this giveaway!",
//             ephemeral: true
//         });
//         return;
//     }

//     // Check level requirement if any
//     if (giveawayData.requiredLevel > 0) {
//         try {
//             // Use tools.fetchSettings and tools.getLevel
//             const db = await tools.fetchSettings(int.user.id, giveawayData.guildId);
//             const userData = db.users?.[int.user.id] || { xp: 0 };
//             const userLevel = tools.getLevel(userData.xp, db.settings);

//             if (userLevel < giveawayData.requiredLevel) {
//                 if (!int.replied && !int.deferred) await int.reply({
//                     content: `You need to be at least level ${giveawayData.requiredLevel} to enter this giveaway! Your current level is ${userLevel}.`,
//                     ephemeral: true
//                 });
//                 return;
//             }
//         } catch (error) {
//             console.error("Error checking user level:", error);
//             if (!int.replied && !int.deferred) await int.reply({
//                 content: "There was an error checking your level. Please try again later.",
//                 ephemeral: true
//             });
//             return;
//         }
//     }

//     // Check role requirement if any
//     if (giveawayData.requiredRoleId) {
//         const member = await int.guild.members.fetch(int.user.id).catch(() => null);
//         if (!member || !member.roles.cache.has(giveawayData.requiredRoleId)) {
//             if (!int.replied && !int.deferred) await int.reply({
//                 content: `You need the <@&${giveawayData.requiredRoleId}> role to enter this giveaway!`,
//                 ephemeral: true
//             });
//             return;
//         }
//     }

//     // Check rank requirement if any
//     if (giveawayData.requiredRank) {
//         try {
//             // Use tools.getRank which returns a numerical rank position
//             const userRankPosition = await tools.getRank(int.user.id, giveawayData.users);
            
//             // Parse the required rank as a number (assuming it's stored as a string like "1", "2", etc.)
//             const requiredRankPosition = parseInt(giveawayData.requiredRank);
            
//             if (isNaN(requiredRankPosition) || userRankPosition > requiredRankPosition) {
//                 if (!int.replied && !int.deferred) await int.reply({
//                     content: `You need to be at least rank ${giveawayData.requiredRank} to enter this giveaway! Your current rank is ${userRankPosition}.`,
//                     ephemeral: true
//                 });
//                 return;
//             }
//         } catch (error) {
//             console.error("Error checking user rank:", error);
//             if (!int.replied && !int.deferred) await int.reply({
//                 content: "There was an error checking your rank. Please try again later.",
//                 ephemeral: true
//             });
//             return;
//         }
//     }

//     // Add user to participants
//     giveawayData.participants.push(int.user.id);

//     // Update the giveaway message
//     if (!int.replied && !int.deferred) await int.deferUpdate();
//     await updateGiveawayMessage(client, int, tools, giveawayData);
// }

// /**
//  * Handles displaying giveaway participants
//  */
// async function handleGiveawayParticipants(client, int, tools, giveawayData) {
//     const participants = giveawayData.participants;

//     if (participants.length === 0) {
//         if (!int.replied && !int.deferred) await int.reply({
//             content: "No one has entered this giveaway yet!",
//             ephemeral: true
//         });
//         return;
//     }

//     // Format participant list
//     let participantsList = '';
//     for (let i = 0; i < Math.min(participants.length, 30); i++) {
//         participantsList += `${i + 1}. <@${participants[i]}>\n`;
//     }

//     // Create the embed
//     const embed = new Discord.EmbedBuilder()
//         .setTitle('Giveaway Participants')
//         .setDescription(participantsList)
//         .setColor(0xFFD700)
//         .setFooter({ text: `Page 1/${Math.ceil(participants.length / 30)}` });

//     // Create pagination buttons if needed
//     const components = [];
//     if (participants.length > 30) {
//         components.push(
//             new Discord.ActionRowBuilder().addComponents(
//                 new Discord.ButtonBuilder()
//                     .setCustomId('prev_page')
//                     .setLabel('Previous')
//                     .setStyle(Discord.ButtonStyle.Secondary)
//                     .setEmoji('⬅️')
//                     .setDisabled(true),
//                 new Discord.ButtonBuilder()
//                     .setCustomId('next_page')
//                     .setLabel('Next')
//                     .setStyle(Discord.ButtonStyle.Secondary)
//                     .setEmoji('➡️')
//                     .setDisabled(false)
//             )
//         );
//     }

//     if (!int.replied && !int.deferred) await int.reply({
//         embeds: [embed],
//         components: components,
//         ephemeral: true
//     });
// }

// /**
//  * Handles cancelling a giveaway
//  */
// async function handleGiveawayCancel(client, int, tools, giveawayData) {
//     const isHost = int.user.id === giveawayData.hostId;
//     const isMod = tools.canManageServer(int.member, false);
//     const isDev = tools.isDev(int.user);

//     if (!(isHost || isMod || isDev)) {
//         if (!int.replied && !int.deferred) await int.reply({
//             content: "Only the giveaway host or server admins can cancel this giveaway!",
//             ephemeral: true
//         });
//         return;
//     }

//     // Mark as cancelled
//     giveawayData.cancelled = true;
//     giveawayData.ended = true;

//     try {
//         const channel = await client.channels.fetch(giveawayData.channelId);
//         if (!channel) { return; }

//         const message = await channel.messages.fetch(giveawayData.messageId);
//         if (!message) { return; }

//         // Update the embed
//         const embed = Discord.EmbedBuilder.from(message.embeds[0])
//             .setColor(0xFF0000)
//             .setTitle('🎉 Giveaway Cancelled 🎉')
//             .addFields({ name: '❌ Cancelled By', value: `<@${int.user.id}>` })
//             .setFooter({ text: 'This giveaway was cancelled manually.' });

//         if (!int.replied && !int.deferred) await int.deferUpdate();
//         await message.edit({
//             embeds: [embed],
//             components: []
//         });

//         // Remove from active giveaways
//         activeGiveaways.delete(giveawayData.channelId);

//         if (!int.replied && !int.deferred) await int.reply({
//             content: "Giveaway successfully cancelled!",
//             ephemeral: true
//         });
//     } catch (error) {
//         console.error("Error cancelling giveaway:", error);
//         if (!int.replied && !int.deferred) await int.reply({
//             content: "There was an error cancelling the giveaway.",
//             ephemeral: true
//         });
//     }
// }

// /**
//  * Recovers active giveaways from database/persistent storage
//  */
// async function recoverActiveGiveaways(client, tools) {
//     try {
//         console.log("Recovering active giveaways...");

//         // Use client.db if available
//         if (client.db && typeof client.db.findAllGuilds === 'function') {
//             const allGuilds = await client.db.findAllGuilds() || [];

//             let recoveredCount = 0;
//             for (const guild of allGuilds) {
//                 if (!guild.giveaways || !Array.isArray(guild.giveaways)) continue;

//                 // Filter to only active giveaways
//                 const activeGiveawaysForGuild = guild.giveaways.filter(g =>
//                     !g.ended && g.endTime > Date.now()
//                 );

//                 for (const giveawayInfo of activeGiveawaysForGuild) {
//                     try {
//                         // Parse stored data
//                         const giveawayData = JSON.parse(giveawayInfo.data);
//                         if (!giveawayData) continue;

//                         // Check if channel and message still exist
//                         const channel = await client.channels.fetch(giveawayData.channelId).catch(() => null);
//                         if (!channel) continue;

//                         const message = await channel.messages.fetch(giveawayData.messageId).catch(() => null);
//                         if (!message) continue;

//                         // Set up the giveaway again
//                         activeGiveaways.set(giveawayData.channelId, giveawayData);

//                         // Update the giveaway message
//                         await updateGiveawayMessage(client, null, tools, giveawayData);

//                         // Set timeout for ending
//                         const timeRemaining = giveawayData.endTime - Date.now();
//                         if (timeRemaining > 0) {
//                             setTimeout(() => endGiveaway(client, null, tools, giveawayData), timeRemaining);
//                             startUpdateTimer(client, null, tools, giveawayData);
//                         } else {
//                             // If it should have ended already, end it now
//                             endGiveaway(client, null, tools, giveawayData);
//                         }

//                         recoveredCount++;
//                     } catch (error) {
//                         console.error("Error recovering individual giveaway:", error);
//                     }
//                 }
//             }

//             console.log(`Recovered ${recoveredCount} active giveaways`);
//         } else {
//             console.log("[MOCK RECOVERY] No database available to recover giveaways");
//         }
//     } catch (error) {
//         console.error("Error recovering active giveaways:", error);
//     }
// }
