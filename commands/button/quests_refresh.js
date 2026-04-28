// Button: quests_refresh~{userId}
// Re-render the quest board with fresh state.

const { ensureDailyQuests, getTodayKey } = require("../../classes/Quests.js")
const { buildQuestsEmbed, buildDisabledComponents } = require("../slash/quests.js")

module.exports = {
    metadata: { name: "button:quests_refresh" },

    async run(client, int, tools) {
        await int.deferUpdate()
        await int.editReply({ components: buildDisabledComponents(int.message) }).catch(() => {})

        const parts = int.customId.split("~")
        const ownerId = parts[1]
        if (int.user.id !== ownerId) {
            return int.followUp({ content: "This is not your quest board!", ephemeral: true }).catch(() => {})
        }

        const userId = int.user.id
        let db = await client.db.fetch(int.guild.id, [
            "settings.quests",
            `users.${userId}.quests`,
        ]).catch(() => null)

        if (!db) {
            return int.followUp({ content: "Could not fetch server data.", ephemeral: true }).catch(() => {})
        }

        if (!db.settings) db.settings = {}
        if (!db.users) db.users = {}
        if (!db.settings.quests?.enabled) {
            return int.followUp({ content: "Daily quests are not enabled on this server.", ephemeral: true }).catch(() => {})
        }
        if (!db.users[userId]) db.users[userId] = {}

        const todayKey = getTodayKey()
        const wasReset = ensureDailyQuests(db.users[userId], db.settings, todayKey)
        if (wasReset) {
            await client.db.update(int.guild.id, {
                $set: { [`users.${userId}.quests`]: db.users[userId].quests }
            }).exec().catch(() => {})
        }

        const { embed, rows } = buildQuestsEmbed(tools, db, userId, int.member)
        await int.editReply({ embeds: [embed], components: rows }).catch(() => {})
    }
}
