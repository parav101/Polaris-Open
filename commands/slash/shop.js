const Discord = require("discord.js")
const { ensureDailyQuests, tickQuest, getTodayKey } = require("../../classes/Quests.js")

module.exports = {
metadata: {
    name: "shop",
    description: "View and buy items from the credit shop",
},

async run(client, int, tools) {
    const isEphemeral = int.isButton()

    // Acknowledge immediately so Discord doesn't time out while we fetch data
    await int.deferReply({ ephemeral: isEphemeral })

    // Fetch only what the initial view needs — not the entire settings document
    let db = await client.db.fetch(int.guild.id, [
        "settings.shop",
        "settings.quests",
        `users.${int.user.id}.credits`,
    ])
    if (!db) return tools.warn("*noData")
    if (!db.settings?.shop?.enabled) return tools.warn("The shop is currently disabled in this server!")

    let credits = db.users?.[int.user.id]?.credits || 0
    let shopItems = db.settings.shop.items || []

    if (shopItems.length === 0) return tools.warn("There are no items in the shop right now!")

    let embed = tools.createEmbed({
        title: "Credit Shop",
        description: `You have **${tools.commafy(credits)}** credits.\nUse the menu below to buy an item.`,
        color: tools.COLOR,
        thumbnail: int.guild.iconURL({ dynamic: true })
    })

    let compactItems = shopItems.map(item =>
        `${item.emoji} **${item.name}** • ${tools.commafy(item.price)}<:gold:1472934905972527285> • ${item.duration}h • <@&${item.roleId}>`
    )

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

    // editReply since we already deferred
    let msg = await int.editReply({ embeds: [embed], components: [row] })

    let collector = msg.createMessageComponentCollector({
        componentType: Discord.ComponentType.StringSelect,
        time: 60000
    })

    collector.on("collect", async i => {
        if (i.user.id !== int.user.id) return i.reply({ content: "This is not for you!", ephemeral: true })

        let roleId = i.values[0]
        let item = shopItems.find(x => x.roleId === roleId)
        if (!item) return i.reply({ content: "Item not found!", ephemeral: true })

        // Acknowledge the new interaction before any async work
        try { await i.deferReply({ ephemeral: true }) } catch (e) { return }

        // Re-fetch only this user's live data (settings reused from initial load above)
        let freshDoc = await client.db.fetch(int.guild.id, [`users.${int.user.id}`])
        let freshUserData = freshDoc?.users?.[int.user.id] || { credits: 0 }
        let currentCredits = freshUserData.credits || 0

        if (currentCredits < item.price) {
            return i.editReply({ content: `You don't have enough credits! You need **${tools.commafy(item.price - currentCredits)}** more.` })
        }

        // Add role to user
        try {
            await i.member.roles.add(item.roleId)
        } catch (e) {
            return i.editReply({ content: "I couldn't give you the role! Make sure my role is above it and I have 'Manage Roles' permission." })
        }

        // Compute new state
        let expires = Date.now() + (item.duration * 3600000)
        let newTempRoles = freshUserData.tempRoles || []
        let existingTempIndex = newTempRoles.findIndex(x => x.roleId === item.roleId)
        if (existingTempIndex >= 0) {
            newTempRoles[existingTempIndex].expires = Math.max(newTempRoles[existingTempIndex].expires, Date.now()) + (item.duration * 3600000)
        } else {
            newTempRoles.push({ roleId: item.roleId, expires })
        }

        let newCredits = currentCredits - item.price

        // Quest tick (reuse db.settings from initial fetch — settings don't change mid-session)
        const questSet = {}
        if (db.settings.quests?.enabled) {
            ensureDailyQuests(freshUserData, db.settings, getTodayKey())
            tickQuest(freshUserData, "shopBuy")
            questSet[`users.${int.user.id}.quests`] = freshUserData.quests
        }

        // Inline credit log — avoids a separate DB fetch + write round-trip
        const newLog = {
            type: "shop",
            amount: -item.price,
            balance: newCredits,
            note: `Bought ${item.name} from shop (${item.duration}h)`,
            ts: Date.now()
        }
        const updatedLogs = [...(freshUserData.creditLogs || []), newLog].slice(-5)

        // Fire announcement without blocking the reply
        int.channel.send({ content: `🎉 <@${int.user.id}> just purchased **${item.emoji} ${item.name}**! <:gold:1472934905972527285> enjoy it for the next **${item.duration}h**!` }).catch(() => {})

        // DB write and reply run in parallel — user sees result without waiting for MongoDB
        await Promise.all([
            client.db.update(int.guild.id, {
                $set: {
                    [`users.${int.user.id}.credits`]: newCredits,
                    [`users.${int.user.id}.tempRoles`]: newTempRoles,
                    [`users.${int.user.id}.creditLogs`]: updatedLogs,
                    ...questSet
                }
            }),
            i.editReply({ content: `${item.emoji} **${item.name}** purchased! <:gold:1472934905972527285> **${tools.commafy(newCredits)}** left · expires in **${tools.time(item.duration * 3600000)}**` })
        ])
    })

    collector.on("end", () => {
        int.editReply({ components: [] }).catch(() => {})
    })
}}
