// Button: quests_claim~{slotIndex}~{userId}
// Claim a completed quest and award credits.

const { ensureDailyQuests, getTodayKey, computeBonusReward } = require("../../classes/Quests.js")
const { buildQuestsEmbed, buildDisabledComponents } = require("../slash/quests.js")

module.exports = {
    metadata: { name: "button:quests_claim" },

    async run(client, int, tools) {
        await int.deferUpdate()
        await int.editReply({ components: buildDisabledComponents(int.message) }).catch(() => {})

        const parts = int.customId.split("~")
        const slotIndex = parseInt(parts[1])
        const ownerId = parts[2]

        if (int.user.id !== ownerId) {
            return int.followUp({ content: "This is not your quest board!", ephemeral: true }).catch(() => {})
        }

        const db = await client.db.fetch(int.guild.id, [
            "settings.quests",
            `users.${int.user.id}.quests`,
            `users.${int.user.id}.credits`,
            `users.${int.user.id}.creditLogs`,
        ]).catch(() => null)
        if (!db) return int.followUp({ content: "Could not fetch server data.", ephemeral: true }).catch(() => {})
        if (!db.settings?.quests?.enabled) return int.followUp({ content: "Daily quests are not enabled on this server.", ephemeral: true }).catch(() => {})

        const userId = int.user.id
        if (!db.users) db.users = {}
        if (!db.users[userId]) db.users[userId] = {}

        const todayKey = getTodayKey()
        ensureDailyQuests(db.users[userId], db.settings, todayKey)

        const q = db.users[userId].quests
        const quest = q?.list?.[slotIndex]

        if (!quest) return int.followUp({ content: "Quest slot not found.", ephemeral: true }).catch(() => {})
        if (quest.claimed) return int.followUp({ content: "You already claimed that quest!", ephemeral: true }).catch(() => {})
        if (quest.progress < quest.target) return int.followUp({ content: "That quest isn't completed yet!", ephemeral: true }).catch(() => {})

        quest.claimed = true
        const newCredits = (db.users[userId].credits || 0) + quest.reward
        db.users[userId].credits = newCredits
        const creditLogs = db.users[userId].creditLogs || []
        const nextCreditLogs = creditLogs.concat({
            type: "quest",
            amount: quest.reward,
            balance: newCredits,
            note: `${quest.label} (${quest.tier} quest)`,
            ts: Date.now(),
        }).slice(-5)
        db.users[userId].creditLogs = nextCreditLogs

        client.db.update(int.guild.id, {
            $set: {
                [`users.${userId}.quests`]: q,
                [`users.${userId}.credits`]: newCredits,
                [`users.${userId}.creditLogs`]: nextCreditLogs,
            }
        }).exec().catch(() => {})

        // Rebuild embed with updated state
        const { embed, rows } = buildQuestsEmbed(tools, db, userId, int.member)
        await int.editReply({ embeds: [embed], components: rows }).catch(() => {})
        await int.followUp({
            content: `✅ Quest claimed! You earned **+${tools.commafy(quest.reward)} credits** for completing **${quest.label}**. New balance: **${tools.commafy(newCredits)}** credits.`,
            ephemeral: true,
        }).catch(() => {})
    }
}
