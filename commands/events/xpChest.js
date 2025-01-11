const Discord = require('discord.js')

const chestTypes = [
    { type: "Common",    chance: 60, xp: [100, 500],    color: 0x969696 },
    { type: "Rare",      chance: 20, xp: [500, 1000],   color: 0x0096FF },
    { type: "Epic",      chance: 10,  xp: [1000, 2000],  color: 0x9400D3 },
    { type: "Legendary", chance: 3,  xp: [2000, 5000],  color: 0xFFD700 },
    { type: "Mystic",    chance: 1,  xp: [5000, 10000], color: 0xFF0000 },
    { type: "Mimic",     chance: 6,  xp: [-2000, -500], color: 0x000000 }
];

// Simple channel activity tracking
const channelActivity = new Map();

function getChannelActivity(channelId) {
    if (!channelActivity.has(channelId)) {
        channelActivity.set(channelId, {
            messageCount: 0,
            lastChestTime: Date.now()
        });
    }
    return channelActivity.get(channelId);
}

function shouldDropChest(channel, settings) {
    if (!settings.chestDrops?.channelId || channel.id !== settings.chestDrops.channelId) return false;
    
    const activity = getChannelActivity(channel.id);
    const timePassed = Date.now() - activity.lastChestTime >= (settings.chestDrops.timeGap * 1000);
    const messageThreshold = activity.messageCount >= settings.chestDrops.messageCount;
    
    return (timePassed || messageThreshold) && Math.random() * 100 <= settings.chestDrops.chancePercent;
}

async function handleChestClaim(user, chest, db, tools) {
    let userData = db.users[user.id] || { xp: 0 };
    const [min, max] = chest.xp;
    const xpChange = Math.floor(Math.random() * (max - min + 1)) + min;
    
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

        const activity = getChannelActivity(message.channel.id);
        activity.messageCount++;

        if (!shouldDropChest(message.channel, db.settings)) return;

        // Reset activity counter
        activity.messageCount = 0;
        activity.lastChestTime = Date.now();

        // Quick chest type selection
        const roll = Math.random() * 100;
        let sum = 0;
        const selectedChest = chestTypes.find(chest => (sum += chest.chance) >= roll) || chestTypes[0];
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

            // Different embed for mimics
            if (selectedChest.type === "Mimic") {
                chestMsg.edit({
                    embeds: [new Discord.EmbedBuilder()
                        .setTitle(`👻 It's a Mimic!`)
                        .setDescription(`${user} fell for the trap!\n${result.message}`)
                        .setColor(selectedChest.color)
                        .setThumbnail('https://i.imgur.com/Rf7Sulp.png') // Scary mimic image
                        .setTimestamp()]
                });
            } else {
                chestMsg.edit({
                    embeds: [new Discord.EmbedBuilder()
                        .setTitle(`${chestEmoji} ${selectedChest.type} Chest Claimed!`)
                        .setDescription(`${user} claimed the chest!\n${result.message}`)
                        .setColor(selectedChest.color)
                        .setThumbnail('https://i.imgur.com/sbkrdMP.png')
                        .setTimestamp()]
                });
            }
        });

        collector.on('end', collected => {
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
    }
};

// Cleanup inactive channels every hour
setInterval(() => {
    const currentTime = Date.now();
    channelActivity.forEach((value, key) => {
        if (currentTime - value.lastChestTime > 3600000) {
            channelActivity.delete(key);
        }
    });
}, 3600000);
