const Discord = require('discord.js')

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

async function handleChestClaim(user, chest, db, tools) {
    let userData = db.users[user.id] || { xp: 0 };
    const xpChange = Math.floor(Math.random() * (chest.xpMax - chest.xpMin + 1)) + chest.xpMin;
    
    userData.xp = Math.max(0, userData.xp + xpChange);
    
    return {
        xp: xpChange,
        message: xpChange >= 0 
            ? `You found ${tools.commafy(xpChange)} XP!`
            : `You were tricked by a Mimic! Lost ${tools.commafy(Math.abs(xpChange))} XP`
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
            if (db.settings.chestDrops.showPreMessage && db.settings.chestDrops.preChestMessage) {
                const preMsg = await message.channel.send(db.settings.chestDrops.preChestMessage);
                await new Promise(resolve => setTimeout(resolve, db.settings.chestDrops.preMessageDelay * 1000));
                await preMsg.delete().catch(() => {});
            }

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

            const chestEmoji = db.settings.chestDrops?.chestEmoji || "🎁";
            const keyEmoji = db.settings.chestDrops?.keyEmoji || "🗝️";
            const embed = new Discord.EmbedBuilder()
                .setTitle(`🔮 A Mysterious Chest Appeared!`)
                .setDescription(`React with ${keyEmoji} within 30 seconds to claim!`)
                .setThumbnail('https://i.imgur.com/sbkrdMP.png')
                .setTimestamp();

            const chestMsg = await message.channel.send({ embeds: [embed] });
            await chestMsg.react(keyEmoji);

            const collector = chestMsg.createReactionCollector({ 
                filter: (reaction, user) => reaction.emoji.name === 'key' && !user.bot,
                time: 30000,
                max: 1
            });

            collector.on('collect', async (reaction, user) => {
                const result = await handleChestClaim(user, selectedChest, db, tools);
                
                await client.db.update(message.guild.id, { 
                    $set: { [`users.${user.id}`]: db.users[user.id] }
                }).exec();

                switch (selectedChest.type) {
                    case "Mimic":
                        chestMsg.edit({
                            embeds: [new Discord.EmbedBuilder()
                                .setTitle(`👻 It's a Mimic!`)
                                .setDescription(`${user} fell for the trap!\n${result.message}`)
                                .setColor(selectedChest.color)
                                .setThumbnail('https://i.imgur.com/Rf7Sulp.png') // Scary mimic image
                                .setTimestamp()]
                        });
                        break;
                    case "Common":
                    case "Rare":
                        chestMsg.edit({
                            embeds: [new Discord.EmbedBuilder()
                                .setTitle(`${chestEmoji} ${selectedChest.type} Chest Claimed!`)
                                .setDescription(`${user} claimed the chest!\n${result.message}`)
                                .setColor(selectedChest.color)
                                .setThumbnail('https://i.imgur.com/sbkrdMP.png')
                                .setTimestamp()]
                        });
                        break;
                    default:
                        chestMsg.edit({
                            embeds: [new Discord.EmbedBuilder()
                                .setTitle(`${chestEmoji} ${selectedChest.type} Chest Claimed!`)
                                .setDescription(`${user} claimed the chest!\n${result.message}`)
                                .setColor(selectedChest.color)
                                .setThumbnail('https://i.imgur.com/ID73XEz.png')
                                .setTimestamp()]
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
                            .setTitle(`${chestEmoji} Chest Disappeared!`)
                            .setDescription('Nobody claimed the chest in time...')
                            .setColor(0x808080)
                            .setTimestamp()]
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

