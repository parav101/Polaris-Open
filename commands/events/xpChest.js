const Discord = require('discord.js')
const { Client } = require('unb-api');
const botClient = new Client('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhcHBfaWQiOiIxMzQ2ODAwMjcxNzc4NTEzNTk0IiwiaWF0IjoxNzQxMTcyNjA3fQ.7wyATLfDI2Das5RSc906ND80FD51qxAcLfbF1bv9FyM');

// Default chest types for new servers
const defaultChestTypes = [
    { type: "Common",    chance: 60, xpMin: 100,  xpMax: 500,   color: 0x969696 },
    { type: "Rare",      chance: 20, xpMin: 500,  xpMax: 1000,  color: 0x0096FF },
    { type: "Epic",      chance: 10, xpMin: 1000, xpMax: 2000,  color: 0x9400D3 },
    { type: "Legendary", chance: 3,  xpMin: 2000, xpMax: 5000,  color: 0xFFD700 },
    { type: "Mystic",    chance: 1,  xpMin: 5000, xpMax: 10000, color: 0xFF0000 },
    { type: "Mimic",     chance: 6,  xpMin: -2000,xpMax: -500,  color: 0x000000 }
];

// Add a Map to track active chest spawns
const activeSpawns = new Map();

const tips = [
    "✨ Use XP boost to level up faster ✨",
    "💰 Save your gold for rare opportunities 💰",
    "🎯 Aim for Legendary chests for massive rewards 🎯",
    "📊 Track your progress using the rank command 📊"
];

function getRandomTip(tools) {
    return tools.choose(tips);
}

async function getChannelActivity(db, channelId) {
    const activity = db.settings.chestDrops.channelActivity.find(a => a.channelId === channelId);
    if (!activity) {
        const newActivity = {
            channelId,
            messageCount: 0,
            lastChestTime: Date.now()
        };
        db.settings.chestDrops.channelActivity.push(newActivity);
        return newActivity;
    }
    return activity;
}

function shouldDropChest(channel, settings, activity) {
    if (!settings.chestDrops?.channelId || channel.id !== settings.chestDrops.channelId) return false;
    
    const timePassed = Date.now() - activity.lastChestTime >= (settings.chestDrops.timeGap * 1000 * 60 * 60);
    const messageThreshold = activity.messageCount >= settings.chestDrops.messageCount;
    
    return (timePassed || messageThreshold) && Math.random() * 100 <= settings.chestDrops.chancePercent;
}

async function handleChestClaim(user, chest, db, tools, guildId) {
    let userData = db.users[user.id] || { xp: 0 };
    const xpChange = Math.floor(Math.random() * (chest.xpMax - chest.xpMin + 1)) + chest.xpMin;

    const balance = await botClient.getUserBalance(guildId, user.id);

    if (xpChange > 0 && balance.total < xpChange) {
        // User doesn't have enough gold to claim the full XP
        const partialXp = Math.floor(xpChange / 10); // Grant XP proportional to available gold
        userData.xp = Math.max(0, userData.xp + partialXp);
        return {
            xp: partialXp,
            message: `You doesn't have (${tools.commafy(xpChange)}) gold to claim all the XP! You only got ${tools.commafy(partialXp)} XP for free!`
        };
    }

    // User has enough gold or XP change is negative
    userData.xp = Math.max(0, userData.xp + xpChange);
    return {
        xp: xpChange,
        message: xpChange >= 0
            ? `You gained ${tools.commafy(xpChange)} XP costing you the same amount of gold!`
            : `You were tricked by a Mimic! Lost ${tools.commafy(Math.abs(xpChange))} gold & XP!`
    };
}

