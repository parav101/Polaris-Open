const multiplierModes = require("../../json/multiplier_modes.json")

// ─── Credit Log Display Config ───────────────────────────────────────────────
// How many recent logs to show in /info (change this number to show more/fewer)
const CREDIT_LOG_DISPLAY_COUNT = 5

// Emoji + label per transaction type
const LOG_TYPE_META = {
    streak:       { emoji: "🔥",                                 label: "Daily streak reward"     },
    transfer_in:  { emoji: "<:gold:1472934905972527285>",        label: "Received from member"    },
    transfer_out: { emoji: "📤",                                 label: "Sent to member"          },
    admin:        { emoji: "🛡️",                                 label: "Admin adjustment"        },
    addcredits:   { emoji: "⚙️",                                 label: "Admin adjustment"        },
    giveaway:     { emoji: "🎉",                                 label: "Giveaway win"            },
    activity:     { emoji: "<:progress:1466819928110792816>",    label: "Activity reward"         },
    shop:         { emoji: "<:chest:1486740653067997394>",       label: "Shop purchase"           },
    bump:         { emoji: "💰",                                 label: "Bump reward"             },
    coinflip:     { emoji: "🪙",                                 label: "Coinflip"                },
    chests:       { emoji: "<:chest:1486740653067997394>",       label: "Chest purchase"          },
    quest:        { emoji: "📜",                                 label: "Quest reward"            },
    quest_reroll: { emoji: "🔄",                                 label: "Quest reroll"            },
    unknown:      { emoji: "❓",                                 label: "Other (ask staff if unsure)" },
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
    // fetch member
    let member = int.member
    let foundUser = int.options.get("user") || int.options.get("member") // option is "user" if from context menu
    if (foundUser) member = foundUser.member
    if (!member) return tools.warn("That member couldn't be found!")

    // Get hidden flag from command option (sync check before deferring)
    const commandHidden = !!int.options.get("hidden")?.value

    // DEFER IMMEDIATELY before any async operations (Discord has 3-second timeout)
    if (!int.deferred && !int.replied) {
        await int.deferReply({ ephemeral: commandHidden });
    }

    // NOW fetch server xp settings after deferring
    let db = await tools.fetchSettings(member.id)

    if (!db) return tools.warn("*noData")
    else if (!db.settings.enabled) return tools.warn("*xpDisabled")

    // Use server's ephemeral preference if set, otherwise use command option
    let isHidden = db.settings.rankCard.ephemeral || commandHidden

    let currentXP = db.users[member.id]

    if (db.settings.rankCard.disabled) return tools.warn("Rank cards are disabled in this server!")
    
    // if user has no xp, stop here
    if (!currentXP || !currentXP.xp) return tools.noXPYet(foundUser ? foundUser.user : int.user)

    let xp = currentXP.xp

    let levelData = tools.getLevel(xp, db.settings, true)       // get user's level
    let maxLevel = levelData.level >= db.settings.maxLevel      // check if level is maxxed

    let remaining = levelData.xpRequired - xp
    let levelPercent = maxLevel ? 100 : (xp - levelData.previousLevel) / (levelData.xpRequired - levelData.previousLevel) * 100

    let multiplierData = tools.getMultiplier(member, db.settings)
    let multiplier = multiplierData.multiplier

    // Tips for the footer — expanded pool covering all features
    const tips = [
        // XP & leveling
        "Tip: You get XP from both chatting and being in voice channels!",
        "Tip: Spamming won't get you XP faster — XP is awarded periodically.",
        "Tip: Use /rank to see your rank card.",
        "Tip: Use /leaderboards to see how you stack up against others!",
        "Tip: Want to know how much XP you need for a level? Use /calculate.",
        // Streaks
        "Tip: Maintain your daily chat streak to climb the /streakleaderboard!",
        "Tip: Don't forget to claim your streak daily, or it resets to 0!",
        "Tip: Higher streaks unlock milestone roles — check /streak for details.",
        "Tip: Your streak earns you bonus XP every day you claim it!",
        // Credits & shop
        "Tip: Spend your credits in /shop to unlock exclusive roles!",
        "Tip: Open /chests for a chance at bonus XP rewards!",
        "Tip: Credits are earned from streaks, giveaways, and activity rewards.",
        "Tip: Use /transfer to send credits to other members.",
        // Voice XP
        "Tip: Staying active in voice channels earns you XP too!",
        "Tip: Voice XP keeps ticking while you're in a channel — stay connected!",
        // General motivation
        "Tip: Check /stats to see your full milestone progress.",
        "Tip: Reward roles are automatically synced as you level up!",
        "Tip: The more active you are, the faster you climb the leaderboard!",
    ];

    // Filter tips based on what's enabled in this server
    const activeTips = tips.filter(tip => {
        if (tip.includes("streak") || tip.includes("Streak")) return db.settings.streak?.enabled !== false
        if (tip.includes("/shop") || tip.includes("credits") || tip.includes("Credits") || tip.includes("/transfer")) return db.settings.shop?.enabled || db.settings.streak?.enabled
        if (tip.includes("/chests") || tip.includes("Chests")) return db.settings.chests?.enabled || db.settings.chestDrops?.enabled
        if (tip.includes("voice") || tip.includes("Voice")) return db.settings.enabledVoiceXp
        return true
    })
    const tipPool = activeTips.length > 0 ? activeTips : tips
    const randomTip = tipPool[Math.floor(Math.random() * tipPool.length)]

    let barSize = 25
    let barRepeat = Math.round(levelPercent / (100 / barSize))
    let barLabel = maxLevel ? "MAX 🎉" : `${Number(levelPercent.toFixed(1))}%`
    let progressBar = `\`[${"█".repeat(barRepeat)}${"░".repeat(barSize - barRepeat)}]\` ${barLabel}`

    let cardCol = db.settings.rankCard.embedColor
    if (cardCol == -1) cardCol = null

    let memberAvatar = member.displayAvatarURL()
    let memberColor = cardCol || member.displayColor || await member.user.fetch().then(x => x.accentColor)

    // ===== MULTIPLIER DISPLAY =====
    // Format as "1.5×" instead of "150%"
    const multiplierFormatted = `${multiplier}×`
    let boostRoleValue
    if (multiplier !== 1 && !db.settings.hideMultipliers) {
        if (multiplierData.roleList.length > 0) {
            boostRoleValue = multiplierData.roleList.map(role => `<@&${role.id}>`).join(", ")
        } else {
            boostRoleValue = "\u200b"
        }
    } else if (multiplier === 1) {
        boostRoleValue = "No Boost Role"
    } else {
        boostRoleValue = "Hidden"
    }

    // ===== STREAK INFO =====
    let streakText = null;
    if (db.settings.streak?.enabled) {
        if (!db.users[member.id].streak) {
            db.users[member.id].streak = { count: 0, lastClaim: 0, highest: 0 };
        }
        const userStreak = db.users[member.id].streak;
        
        const streakInfo = [
            `**Current:** ${tools.commafy(userStreak.count)}`,
            `**Highest:** ${tools.commafy(userStreak.highest || userStreak.count)}`
        ];

        if (userStreak.lastClaim > 0) {
            streakInfo.push(`**Last claim:** <t:${Math.floor(userStreak.lastClaim / 1000)}:R>`);
        }

        // Show next streak milestone (mirrors /streak command behaviour)
        const milestones = db.settings.streak.milestones || []
        if (milestones.length > 0) {
            const nextMilestone = milestones
                .filter(m => m.days > userStreak.count)
                .sort((a, b) => a.days - b.days)[0]
            if (nextMilestone) {
                const daysLeft = nextMilestone.days - userStreak.count
                streakInfo.push(`**Next milestone:** ${tools.commafy(nextMilestone.days)} days${nextMilestone.roleId ? ` (<@&${nextMilestone.roleId}>)` : ""} — ${daysLeft} to go`)
            }
        }
        
        streakText = streakInfo.join('\n');
    }

    // Create the embed
    let embed = tools.createEmbed({
        author: { 
            name: member.user.displayName,
            iconURL: int.guild.iconURL({ dynamic: true })
        },
        description: progressBar,
        thumbnail: memberAvatar,
        color: memberColor,
        fields: [
            { 
                name: `Level: ${levelData.level}`, 
                value: "\u200b", 
                inline: true 
            },
            { 
                name: `Remaining XP: ${tools.commafy(remaining)}`, 
                value: "\u200b", 
                inline: true 
            },
        ],
        footer: {
            text: randomTip,
            iconURL: "https://cdn3.emoji.gg/emojis/9385-sparkles-pinkpastel.gif"
        }
    })
    
    // Add XP Boost field — show multiplier as "1.5×" format
    if (multiplier !== 1 && !db.settings.hideMultipliers) {
        embed.addFields([{ 
            name: `XP Boost: ${multiplierFormatted}`, 
            value: boostRoleValue, 
            inline: true 
        }])
    } else {
        embed.addFields([{ name: `XP Boost: ${multiplierFormatted}`, value: boostRoleValue, inline: true }])
    }

    const dailyXp = xp - (currentXP.xpAtDayStart ?? xp)
    const rawDailyXp = Math.floor(currentXP.activityXpAccumulated || 0)
    const msgXp = Math.floor(currentXP.msgXp || 0)
    const safeMsgXp = Math.min(msgXp, rawDailyXp)
    const vcXp = Math.max(0, rawDailyXp - safeMsgXp)

    let xpStatsValue
    if (rawDailyXp <= 0) {
        xpStatsValue = `boosted: ${tools.commafy(dailyXp)}\nraw: ${tools.commafy(rawDailyXp)}\n\n_No XP earned today yet._`
    } else {
        const avgRawMsgXp = (db.settings.gain.min + db.settings.gain.max) / 2
        const estMsgs = avgRawMsgXp > 0 ? Math.round(safeMsgXp / avgRawMsgXp) : 0
        const safeEstMsgs = Math.max(0, estMsgs)

        const breakdownLines = [
            `💬 ${tools.commafy(safeMsgXp)} raw XP · ~${tools.commafy(safeEstMsgs)} msgs`
        ]

        if (db.settings.enabledVoiceXp && vcXp > 0) {
            const v = db.settings.voice
            if (v && Number.isFinite(v.multiplier) && Number.isFinite(v.interval) && v.interval > 0) {
                const avgRawVoicePerTick = v.multiplier * avgRawMsgXp * (v.interval / 60)
                const estVoiceMin = avgRawVoicePerTick > 0
                    ? Math.round((vcXp / avgRawVoicePerTick) * (v.interval / 60))
                    : 0
                const safeEstVoiceMin = Math.max(0, estVoiceMin)
                breakdownLines.push(`🎙 ${tools.commafy(vcXp)} raw XP · ~${tools.commafy(safeEstVoiceMin)} min`)
            } else {
                breakdownLines.push(`🎙 ${tools.commafy(vcXp)} raw XP`)
            }
        }

        xpStatsValue = [
            `boosted: ${tools.commafy(dailyXp)}`,
            `raw: ${tools.commafy(rawDailyXp)}`,
            "",
            ...breakdownLines
        ].join("\n")
    }

    embed.addFields({
        name: "XP Stats",
        value: xpStatsValue,
        inline: false
    })

    if (streakText) {
        embed.addFields({ name: "🔥 Streak Info", value: streakText, inline: true });
    }

    // ─── Credit Transaction Log ───────────────────────────────────────────────
    const credits = currentXP.credits || 0
    const rawLogs = (currentXP.creditLogs || []).slice(-CREDIT_LOG_DISPLAY_COUNT).reverse() // newest first

    let creditLogField
    if (rawLogs.length === 0) {
        // No logs yet — show balance with a hint
        creditLogField = `<:gold:1472934905972527285> **Balance: ${tools.commafy(credits)}**\n<:extendedend:1466819484999225579>_No transactions recorded yet._`
    } else {
        // Header line: current balance
        const balanceLine = `<:gold:1472934905972527285> **Balance: ${tools.commafy(credits)}**`

        // Build each log row
        const logLines = rawLogs.map((log, i) => {
            const meta   = LOG_TYPE_META[log.type] || LOG_TYPE_META.unknown
            const sign   = log.amount >= 0 ? "+" : ""
            const amt    = `${sign}${tools.commafy(log.amount)}`
            const isLast = i === rawLogs.length - 1
            // ├ for middle rows, └ for last row (Unicode box-drawing, renders in Discord monospace)
            const tree   = isLast ? "└" : "├"
            const time   = log.ts ? `<t:${Math.floor(log.ts / 1000)}:R>` : ""

            const rawNote = (log.note || "").trim()
            const note = rawNote ? tools.limitLength(rawNote, 80, "…") : ""
            const noteSegment = note ? `  ·  _${note}_` : ""

            // e.g.  ├ 🔥 +10  Daily streak reward  •  2h ago · _Claimed daily streak (day 3)_
            return `\`${tree}\` ${meta.emoji} \`${amt.padStart(7)}\` **${meta.label}**${time ? `  •  ${time}` : ""}${noteSegment}`
        })

        const footerLine = `<:extendedend:1466819484999225579>_Showing last ${rawLogs.length} transaction${rawLogs.length === 1 ? "" : "s"}._`

        creditLogField = `${balanceLine}\n${logLines.join("\n")}\n${footerLine}`
    }

    embed.addFields({
        name: `<:info:1466817220687695967> Credit History  (last ${CREDIT_LOG_DISPLAY_COUNT})`,
        value: creditLogField,
        inline: false
    })

    // Navigation Buttons
    const navBtns = [
        { style: "Secondary", label: "Stats", customId: `stats_view~progress~${member.id}`, emoji: "<:progress:1466819928110792816>" },
        { style: "Success", label: "Info", customId: `stats_view~info~${member.id}`, emoji: "<:info:1466817220687695967>" },
        { style: "Primary", label: "Shop", customId: "shop", emoji: "<:gold:1472934905972527285>" },
        { style: "Primary", label: "XP Chests", customId: "chests", emoji: "<:chest:1486740653067997394>" },
    ]
    if (db.settings.quests?.enabled) {
        navBtns.push({ style: "Primary", label: "Quests", customId: "quests", emoji: "📜" })
    }
    let buttons = tools.button(navBtns)

    const reply = await int.editReply({embeds: [embed], components: tools.row(buttons)});
    return reply;
}}
