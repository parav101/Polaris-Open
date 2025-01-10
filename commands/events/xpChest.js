const Discord = require('discord.js')

const chestTypes = [
    { type: "Common",    chance: 55, xpPercent: [1, 3],   xpCap: 100,  color: 0x969696, emoji: "📦" },
    { type: "Rare",      chance: 18, xpPercent: [5, 10],  xpCap: 300,  color: 0x0096FF, emoji: "🎁" },
    { type: "Epic",      chance: 8,  xpPercent: [15, 25], xpCap: 750,  color: 0x9400D3, emoji: "💎" },
    { type: "Legendary", chance: 2,  xpPercent: [50, 100],xpCap: 2000, color: 0xFFD700, emoji: "👑" },
    { type: "Mystic",    chance: 1,  xpPercent: [150,300],xpCap: 5000, color: 0xFF0000, emoji: "🌟" },
    { type: "Mimic",     chance: 6,  xpPercent: [-15,-5], xpCap: -3000, color: 0x000000, emoji: "👻" }
];

// Track channel activity
const channelActivity = new Map();

function getChannelActivity(channelId) {
    if (!channelActivity.has(channelId)) {
        channelActivity.set(channelId, {
            messageCount: 0,
            lastChestTime: Date.now(),
            lastMessageTime: Date.now()
        });
    }
    return channelActivity.get(channelId);
}

function shouldDropChest(channel, settings) {
    // Check if this is the configured chest drop channel
    if (!settings.chestDrops?.channelId || channel.id !== settings.chestDrops.channelId) return false;

    const activity = getChannelActivity(channel.id);
    const currentTime = Date.now();
    
    // Check conditions using settings
    const timeCondition = currentTime - activity.lastChestTime >= (settings.chestDrops.timeGap * 1000);
    const messageCondition = activity.messageCount >= settings.chestDrops.messageCount;

    // If either condition is met, roll for chest spawn
    if (timeCondition || messageCondition) {
        const shouldSpawn = Math.random() * 100 <= settings.chestDrops.chancePercent;
        
        // Reset counters if spawning chest
        if (shouldSpawn) {
            activity.messageCount = 0;
            activity.lastChestTime = currentTime;
        }
        
        return shouldSpawn;
    }

    return false;
}

async function handleChestClaim(user, chest, db, settings, tools) {
    let userData = db.users[user.id] || { xp: 0, cooldown: 0 };
    
    if (chest.type === "Mimic") {
        const xpPenaltyRatio = Math.floor(Math.random() * (Math.abs(chest.xpPercent[1] - chest.xpPercent[0]) + 1)) + Math.abs(chest.xpPercent[0]);
        let xpLost = Math.floor(userData.xp * (xpPenaltyRatio / 100));
        // Cap the loss at -3000
        if (chest.xpCap) xpLost = Math.min(xpLost, Math.abs(chest.xpCap));
        userData.xp = Math.max(0, userData.xp - xpLost);
        return { xp: -xpLost, message: `You were tricked by a Mimic! Lost ${tools.commafy(xpLost)} XP` };
    } else {
        const [rangeMin, rangeMax] = chest.xpPercent;
        const xpRatio = Math.floor(Math.random() * (rangeMax - rangeMin + 1)) + rangeMin;
        let xpGained = Math.floor(userData.xp * (xpRatio / 100));
        
        if (chest.xpCap && xpGained > chest.xpCap) xpGained = chest.xpCap;
        userData.xp += xpGained;
        
        return { xp: xpGained, message: `You found ${tools.commafy(xpGained)} XP!` };
    }
}

module.exports = {
    async run(client, message, tools) {
        // Get server settings
        let db = await tools.fetchSettings(message.author.id, message.guild.id);
        if (!db?.settings?.enabled || !db.settings.chestDrops?.enabled) return;

        // Update message count for this channel
        const activity = getChannelActivity(message.channel.id);
        activity.messageCount++;
        activity.lastMessageTime = Date.now();

        // Check if we should drop a chest
        if (!shouldDropChest(message.channel, db.settings)) return;


        // Select random chest type
        const totalChance = chestTypes.reduce((sum, c) => sum + c.chance, 0);
        const randomRoll = Math.floor(Math.random() * totalChance) + 1;
        
        let cumulativeChance = 0;
        let selectedChest = chestTypes[0];
        
        for (const chest of chestTypes) {
            cumulativeChance += chest.chance;
            if (randomRoll <= cumulativeChance) {
                selectedChest = chest;
                break;
            }
        }
        const chestEmoji = db.settings.chestDrops?.chestEmoji || "🎁";
        const keyEmoji = db.settings.chestDrops?.keyEmoji || "🗝️";

        // Create chest message
        const embed = new Discord.EmbedBuilder()
            .setTitle(`🔮 A Mysterious Chest Appeared!`)
            .setDescription(`React with ${keyEmoji} within 30 seconds to claim!`)
            // .setColor(selectedChest.color)
            .setThumbnail('https://i.imgur.com/sbkrdMP.png')
            // .setImage('https://i.imgur.com/sbkrdMP.png')
            .setTimestamp();


        const chestMsg = await message.channel.send({ embeds: [embed] });
        await chestMsg.react(keyEmoji);

        // Collect reactions
        const filter = (reaction, user) => {
            return reaction.emoji.name === 'key' && !user.bot;
        };
        const collector = chestMsg.createReactionCollector({ filter, time: 30000, max: 1 });

        collector.on('collect', async (reaction, user) => {
            const result = await handleChestClaim(user, selectedChest, db, db.settings, tools);
            
            // Update user XP in database
            await client.db.update(message.guild.id, { 
                $set: { [`users.${user.id}`]: db.users[user.id] }
            }).exec();

            // Update chest message
            const resultEmbed = new Discord.EmbedBuilder()
                .setTitle(`${chestEmoji} ${selectedChest.type} Chest Claimed!`)
                .setDescription(`${user} claimed the chest!\n${result.message}`)
                .setColor(selectedChest.color)
                .setThumbnail('https://i.imgur.com/sbkrdMP.png')
                .setTimestamp();

            chestMsg.edit({ embeds: [resultEmbed] });
        });

        collector.on('end', (collected) => {
            if (collected.size === 0) {
                const timeoutEmbed = new Discord.EmbedBuilder()
                    .setTitle(`${selectedChest.emoji} ${selectedChest.type} Chest Disappeared!`)
                    .setDescription('Nobody claimed the chest in time...')
                    .setColor(0x808080)
                    .setTimestamp();

                chestMsg.edit({ embeds: [timeoutEmbed] });
            }
        });
    }
};

// Add cleanup function to prevent memory leaks
setInterval(() => {
    const currentTime = Date.now();
    for (const [channelId, activity] of channelActivity.entries()) {
        if (currentTime - activity.lastMessageTime > 86400000) {
            channelActivity.delete(channelId);
        }
    }
}, 3600000);
