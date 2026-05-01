const Discord = require("discord.js")
const { ensureDailyQuests, tickQuest, getTodayKey } = require("../../classes/Quests.js")

module.exports = {
metadata: {
    name: "chests",
    description: "View and buy chests with credits to gain XP",
},

async run(client, int, tools) {
    const isEphemeral = int.isButton()

    // Acknowledge immediately so Discord doesn't time out while we fetch data
    await int.deferReply({ ephemeral: isEphemeral })

    // Fetch only what the initial view needs — not the entire settings document
    let db = await client.db.fetch(int.guild.id, [
        "settings.chests",
        "settings.quests",
        `users.${int.user.id}.credits`,
    ])
    if (!db) return tools.warn("*noData")
    if (!db.settings?.chests?.enabled) return tools.warn("Chests are currently disabled in this server!")

    let credits = db.users?.[int.user.id]?.credits || 0
    let chestItems = db.settings.chests.items || []

    if (chestItems.length === 0) return tools.warn("There are no chests in the shop right now!")

    let embed = tools.createEmbed({
        title: "Chests",
        description: `You have **${tools.commafy(credits)}** credits.\nUse the menu below to buy a chest.`,
        color: tools.COLOR,
        thumbnail: int.guild.iconURL({ dynamic: true })
    })

    let compactChests = chestItems.map(item =>
        `${item.emoji} **${item.name}** • ${tools.commafy(item.price)}<:gold:1472934905972527285> • ${tools.commafy(item.xpMin)}-${tools.commafy(item.xpMax)} XP`
    )

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

    // editReply since we already deferred
    let msg = await int.editReply({ embeds: [embed], components: [row] })

    let collector = msg.createMessageComponentCollector({
        componentType: Discord.ComponentType.StringSelect,
        time: 60000
    })

    collector.on("collect", async i => {
        if (i.user.id !== int.user.id) return i.reply({ content: "This is not for you!", ephemeral: true })

        let chestIndex = parseInt(i.values[0])
        let item = chestItems[chestIndex]
        if (!item) return i.reply({ content: "Chest not found!", ephemeral: true })

        // Acknowledge the new interaction before any async work — critical to avoid timeout
        try { await i.deferReply({ ephemeral: true }) } catch (e) { return }

        // Re-fetch only this user's live data (settings reused from initial load above)
        let freshDoc = await client.db.fetch(int.guild.id, [`users.${int.user.id}`])
        let freshUserData = freshDoc?.users?.[int.user.id] || { credits: 0 }
        let currentCredits = freshUserData.credits || 0

        if (currentCredits < item.price) {
            return i.editReply({ content: `You don't have enough credits! You need **${tools.commafy(item.price - currentCredits)}** more.` })
        }

        // Compute new state
        let xpGained = Math.floor(Math.random() * (item.xpMax - item.xpMin + 1)) + item.xpMin
        let newCredits = currentCredits - item.price
        let newXP = (freshUserData.xp || 0) + xpGained

        // Quest tick (reuse db.settings from initial fetch — settings don't change mid-session)
        const questSet = {}
        if (db.settings.quests?.enabled) {
            ensureDailyQuests(freshUserData, db.settings, getTodayKey())
            tickQuest(freshUserData, "chestOpen")
            questSet[`users.${int.user.id}.quests`] = freshUserData.quests
        }

        // Inline credit log — avoids a separate DB fetch + write round-trip
        const newLog = {
            type: "chests",
            amount: -item.price,
            balance: newCredits,
            note: `Bought ${item.name} chest`,
            ts: Date.now()
        }
        const updatedLogs = [...(freshUserData.creditLogs || []), newLog].slice(-5)

        // Fire announcement without blocking the reply
        int.channel.send({ content: `<:chest:1486740653067997394> <@${int.user.id}> just opened a **${item.emoji} ${item.name}** and gained **+${tools.commafy(xpGained)} XP**!` }).catch(() => {})

        // DB write and user reply run in parallel to reduce perceived latency
        await Promise.all([
            client.db.update(int.guild.id, {
                $set: {
                    [`users.${int.user.id}.credits`]: newCredits,
                    [`users.${int.user.id}.xp`]: newXP,
                    [`users.${int.user.id}.creditLogs`]: updatedLogs,
                    ...questSet
                }
            }),
            i.editReply({ content: `${item.emoji} **${item.name}** opened! · **+${tools.commafy(xpGained)} XP** <:gold:1472934905972527285> **${tools.commafy(newCredits)}** left` })
        ])
    })

    collector.on("end", () => {
        int.editReply({ components: [] }).catch(() => {})
    })
}
}
