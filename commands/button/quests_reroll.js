// Button: quests_reroll~{userId}
// Show a select menu to pick which quest to reroll, then apply the reroll.

const Discord = require("discord.js")
const { ensureDailyQuests, rerollQuestSlot, getTodayKey } = require("../../classes/Quests.js")
const { buildQuestsEmbed, buildDisabledComponents } = require("../slash/quests.js")

const TIER_LABEL = { easy: "Easy", medium: "Medium", hard: "Hard" }

module.exports = {
    metadata: { name: "button:quests_reroll" },

    async run(client, int, tools) {
        const parts = int.customId.split("~")
        const ownerId = parts[1]

        if (int.user.id !== ownerId) {
            return int.reply({ content: "This is not your quest board!", ephemeral: true }).catch(() => {})
        }

        await int.deferUpdate()
        await int.editReply({ components: buildDisabledComponents(int.message) }).catch(() => {})

        const db = await client.db.fetch(int.guild.id, [
            "settings.quests",
            `users.${int.user.id}.quests`,
            `users.${int.user.id}.credits`,
        ]).catch(() => null)
        if (!db) return int.followUp({ content: "Could not fetch server data.", ephemeral: true }).catch(() => {})
        if (!db.settings?.quests?.enabled) return int.followUp({ content: "Daily quests are not enabled on this server.", ephemeral: true }).catch(() => {})

        const userId = int.user.id
        if (!db.users) db.users = {}
        if (!db.users[userId]) db.users[userId] = {}

        const todayKey = getTodayKey()
        ensureDailyQuests(db.users[userId], db.settings, todayKey)

        const q = db.users[userId].quests
        const rerollsUsed = q?.rerollsUsedToday || 0
        const rerollsPerDay = db.settings.quests?.rerollsPerDay ?? 1
        const rerollCost = db.settings.quests?.rerollCost ?? 100

        if (rerollsUsed >= rerollsPerDay) {
            return int.followUp({ content: `You have no rerolls left today.`, ephemeral: true }).catch(() => {})
        }

        // Only offer unclaimed, incomplete quests
        const rerollableQuests = (q?.list || [])
            .map((quest, i) => ({ quest, i }))
            .filter(({ quest }) => !quest.claimed)

        if (!rerollableQuests.length) {
            return int.followUp({ content: "No quests available to reroll.", ephemeral: true }).catch(() => {})
        }

        // Build a select menu to choose which quest to reroll
        const selectMenu = new Discord.StringSelectMenuBuilder()
            .setCustomId(`quests_reroll_pick~${userId}`)
            .setPlaceholder(`Select a quest to reroll (costs ${tools.commafy(rerollCost)} credits)`)
            .addOptions(rerollableQuests.map(({ quest, i }) => ({
                label: `${TIER_LABEL[quest.tier] || quest.tier}: ${quest.label}`,
                description: quest.description.length > 80 ? quest.description.slice(0, 77) + "…" : quest.description,
                value: String(i),
            })))

        const selectRow = new Discord.ActionRowBuilder().addComponents(selectMenu)
        const rerollMsg = await int.followUp({ content: `Which quest do you want to reroll? (costs **${tools.commafy(rerollCost)}** credits)`, components: [selectRow], ephemeral: true, fetchReply: true }).catch(() => null)
        if (!rerollMsg) return

        const collector = rerollMsg.createMessageComponentCollector({
            componentType: Discord.ComponentType.StringSelect,
            time: 30000,
            max: 1,
        })

        collector.on("collect", async sel => {
            if (sel.user.id !== userId) return sel.reply({ content: "Not for you!", ephemeral: true }).catch(() => {})
            await sel.deferUpdate()
            await int.editReply({ components: buildDisabledComponents(int.message) }).catch(() => {})

            const slotIndex = parseInt(sel.values[0])
            // Re-fetch fresh data before writing
            const freshDB = await client.db.fetch(int.guild.id, [
                "settings.quests",
                `users.${userId}.quests`,
                `users.${userId}.credits`,
                `users.${userId}.creditLogs`,
            ]).catch(() => null)
            if (!freshDB) return

            if (!freshDB.users) freshDB.users = {}
            if (!freshDB.users[userId]) freshDB.users[userId] = {}
            ensureDailyQuests(freshDB.users[userId], freshDB.settings, todayKey)

            const result = rerollQuestSlot(freshDB.users[userId], freshDB.settings, slotIndex)
            if (!result.success) {
                return int.followUp({ content: result.reason, ephemeral: true }).catch(() => {})
            }

            const creditLogs = freshDB.users[userId].creditLogs || []
            const nextCreditLogs = creditLogs.concat({
                type: "quest_reroll",
                amount: -result.costPaid,
                balance: freshDB.users[userId].credits,
                note: `Quest reroll — new quest: ${result.quest.label} (${result.quest.tier})`,
                ts: Date.now(),
            }).slice(-5)
            freshDB.users[userId].creditLogs = nextCreditLogs
            client.db.update(int.guild.id, {
                $set: {
                    [`users.${userId}.quests`]: freshDB.users[userId].quests,
                    [`users.${userId}.credits`]: freshDB.users[userId].credits,
                    [`users.${userId}.creditLogs`]: nextCreditLogs,
                }
            }).exec().catch(() => {})

            const { embed, rows } = buildQuestsEmbed(tools, freshDB, userId, int.member)
            await int.editReply({ embeds: [embed], components: rows }).catch(() => {})
            await sel.editReply({
                content: `🔄 Quest rerolled! **${result.quest.label}** is your new ${result.quest.tier} quest. (-${tools.commafy(result.costPaid)} credits) New balance: **${tools.commafy(freshDB.users[userId].credits)}** credits.`,
                components: [],
            }).catch(() => {})
        })

        collector.on("end", (_, reason) => {
            if (reason === "time") {
                rerollMsg.edit({ content: "Reroll timed out.", components: [] }).catch(() => {})
            }
        })
    }
}
