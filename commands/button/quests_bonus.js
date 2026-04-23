// Button: quests_bonus~{userId}
// Claim the 3/3 completion bonus (credited when all quests are claimed).

const { ensureDailyQuests, getTodayKey, computeBonusReward } = require("../../classes/Quests.js")
const { buildQuestsEmbed, buildDisabledComponents } = require("../slash/quests.js")

module.exports = {
    metadata: { name: "button:quests_bonus" },

    async run(client, int, tools) {
        await int.deferUpdate()
        await int.editReply({ components: buildDisabledComponents(int.message) }).catch(() => {})

        const parts = int.customId.split("~")
        const ownerId = parts[1]

        if (int.user.id !== ownerId) {
            return int.followUp({ content: "This is not your quest board!", ephemeral: true }).catch(() => {})
        }

        const db = await tools.fetchAll(int.guild.id)
        if (!db) return int.followUp({ content: "Could not fetch server data.", ephemeral: true }).catch(() => {})
        if (!db.settings.quests?.enabled) return int.followUp({ content: "Daily quests are not enabled on this server.", ephemeral: true }).catch(() => {})

        const userId = int.user.id
        if (!db.users) db.users = {}
        if (!db.users[userId]) db.users[userId] = {}

        const todayKey = getTodayKey()
        ensureDailyQuests(db.users[userId], db.settings, todayKey)

        const q = db.users[userId].quests
        if (!q) return int.followUp({ content: "No active quests found.", ephemeral: true }).catch(() => {})

        if (q.bonusClaimed) return int.followUp({ content: "You already claimed today's bonus!", ephemeral: true }).catch(() => {})

        const allClaimed = q.list?.length > 0 && q.list.every(quest => quest.claimed)
        if (!allClaimed) return int.followUp({ content: "Complete and claim all 3 quests first!", ephemeral: true }).catch(() => {})

        const streakCount = q.streak?.count || 0
        const bonusReward = computeBonusReward(db.settings, streakCount)

        q.bonusClaimed = true

        // Advance quest streak
        if (!q.streak) q.streak = { count: 0, highest: 0, lastAllDone: "" }
        q.streak.lastAllDone = todayKey
        q.streak.count = (q.streak.count || 0) + 1
        if (q.streak.count > (q.streak.highest || 0)) q.streak.highest = q.streak.count

        const newCredits = (db.users[userId].credits || 0) + bonusReward
        db.users[userId].credits = newCredits

        await client.db.update(int.guild.id, {
            $set: {
                [`users.${userId}.quests`]: q,
                [`users.${userId}.credits`]: newCredits,
            }
        }).exec().catch(() => {})

        await tools.addCreditLog(client.db, int.guild.id, userId, {
            type: "quest",
            amount: bonusReward,
            balance: newCredits,
            note: `3/3 daily quest bonus (streak day ${q.streak.count})`,
        }, 5, db.users[userId].creditLogs || []).catch(() => {})

        // Post announce if configured
        const announceChannelId = db.settings.quests?.announceChannelId
        if (announceChannelId) {
            const announceChannel = int.guild.channels.cache.get(announceChannelId)
                || await int.guild.channels.fetch(announceChannelId).catch(() => null)
            if (announceChannel) {
                const questStreakText = q.streak.count > 1 ? ` (🔥 ${q.streak.count}-day quest streak!)` : ""
                await announceChannel.send({
                    embeds: [tools.createEmbed({
                        description: `📜 <@${userId}> completed all 3 daily quests and earned **${tools.commafy(bonusReward)}** bonus credits!${questStreakText}`,
                        color: tools.COLOR,
                        timestamp: true,
                    })]
                }).catch(() => {})
            }
        }

        const { embed, rows } = buildQuestsEmbed(tools, db, userId, int.member)
        await int.editReply({ embeds: [embed], components: rows }).catch(() => {})
        const streakLine = q.streak.count > 1 ? ` 🔥 ${q.streak.count}-day quest streak!` : ""
        await int.followUp({
            content: `🎁 Bonus claimed! You earned **+${tools.commafy(bonusReward)} credits** for completing all 3 daily quests.${streakLine} New balance: **${tools.commafy(newCredits)}** credits.`,
            ephemeral: true,
        }).catch(() => {})
    }
}