module.exports = {
    async run(client, message, tools) {
        let db = await tools.fetchSettings(message.author.id, message.guild.id);
        if (!db?.settings?.enabled || !db.settings.chestDrops?.enabled) return;
        if (message.channel.id !== db.settings.chestDrops.channelId) return;

        // Check if there's already an active spawn in this channel
        if (activeSpawns.has(message.channel.id)) return;

        // Initialize chest types if they don't exist
        if (!db.settings.chestDrops.chestTypes?.length) {
            db.settings.chestDrops.chestTypes = defaultChestTypes;
            await client.db.update(message.guild.id, {
                $set: { "settings.chestDrops.chestTypes": defaultChestTypes }
            }).exec();
        }

        const activity = await getChannelActivity(db, message.channel.id);
        activity.messageCount++;

        if (!shouldDropChest(message.channel, db.settings, activity)) {
            await client.db.update(message.guild.id, {
                $set: { "settings.chestDrops.channelActivity": db.settings.chestDrops.channelActivity }
            }).exec();
            return;
        }

        // Set active spawn lock
        activeSpawns.set(message.channel.id, true);

        try {
            // Show pre-chest message if enabled
            

            // Reset activity counter
            activity.messageCount = 0;
            activity.lastChestTime = Date.now();
            await client.db.update(message.guild.id, {
                $set: { "settings.chestDrops.channelActivity": db.settings.chestDrops.channelActivity }
            }).exec();

            // Select chest type from database
            const roll = Math.random() * 100;
            let sum = 0;
            const selectedChest = db.settings.chestDrops.chestTypes.find(
                chest => (sum += chest.chance) >= roll
            ) || db.settings.chestDrops.chestTypes[0];

            const chestEmoji = '💰';
            // const keyEmoji = db.settings.chestDrops?.keyEmoji || "🗝️";
            const embed = new Discord.EmbedBuilder()
                .setTitle(`🔮 A Mysterious Chest Appeared!`)
                .setDescription(`React with 🔎 within 30 seconds to claim!`)
                .setThumbnail('https://s6.gifyu.com/images/bMU57.gif')
                .setFooter({
                    text: getRandomTip(tools),
                    iconURL: "https://cdn3.emoji.gg/emojis/9385-sparkles-pinkpastel.gif"
                }); // Updated footer with random tip and icon URL

            const chestMsg = await message.channel.send({ embeds: [embed] });
            await chestMsg.react('🔎');

            const collector = chestMsg.createReactionCollector({ 
                filter: (reaction, user) => reaction.emoji.name === '🔎' && !user.bot,
                time: 30000,
                max: 1
            });

            collector.on('collect', async (reaction, user) => {
                const result = await handleChestClaim(user, selectedChest, db, tools,message.guild.id);
                
                await client.db.update(message.guild.id, { 
                    $set: { [`users.${user.id}`]: db.users[user.id] }
                }).exec();
                if (result.xp > 0) {
                    await botClient.editUserBalance(message.guild.id, user.id, { bank:-result.xp });
                } else {
                    await botClient.editUserBalance(message.guild.id, user.id, { bank: result.xp});
                }

                switch (selectedChest.type) {
                    case "Mimic":
                        chestMsg.edit({
                            embeds: [new Discord.EmbedBuilder()
                                .setTitle(`👻 It's a Mimic!`)
                                .setDescription(`${user} fell for the trap!\n${result.message}`)
                                .setColor(selectedChest.color)
                                .setThumbnail('https://i.imgur.com/Rf7Sulp.png') // Scary mimic image
                                .setFooter({
                                    text: getRandomTip(tools),
                                    iconURL: "https://cdn3.emoji.gg/emojis/9385-sparkles-pinkpastel.gif"
                                })] // Updated footer with random tip and icon URL
                        });
                        break;
                    case "Common":
                    case "Rare":
                        chestMsg.edit({
                            embeds: [new Discord.EmbedBuilder()
                                .setTitle(`${chestEmoji} ${selectedChest.type} Chest Claimed!`)
                                .setDescription(`${user} claimed the chest!\n${result.message}`)
                                .setColor(selectedChest.color)
                                .setThumbnail('https://s6.gifyu.com/images/bMU57.gif')
                                .setFooter({
                                    text: getRandomTip(tools),
                                    iconURL: "https://cdn3.emoji.gg/emojis/9385-sparkles-pinkpastel.gif"
                                })] // Updated footer with random tip and icon URL
                        });
                        break;
                    default:
                        chestMsg.edit({
                            embeds: [new Discord.EmbedBuilder()
                                .setTitle(`${chestEmoji} ${selectedChest.type} Chest Claimed!`)
                                .setDescription(`${user} claimed the chest!\n${result.message}`)
                                .setColor(selectedChest.color)
                                .setThumbnail('https://i.imgur.com/ID73XEz.png')
                                .setFooter({
                                    text: getRandomTip(tools),
                                    iconURL: "https://cdn3.emoji.gg/emojis/9385-sparkles-pinkpastel.gif"
                                })] // Updated footer with random tip and icon URL
                        });
                        break;
                }
            });

            // Add cleanup to collector.on('end')
            collector.on('end', collected => {
                // Remove the active spawn lock
                activeSpawns.delete(message.channel.id);
                
                if (collected.size === 0) {
                    chestMsg.edit({
                        embeds: [new Discord.EmbedBuilder()
                            .setTitle(`👀 Chest Disappeared!`)
                            .setDescription('Nobody claimed the chest in time...')
                            .setColor(0x808080)
                            .setFooter({
                                text: getRandomTip(tools),
                                iconURL: "https://cdn3.emoji.gg/emojis/9385-sparkles-pinkpastel.gif"
                            })] // Updated footer with random tip and icon URL
                    });
                }
            });
        } catch (error) {
            // Remove the active spawn lock if something goes wrong
            activeSpawns.delete(message.channel.id);
            console.error('Error in chest spawn:', error);
        }
    }
};

// Clean up any stale locks every hour
setInterval(() => {
    activeSpawns.clear();
}, 3600000);

