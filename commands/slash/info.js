// How many recent logs to show in /info
const CREDIT_LOG_DISPLAY_COUNT = 5

// Emoji + short label per transaction type
const LOG_TYPE_META = {
    streak:       { emoji: "🔥", label: "Streak reward" },
    transfer_in:  { emoji: "💰", label: "Received" },
    transfer_out: { emoji: "📤", label: "Sent" },
    admin:        { emoji: "🛡️", label: "Admin change" },
    addcredits:   { emoji: "⚙️", label: "Admin change" },
    giveaway:     { emoji: "🎉", label: "Giveaway win" },
    activity:     { emoji: "📈", label: "Activity reward" },
    shop:         { emoji: "🛒", label: "Shop purchase" },
    bump:         { emoji: "💸", label: "Bump reward" },
    coinflip:     { emoji: "🪙", label: "Coinflip" },
    chests:       { emoji: "📦", label: "Chest purchase" },
    quest:        { emoji: "📜", label: "Quest reward" },
    quest_reroll: { emoji: "🔄", label: "Quest reroll" },
    unknown:      { emoji: "❓", label: "Other" },
}

module.exports = {
metadata: {
    name: "info",
    description: "View your current XP, level, and cooldown.",
    args: [
        { type: "user", name: "member", description: "Which member to view", required: false },
        { type: "bool", name: "hidden", description: "Hides the reply so only you can see it", required: false }
    ]
},

async run(client, int, tools) {
    let member = int.member
    let foundUser = int.options.get("user") || int.options.get("member")
    if (foundUser) member = foundUser.member
    if (!member) return tools.warn("That member couldn't be found!")

    const commandHidden = !!int.options.get("hidden")?.value
    if (!int.deferred && !int.replied) {
        await int.deferReply({ ephemeral: commandHidden })
    }

    let db = await tools.fetchSettings(member.id)
    if (!db) return tools.warn("*noData")
    if (!db.settings.enabled) return tools.warn("*xpDisabled")
    if (db.settings.rankCard.disabled) return tools.warn("Rank cards are disabled in this server!")

    const currentXP = db.users[member.id]
    if (!currentXP || !currentXP.xp) return tools.noXPYet(foundUser ? foundUser.user : int.user)

    const xp = currentXP.xp
    const levelData = tools.getLevel(xp, db.settings, true)
    const maxLevel = levelData.level >= db.settings.maxLevel
    const levelPercent = maxLevel ? 100 : (xp - levelData.previousLevel) / (levelData.xpRequired - levelData.previousLevel) * 100

    const tips = [
        "Tip: You get XP from both chatting and being in voice channels!",
        "Tip: Spamming won't get you XP faster — XP is awarded periodically.",
        "Tip: Use /rank to see your rank card.",
        "Tip: Use /leaderboards to see how you stack up against others!",
        "Tip: Want to know how much XP you need for a level? Use /calculate.",
        "Tip: Maintain your daily chat streak to climb the /streakleaderboard!",
        "Tip: Don't forget to claim your streak daily, or it resets to 0!",
        "Tip: Higher streaks unlock milestone roles — check /streak for details.",
        "Tip: Your streak earns you bonus XP every day you claim it!",
        "Tip: Spend your credits in /shop to unlock exclusive roles!",
        "Tip: Open /chests for a chance at bonus XP rewards!",
        "Tip: Credits are earned from streaks, giveaways, and activity rewards.",
        "Tip: Use /transfer to send credits to other members.",
        "Tip: Staying active in voice channels earns you XP too!",
        "Tip: Voice XP keeps ticking while you're in a channel — stay connected!",
        "Tip: Check /stats to see your full milestone progress.",
        "Tip: Reward roles are automatically synced as you level up!",
        "Tip: The more active you are, the faster you climb the leaderboard!",
    ]

    const activeTips = tips.filter(tip => {
        if (tip.includes("streak") || tip.includes("Streak")) return db.settings.streak?.enabled !== false
        if (tip.includes("/shop") || tip.includes("credits") || tip.includes("Credits") || tip.includes("/transfer")) return db.settings.shop?.enabled || db.settings.streak?.enabled
        if (tip.includes("/chests") || tip.includes("Chests")) return db.settings.chests?.enabled || db.settings.chestDrops?.enabled
        if (tip.includes("voice") || tip.includes("Voice")) return db.settings.enabledVoiceXp
        return true
    })
    const tipPool = activeTips.length > 0 ? activeTips : tips
    const randomTip = tipPool[Math.floor(Math.random() * tipPool.length)]

    const barSize = 25
    const barRepeat = Math.round(levelPercent / (100 / barSize))
    const barLabel = maxLevel ? "MAX 🎉" : `${Number(levelPercent.toFixed(1))}%`
    const progressBar = `\`[${"█".repeat(barRepeat)}${"░".repeat(barSize - barRepeat)}]\` ${barLabel}`

    let cardCol = db.settings.rankCard.embedColor
    if (cardCol == -1) cardCol = null
    const memberAvatar = member.displayAvatarURL()
    const memberColor = cardCol || member.displayColor || await member.user.fetch().then(x => x.accentColor)

    // Daily activity section
    const dailyXp = xp - (currentXP.xpAtDayStart ?? xp)
    const rawDailyXp = Math.floor(currentXP.activityXpAccumulated || 0)
    const msgXp = Math.floor(currentXP.msgXp || 0)
    const safeMsgXp = Math.min(msgXp, rawDailyXp)
    const vcXp = Math.max(0, rawDailyXp - safeMsgXp)

    let xpStatsValue
    if (rawDailyXp <= 0) {
        xpStatsValue = [
            `Today you earned: ${tools.commafy(dailyXp)} boosted XP`,
            `Base activity XP: ${tools.commafy(rawDailyXp)}`,
            "No activity XP recorded yet today."
        ].join("\n")
    } else {
        const avgRawMsgXp = (db.settings.gain.min + db.settings.gain.max) / 2
        const estMsgs = avgRawMsgXp > 0 ? Math.round(safeMsgXp / avgRawMsgXp) : 0
        const safeEstMsgs = Math.max(0, estMsgs)

        const breakdownLines = [
            `From chat: ${tools.commafy(safeMsgXp)} raw XP (about ${tools.commafy(safeEstMsgs)} messages)`
        ]

        if (db.settings.enabledVoiceXp && vcXp > 0) {
            const v = db.settings.voice
            if (v && Number.isFinite(v.multiplier) && Number.isFinite(v.interval) && v.interval > 0) {
                const avgRawVoicePerTick = v.multiplier * avgRawMsgXp * (v.interval / 60)
                const estVoiceMin = avgRawVoicePerTick > 0
                    ? Math.round((vcXp / avgRawVoicePerTick) * (v.interval / 60))
                    : 0
                const safeEstVoiceMin = Math.max(0, estVoiceMin)
                breakdownLines.push(`From voice: ${tools.commafy(vcXp)} raw XP (about ${tools.commafy(safeEstVoiceMin)} minutes)`)
            } else {
                breakdownLines.push(`From voice: ${tools.commafy(vcXp)} raw XP`)
            }
        }

        xpStatsValue = [
            `Today you earned: ${tools.commafy(dailyXp)} boosted XP`,
            `Base activity XP: ${tools.commafy(rawDailyXp)}`,
            ...breakdownLines
        ].join("\n")
    }

    // Streak section
    let streakText = null
    if (db.settings.streak?.enabled) {
        if (!db.users[member.id].streak) {
            db.users[member.id].streak = { count: 0, lastClaim: 0, highest: 0 }
        }
        const userStreak = db.users[member.id].streak
        const streakInfo = [
            `Current streak: ${tools.commafy(userStreak.count)} day${userStreak.count === 1 ? "" : "s"}`,
            `Best streak: ${tools.commafy(userStreak.highest || userStreak.count)} day${(userStreak.highest || userStreak.count) === 1 ? "" : "s"}`
        ]

        if (userStreak.lastClaim > 0) {
            streakInfo.push(`Last active: <t:${Math.floor(userStreak.lastClaim / 1000)}:R>`)
        }

        const milestones = db.settings.streak.milestones || []
        if (milestones.length > 0) {
            const nextMilestone = milestones
                .filter(m => m.days > userStreak.count)
                .sort((a, b) => a.days - b.days)[0]

            if (nextMilestone) {
                const daysLeft = nextMilestone.days - userStreak.count
                const rolePart = nextMilestone.roleId ? ` (<@&${nextMilestone.roleId}>)` : ""
                streakInfo.push(`Next reward in: ${tools.commafy(daysLeft)} day${daysLeft === 1 ? "" : "s"} (${tools.commafy(nextMilestone.days)}-day streak${rolePart})`)
            }
        }

        streakText = streakInfo.join("\n")
    }

    let embed = tools.createEmbed({
        author: {
            name: member.user.displayName,
            iconURL: int.guild.iconURL({ dynamic: true })
        },
        description: progressBar,
        thumbnail: memberAvatar,
        color: memberColor,
        fields: [
            { name: "XP Stats", value: xpStatsValue, inline: false },
        ],
        footer: {
            text: randomTip,
            iconURL: "https://cdn3.emoji.gg/emojis/9385-sparkles-pinkpastel.gif"
        }
    })

    if (streakText) {
        embed.addFields({ name: "Daily Streak", value: streakText, inline: false })
    }

    // Credit transaction log
    const credits = currentXP.credits || 0
    const rawLogs = (currentXP.creditLogs || []).slice(-CREDIT_LOG_DISPLAY_COUNT).reverse()

    let creditLogField
    if (rawLogs.length === 0) {
        creditLogField = `Current balance: ${tools.commafy(credits)}\nNo credit transactions recorded yet.`
    } else {
        const balanceLine = `Current balance: ${tools.commafy(credits)}`

        const logLines = rawLogs.map((log, i) => {
            const meta = LOG_TYPE_META[log.type] || LOG_TYPE_META.unknown
            const sign = log.amount >= 0 ? "+" : ""
            const amt = `${sign}${tools.commafy(log.amount)}`
            const isLast = i === rawLogs.length - 1
            const tree = isLast ? "└" : "├"
            const time = log.ts ? `<t:${Math.floor(log.ts / 1000)}:R>` : ""

            const rawNote = (log.note || "").trim()
            const note = rawNote ? tools.limitLength(rawNote, 80, "…") : ""
            const noteSegment = note ? `  ·  _${note}_` : ""

            return `\`${tree}\` ${meta.emoji} \`${amt.padStart(7)}\` ${meta.label}${time ? `  •  ${time}` : ""}${noteSegment}`
        })

        const footerLine = `Showing last ${rawLogs.length} transaction${rawLogs.length === 1 ? "" : "s"}.`
        creditLogField = `${balanceLine}\n${logLines.join("\n")}\n_${footerLine}_`
    }

    embed.addFields({
        name: `Recent Credits (last ${CREDIT_LOG_DISPLAY_COUNT})`,
        value: creditLogField,
        inline: false
    })

    const navBtns = [
        { style: "Secondary", label: "Stats", customId: `stats_view~progress~${member.id}` },
        { style: "Success", label: "Info", customId: `stats_view~info~${member.id}` },
        { style: "Primary", label: "Shop", customId: "shop" },
        { style: "Primary", label: "XP Chests", customId: "chests" },
    ]
    if (db.settings.quests?.enabled) {
        navBtns.push({ style: "Primary", label: "Quests", customId: "quests", emoji: "📜" })
    }
    const buttons = tools.button(navBtns)

    return int.editReply({ embeds: [embed], components: tools.row(buttons) })
}}
