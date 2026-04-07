const Discord = require("discord.js")

module.exports = {
metadata: {
    name: "shop",
    description: "View and buy items from the credit shop",
},

async run(client, int, tools) {

    let db = await tools.fetchSettings(int.user.id)
    if (!db) return tools.warn("*noData")
    if (!db.settings.shop.enabled) return tools.warn("The shop is currently disabled in this server!")

    let userData = db.users[int.user.id] || { credits: 0 }
    let credits = userData.credits || 0
    let shopItems = db.settings.shop.items || []

    if (shopItems.length === 0) return tools.warn("There are no items in the shop right now!")

    let embed = tools.createEmbed({
        title: "Credit Shop",
        description: `You have **${tools.commafy(credits)}** credits.\nUse the menu below to buy an item.`,
        color: tools.COLOR,
        thumbnail: int.guild.iconURL({ dynamic: true })
    })

    let compactItems = shopItems.map(item => {
        return `${item.emoji} **${item.name}** • ${tools.commafy(item.price)}<:gold:1472934905972527285> • ${item.duration}h • <@&${item.roleId}>`
    })

    let chunkSize = 8
    let itemChunks = []
    for (let i = 0; i < compactItems.length; i += chunkSize) {
        itemChunks.push(compactItems.slice(i, i + chunkSize))
    }

    embed.addFields(itemChunks.map((chunk, index) => ({
        name: index === 0 ? "Items" : "More Items",
        value: chunk.join("\n"),
        inline: true
    })))

    let selectMenu = new Discord.StringSelectMenuBuilder()
        .setCustomId("shop_buy")
        .setPlaceholder("Select an item to buy...")
        .addOptions(shopItems.map(item => ({
            label: item.name,
            description: `${item.price} credits - ${item.duration}h duration`,
            value: item.roleId,
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

        let roleId = i.values[0]
        let item = shopItems.find(x => x.roleId === roleId)

        if (!item) return i.reply({ content: "Item not found!", ephemeral: true })

        // Defer reply early to avoid interaction timeouts during role granting and DB updates
        try { await i.deferReply({ ephemeral: true }) } catch (e) {}

        // Re-fetch user data to ensure up-to-date credits
        let freshDB = await tools.fetchSettings(int.user.id)
        let freshUserData = freshDB.users[int.user.id] || { credits: 0 }
        let currentCredits = freshUserData.credits || 0

        if (currentCredits < item.price) {
            return i.reply({ content: `You don't have enough credits! You need **${tools.commafy(item.price - currentCredits)}** more.`, ephemeral: true })
        }

        // Add role to user
        try {
            await i.member.roles.add(item.roleId)
        } catch (e) {
            return i.reply({ content: "I couldn't give you the role! Make sure my role is above it and I have 'Manage Roles' permission.", ephemeral: true })
        }

        // Update database
        let expires = Date.now() + (item.duration * 3600000)
        let newTempRoles = freshUserData.tempRoles || []
        
        // Check if already has this role as temp role, update duration
        let existingTempIndex = newTempRoles.findIndex(x => x.roleId === item.roleId)
        if (existingTempIndex >= 0) {
            newTempRoles[existingTempIndex].expires = Math.max(newTempRoles[existingTempIndex].expires, Date.now()) + (item.duration * 3600000)
        } else {
            newTempRoles.push({ roleId: item.roleId, expires })
        }

        let newCredits = currentCredits - item.price
        
        await client.db.update(int.guild.id, {
            $set: {
                [`users.${int.user.id}.credits`]: newCredits,
                [`users.${int.user.id}.tempRoles`]: newTempRoles
            }
        })

        // Log the shop purchase
        await tools.addCreditLog(client.db, int.guild.id, int.user.id, {
            type: "shop",
            amount: -item.price,
            balance: newCredits,
            note: `Bought ${item.name} from shop (${item.duration}h)`
        })

        // --- NEW: Public announcement message ---
        // Send a message to the channel to encourage others and show off the purchase
        const announcementEmbed = tools.createEmbed({
            color: tools.COLOR,
            description: `🎉 <@${int.user.id}> just purchased **${item.emoji} ${item.name}** from the shop!\nEnjoy your new role for the next **${item.duration}** hours!`,
        }).setThumbnail(int.user.displayAvatarURL({ dynamic: true }))

        // We send it as a follow-up or a new message in the channel since the interaction reply is ephemeral
        await int.channel.send({ embeds: [announcementEmbed] }).catch(() => {})

        // Edit the previously deferred reply with the result
        try {
            await i.editReply({ content: `✅ **Successfully purchased ${item.emoji} ${item.name}!**\nCredits remaining: **${tools.commafy(newCredits)}**\nExpires in: **${tools.time(item.duration * 3600000)}**` })
        } catch (err) {
            try { await i.followUp({ content: `✅ Successfully purchased ${item.emoji} ${item.name}!`, ephemeral: true }) } catch (e) {}
        }
    })

    collector.on("end", () => {
        int.editReply({ components: [] }).catch(() => {})
    })

}}
