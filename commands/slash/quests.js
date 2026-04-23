const Discord = require("discord.js")
const { ensureDailyQuests, computeBonusReward, allQuestsDone, allQuestsClaimed, getTodayKey } = require("../../classes/Quests.js")

const TIER_EMOJI  = { easy: "🟢", medium: "🟡", hard: "🔴" }
const TIER_LABEL  = { easy: "Easy",  medium: "Medium",  hard: "Hard" }

// Custom emoji IDs used across the embed
const E = {
    gold:     "<:gold:1472934905972527285>",
    progress: "<:progress:1466819928110792816>",
    info:     "<:info:1466817220687695967>",
    end:      "<:extendedend:1466819484999225579>",
    unlocked: "<:unlocked:1466817218166788278>",
    locked:   "<:locked:1466817215918772275>",
}

/**
 * Compact 15-char progress bar.
 */
function makeBar(progress, target) {
    const barSize = 15
    const pct = target > 0 ? Math.min(100, progress / target * 100) : 100
    const filled = Math.round(pct / (100 / barSize))
    if (progress >= target) return `\`[${"█".repeat(barSize)}]\``
    return `\`[${"█".repeat(filled)}${"░".repeat(barSize - filled)}]\` ${Number(pct.toFixed(1))}%`
}

/**
 * Build the full quests embed + action rows for the given user data.
 */
function buildQuestsEmbed(tools, db, userId, member) {
    const q = db.users[userId]?.quests
    const questSettings = db.settings.quests || {}
    const list = q?.list || []

    const streakCount   = q?.streak?.count   || 0
    const streakHighest = q?.streak?.highest  || 0
    const bonusClaimed  = q?.bonusClaimed     || false
    const rerollsUsed   = q?.rerollsUsedToday || 0
    const rerollsPerDay = questSettings.rerollsPerDay ?? 1
    const rerollCost    = questSettings.rerollCost    ?? 100

    const bonusReward = computeBonusReward(db.settings, streakCount)

    // Next UTC midnight
    const d = new Date()
    d.setUTCHours(24, 0, 0, 0)
    const nextResetUnix = Math.floor(d.getTime() / 1000)

    // Streak line
    const bonusMultiplier = (1 + (questSettings.streakBonusMultiplier ?? 0.1) * Math.min(streakCount, questSettings.streakBonusCap ?? 7)).toFixed(1)
    const streakLine = streakCount > 0
        ? `🔥 **${streakCount}**-day streak (best: **${streakHighest}**) · bonus ×${bonusMultiplier}`
        : `${E.locked} No streak yet — complete all 3 to start one!`

    // Quest fields — compact single-line layout
    const fields = list.map((quest) => {
        const tierEmoji  = TIER_EMOJI[quest.tier] || "⚪"
        const tierLabel  = TIER_LABEL[quest.tier]  || quest.tier
        const isDone     = quest.progress >= quest.target
        const statusIcon = quest.claimed ? E.unlocked : isDone ? E.gold : E.progress
        const bar        = quest.claimed
            ? `\`[${"█".repeat(15)}]\` ${E.unlocked} Claimed`
            : `${makeBar(quest.progress, quest.target)} · **${tools.commafy(quest.progress)}/${tools.commafy(quest.target)}** · ${E.gold} **${tools.commafy(quest.reward)}**`

        return {
            name:   `${statusIcon} ${tierEmoji} ${quest.label}  ·  ${tierLabel}`,
            value:  `${E.end}${quest.description}\n${bar}`,
            inline: false,
        }
    })

    if (!list.length) {
        fields.push({
            name:  `${E.info} No quests available`,
            value: `${E.end}No quest templates are configured yet.\nAsk a server admin to add them on the dashboard.`,
            inline: false,
        })
    }

    const embed = tools.createEmbed({
        author:      { name: member.user.displayName, iconURL: member.user.displayAvatarURL() },
        title:       `${E.progress} Daily Quests`,
        description: [
            `${E.info} Complete all 3 · ${E.gold} **+${tools.commafy(bonusReward)} bonus** · Resets <t:${nextResetUnix}:R>`,
            streakLine,
        ].join("\n"),
        color: tools.COLOR,
        fields,
    })

    // --- Action rows ---
    const rows = []

    // Row 1: one Claim button per quest
    const claimBtns = list.map((quest, i) => {
        const canClaim = quest.progress >= quest.target && !quest.claimed
        return new Discord.ButtonBuilder()
            .setCustomId(`quests_claim~${i}~${userId}`)
            .setLabel(`Claim ${TIER_LABEL[quest.tier] || "Quest"} (+${tools.commafy(quest.reward)})`)
            .setEmoji(quest.claimed ? "✅" : canClaim ? { id: "1472934905972527285" } : { id: "1466817215918772275" })
            .setStyle(canClaim ? Discord.ButtonStyle.Success : Discord.ButtonStyle.Secondary)
            .setDisabled(!canClaim)
    })

    if (claimBtns.length) rows.push(new Discord.ActionRowBuilder().addComponents(claimBtns))

    // Row 2: Bonus + Reroll
    const bonusDone  = list.length > 0 && list.every(q => q.claimed)
    const rerollsLeft = rerollsPerDay - rerollsUsed

    const bonusBtn = new Discord.ButtonBuilder()
        .setCustomId(`quests_bonus~${userId}`)
        .setLabel(`Claim 3/3 Bonus (+${tools.commafy(bonusReward)})`)
        .setEmoji("🎁")
        .setStyle(Discord.ButtonStyle.Primary)
        .setDisabled(!bonusDone || bonusClaimed)

    const rerollBtn = new Discord.ButtonBuilder()
        .setCustomId(`quests_reroll~${userId}`)
        .setLabel(`Reroll (${tools.commafy(rerollCost)} cr · ${rerollsLeft} left)`)
        .setEmoji("🔄")
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
        // Button triggers are always ephemeral; slash command respects the hidden option
        const isHidden = int.isButton() || !!int.options?.get("hidden")?.value
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
