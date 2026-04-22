const Discord = require("discord.js")

module.exports = {
metadata: {
    name: "chests",
    description: "View and buy chests with credits to gain XP",
},

async run(client, int, tools) {

    let db = await tools.fetchSettings(int.user.id)
    if (!db) return tools.warn("*noData")
    if (!db.settings.chests.enabled) return tools.warn("Chests are currently disabled in this server!")

    let userData = db.users[int.user.id] || { credits: 0 }
    let credits = userData.credits || 0
    let chestItems = db.settings.chests.items || []

    if (chestItems.length === 0) return tools.warn("There are no chests in the shop right now!")

    let embed = tools.createEmbed({
        title: "Chests",
        description: `You have **${tools.commafy(credits)}** credits.\nUse the menu below to buy a chest.`,
        color: tools.COLOR,
        thumbnail: int.guild.iconURL({ dynamic: true })
    })

    let compactChests = chestItems.map(item => {
        return `${item.emoji} **${item.name}** • ${tools.commafy(item.price)}<:gold:1472934905972527285> • ${tools.commafy(item.xpMin)}-${tools.commafy(item.xpMax)} XP`
    })

    let chunkSize = 8
    let chestChunks = []
    for (let i = 0; i < compactChests.length; i += chunkSize) {
        chestChunks.push(compactChests.slice(i, i + chunkSize))
    }

    embed.addFields(chestChunks.map((chunk, index) => ({
        name: index === 0 ? "Chests" : "More Chests",
        value: chunk.join("\n"),
        inline: true
    })))

    let selectMenu = new Discord.StringSelectMenuBuilder()
        .setCustomId("chests_buy")
        .setPlaceholder("Select a chest to buy...")
        .addOptions(chestItems.map((item, index) => ({
            label: item.name,
            description: `${item.price} credits - ${tools.commafy(item.xpMin)}-${tools.commafy(item.xpMax)} XP`,
            value: index.toString(),
            emoji: item.emoji
        })))

    let row = new Discord.ActionRowBuilder().addComponents(selectMenu)

    let isEphemeral = int.isButton();
    let msg = await int.reply({ embeds: [embed], components: [row], fetchReply: true, ephemeral: isEphemeral })

    let collector = msg.createMessageComponentCollector({
        componentType: Discord.ComponentType.StringSelect,
        time: 60000
    })

    collector.on("collect", async i => {
        if (i.user.id !== int.user.id) return i.reply({ content: "This is not for you!", ephemeral: true })

        let chestIndex = parseInt(i.values[0])
        let item = chestItems[chestIndex]

        if (!item) return i.reply({ content: "Chest not found!", ephemeral: true })

        // Re-fetch user data to ensure up-to-date credits
        let freshDB = await tools.fetchSettings(int.user.id)
        let freshUserData = freshDB.users[int.user.id] || { credits: 0 }
        let currentCredits = freshUserData.credits || 0

        if (currentCredits < item.price) {
            return i.reply({ content: `You don't have enough credits! You need **${tools.commafy(item.price - currentCredits)}** more.`, ephemeral: true })
        }

        // Calculate the XP gained
        let xpGained = Math.floor(Math.random() * (item.xpMax - item.xpMin + 1)) + item.xpMin

        // Update database - deduct credits and add XP
        let newCredits = currentCredits - item.price
        let currentXP = freshUserData.xp || 0
        let newXP = currentXP + xpGained

        await client.db.update(int.guild.id, { 
            $set: { 
                [`users.${int.user.id}.credits`]: newCredits,
                [`users.${int.user.id}.xp`]: newXP
            } 
        })

        await tools.addCreditLog(client.db, int.guild.id, int.user.id, {
            type: "chests", 
            amount: -item.price,
            balance: newCredits,
            note: `Bought ${item.name} chest`
        }, 5, freshUserData.creditLogs || [])

        // --- Public announcement message ---
        // Send a message to the channel to encourage others
        const announcementEmbed = tools.createEmbed({
            color: tools.COLOR,
            description: `<:chest:1486740653067997394> <@${int.user.id}> just opened a **${item.emoji} ${item.name}** and gained **${tools.commafy(xpGained)}** XP!`,
        }).setThumbnail(int.user.displayAvatarURL({ dynamic: true }))

        await int.channel.send({ embeds: [announcementEmbed] }).catch(() => {})

        // Reply to the select interaction — defer first to avoid unknown interaction errors
        try {
            await i.deferReply({ ephemeral: true })
            await i.editReply({ content: `✅ **Successfully purchased ${item.emoji} ${item.name}!**\n<:chest:1486740653067997394> You gained **${tools.commafy(xpGained)}** XP!\nCredits remaining: **${tools.commafy(newCredits)}**` })
        } catch (err) {
            // Fallback: try to follow up in channel if interaction token is invalid
            try { await i.followUp({ content: `✅ Successfully purchased ${item.emoji} ${item.name}! You gained ${tools.commafy(xpGained)} XP!`, ephemeral: true }) } catch (e) {}
        }
    })

    collector.on("end", () => {
        int.editReply({ components: [] }).catch(() => {})
    })

}
}
