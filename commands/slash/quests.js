const Discord = require("discord.js")
const { ensureDailyQuests, computeBonusReward, allQuestsDone, allQuestsClaimed, getTodayKey } = require("../../classes/Quests.js")

const TIER_EMOJI  = { easy: "🟢", medium: "🟡", hard: "🔴" }
const TIER_LABEL  = { easy: "Easy",  medium: "Medium",  hard: "Hard" }

/**
 * Build the [████░░░] progress bar in the same style as /calculate.
 */
function makeBar(progress, target) {
    const barSize = 25
    const pct = target > 0 ? Math.min(100, progress / target * 100) : 100
    const filled = Math.round(pct / (100 / barSize))
    const label = progress >= target ? "DONE ✅" : `${Number(pct.toFixed(1))}%`
    return `\`[${"█".repeat(filled)}${"░".repeat(barSize - filled)}]\` ${label}`
}

/**
 * Build the full quests embed + action rows for the given user data.
 */
function buildQuestsEmbed(tools, db, userId, member) {
    const q = db.users[userId]?.quests
    const questSettings = db.settings.quests || {}
    const list = q?.list || []

    const streakCount  = q?.streak?.count  || 0
    const streakHighest = q?.streak?.highest || 0
    const bonusClaimed = q?.bonusClaimed || false
    const rerollsUsed  = q?.rerollsUsedToday || 0
    const rerollsPerDay = questSettings.rerollsPerDay ?? 1
    const rerollCost    = questSettings.rerollCost ?? 100

    const bonusReward = computeBonusReward(db.settings, streakCount)

    // Calculate next UTC midnight timestamp
    const nowMs = Date.now()
    const nextMidnightMs = (() => {
        const d = new Date(nowMs)
        d.setUTCHours(24, 0, 0, 0)
        return d.getTime()
    })()
    const nextResetUnix = Math.floor(nextMidnightMs / 1000)

    // Build the fields for each quest
    const fields = list.map((quest, i) => {
        const tier = TIER_EMOJI[quest.tier] || "⚪"
        const label = TIER_LABEL[quest.tier] || quest.tier
        const bar = makeBar(quest.progress, quest.target)
        const progressText = `${tools.commafy(quest.progress)} / ${tools.commafy(quest.target)}`
        const rewardText = quest.claimed ? "Claimed!" : `${tools.commafy(quest.reward)} credits`

        const statusIcon = quest.claimed ? "✅" : quest.progress >= quest.target ? "🎉" : "⏳"

        return {
            name: `${statusIcon} ${tier} ${label}: ${quest.label}`,
            value: [
                quest.description,
                bar,
                `Progress: **${progressText}** · Reward: **${rewardText}**`,
            ].join("\n"),
            inline: false,
        }
    })

    if (!list.length) {
        fields.push({
            name: "No quests available",
            value: "No quest templates are configured for this server yet.\nAsk a server admin to add quest templates on the dashboard.",
            inline: false,
        })
    }

    // Quest streak info
    const streakText = streakCount > 0
        ? `🔥 **${streakCount}** day streak (highest: **${streakHighest}**)` +
          (streakCount > 0 ? ` · bonus ×${(1 + (questSettings.streakBonusMultiplier ?? 0.1) * Math.min(streakCount, questSettings.streakBonusCap ?? 7)).toFixed(1)}` : "")
        : "No active quest streak yet — complete all 3 daily quests to start one!"

    const embed = tools.createEmbed({
        author: { name: member.user.displayName, iconURL: member.user.displayAvatarURL() },
        title: "📜 Daily Quests",
        description: [
            `Complete all 3 daily quests to earn a **bonus ${tools.commafy(bonusReward)} credits**!`,
            `Resets <t:${nextResetUnix}:R> · ${streakText}`,
        ].join("\n"),
        color: tools.COLOR,
        fields,
    })

    // --- Action rows ---
    const rows = []

    // Row 1: Claim buttons for completed quests (up to 3)
    const claimBtns = list.map((quest, i) => {
        const done = quest.progress >= quest.target
        const canClaim = done && !quest.claimed
        return new Discord.ButtonBuilder()
            .setCustomId(`quests_claim~${i}~${userId}`)
            .setLabel(`Claim ${TIER_LABEL[quest.tier] || "Quest"} (+${tools.commafy(quest.reward)})`)
            .setStyle(canClaim ? Discord.ButtonStyle.Success : Discord.ButtonStyle.Secondary)
            .setDisabled(!canClaim)
    })

    if (claimBtns.length) rows.push(new Discord.ActionRowBuilder().addComponents(claimBtns))

    // Row 2: Bonus + Reroll
    const bonusDone = list.length > 0 && list.every(q => q.claimed)
    const bonusBtn = new Discord.ButtonBuilder()
        .setCustomId(`quests_bonus~${userId}`)
        .setLabel(`🎁 Claim 3/3 Bonus (+${tools.commafy(bonusReward)})`)
        .setStyle(Discord.ButtonStyle.Primary)
        .setDisabled(!bonusDone || bonusClaimed)

    const rerollsLeft = rerollsPerDay - rerollsUsed
    const rerollBtn = new Discord.ButtonBuilder()
        .setCustomId(`quests_reroll~${userId}`)
        .setLabel(`🔄 Reroll Quest (${tools.commafy(rerollCost)} credits, ${rerollsLeft} left)`)
        .setStyle(Discord.ButtonStyle.Danger)
        .setDisabled(rerollsLeft <= 0 || list.length === 0 || list.every(q => q.claimed))

    rows.push(new Discord.ActionRowBuilder().addComponents(bonusBtn, rerollBtn))

    return { embed, rows }
}

/**
 * Takes the existing components from a button interaction's message and returns
 * new action rows with every button disabled. Call immediately after deferUpdate()
 * to give visual feedback while the bot processes.
 */
function buildDisabledComponents(message) {
    return (message?.components || []).map(row => {
        const newRow = new Discord.ActionRowBuilder()
        row.components.forEach(c => {
            if (c.type === Discord.ComponentType.Button) {
                newRow.addComponents(Discord.ButtonBuilder.from(c).setDisabled(true))
            }
        })
        return newRow
    })
}

module.exports = {
    metadata: {
        name: "quests",
        description: "View and claim your daily quests.",
        args: [
            { type: "bool", name: "hidden", description: "Hides the reply so only you can see it", required: false }
        ]
    },

    buildQuestsEmbed,
    buildDisabledComponents,

    async run(client, int, tools) {
        const isHidden = !!int.options?.get("hidden")?.value
        await int.deferReply({ ephemeral: isHidden })

        const db = await tools.fetchAll(int.guild.id)
        if (!db) return tools.warn("*noData")
        if (!db.settings.quests?.enabled) return tools.warn("Daily quests are not enabled on this server.")

        const userId = int.user.id
        const member = int.member

        // Ensure user entry exists
        if (!db.users) db.users = {}
        if (!db.users[userId]) db.users[userId] = {}

        const todayKey = getTodayKey()
        const wasReset = ensureDailyQuests(db.users[userId], db.settings, todayKey)

        if (wasReset) {
            await client.db.update(int.guild.id, {
                $set: { [`users.${userId}.quests`]: db.users[userId].quests }
            }).exec().catch(() => {})
        }

        const { embed, rows } = buildQuestsEmbed(tools, db, userId, member)
        return int.editReply({ embeds: [embed], components: rows })
    }
}
