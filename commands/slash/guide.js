const Discord = require("discord.js")
const config = require("../../config.json")

// ─── Custom emoji dictionary ──────────────────────────────────────────────────
const E = {
    gold:     "<:gold:1472934905972527285>",
    level:    "<:level:1466817213830009045>",
    progress: "<:progress:1466819928110792816>",
    chest:    "<:chest:1486740653067997394>",
    info:     "<:info:1466817220687695967>",
    end:      "<:extendedend:1466819484999225579>",
    unlocked: "<:unlocked:1466817218166788278>",
    locked:   "<:locked:1466817215918772275>",
}

// ─── Page definitions ─────────────────────────────────────────────────────────
// Each page has a gate() — only pages whose gate returns true are shown.
// This ensures users never see content for features their server hasn't enabled.
const PAGES = [
    { id: "home",    emoji: "👋", label: "Welcome",        gate: ()   => true },
    { id: "xp",      emoji: "⚡", label: "Earning XP",     gate: (db) => !!db.settings.enabled },
    { id: "levels",  emoji: "🏆", label: "Levels & Roles", gate: (db) => !!db.settings.enabled },
    { id: "daily",   emoji: "🔥", label: "Daily Rewards",  gate: (db) => !!(db.settings.streak?.enabled || db.settings.quests?.enabled) },
    { id: "compete", emoji: "📊", label: "Leaderboard",    gate: ()   => true },
]

// ─── Component builder ────────────────────────────────────────────────────────
function buildComponents(tools, pages, idx, guild) {
    // Row 1: topic select menu — current page shown as default
    const selectMenu = new Discord.StringSelectMenuBuilder()
        .setCustomId("guide_select")
        .setPlaceholder("Jump to a topic…")
        .addOptions(pages.map((page, i) => ({
            label: page.label,
            value: page.id,
            emoji: page.emoji,
            default: i === idx,
        })))
    const row1 = new Discord.ActionRowBuilder().addComponents(selectMenu)

    // Row 2: Prev / Next buttons, plus a Dashboard link on the last page
    const isFirst = idx === 0
    const isLast  = idx === pages.length - 1

    const navBtns = [
        new Discord.ButtonBuilder()
            .setCustomId("guide_prev")
            .setLabel("◀ Prev")
            .setStyle(Discord.ButtonStyle.Secondary)
            .setDisabled(isFirst),
        new Discord.ButtonBuilder()
            .setCustomId("guide_next")
            .setLabel("Next ▶")
            .setStyle(Discord.ButtonStyle.Primary)
            .setDisabled(isLast),
    ]

    if (isLast && tools.WEBSITE) {
        navBtns.push(
            new Discord.ButtonBuilder()
                .setStyle(Discord.ButtonStyle.Link)
                .setLabel("Dashboard")
                .setURL(`${tools.WEBSITE}/settings/${guild.id}`)
                .setEmoji("⚙️")
        )
        if (config.supportURL) {
            navBtns.push(
                new Discord.ButtonBuilder()
                    .setStyle(Discord.ButtonStyle.Link)
                    .setLabel("Support")
                    .setURL(config.supportURL)
                    .setEmoji("❓")
            )
        }
    }

    const row2 = new Discord.ActionRowBuilder().addComponents(navBtns)
    return [row1, row2]
}

// ─── Per-page embed builder ───────────────────────────────────────────────────
function buildGuidePage(tools, db, pageId, member, guild, pages, idx) {
    const components = buildComponents(tools, pages, idx, guild)
    let embed

    switch (pageId) {

        case "home": {
            const lines = [
                "**Polaris** is a super customizable XP & leveling bot. Here's what you can do here:",
                "",
            ]
            if (db.settings.enabled)                            lines.push(`${E.progress} **Earn XP** by chatting${db.settings.enabledVoiceXp ? " and hanging out in voice" : ""}`)
            if (db.settings.enabled)                            lines.push(`${E.level} **Level up** to unlock exclusive reward roles`)
            if (db.settings.streak?.enabled)                    lines.push(`🔥 **Keep a streak** for daily bonus XP`)
            if (db.settings.quests?.enabled)                    lines.push(`📜 **Complete quests** every day for extra rewards`)
            if (db.settings.shop?.enabled)                      lines.push(`${E.gold} **Spend credits** in the shop on exclusive roles`)
            if (db.settings.coinflip?.enabled)                  lines.push(`🪙 **Gamble credits** with coinflip`)
            if (!db.settings.leaderboard?.disabled)             lines.push(`📊 **Compete** on the leaderboard with other members`)

            embed = tools.createEmbed({
                author:      { name: guild.name, iconURL: guild.iconURL({ dynamic: true }) || undefined },
                title:       "👋 Welcome — Here's What You Can Do",
                description: lines.join("\n"),
                color:       tools.COLOR,
                footer:      "Use the menu below to explore each topic, or hit Next ▶",
            })
            break
        }

        case "xp": {
            const fields = [
                {
                    name:   "💬 Send Messages",
                    value:  `Chat in any eligible channel to earn XP. There's a short cooldown between awards so quality beats quantity.\n${E.end}Check your current XP with ${tools.commandTag("info")}.`,
                    inline: false,
                },
            ]

            if (db.settings.enabledVoiceXp) {
                fields.push({
                    name:   "🎙️ Voice Channels",
                    value:  `Staying connected in voice channels earns you XP over time — even if you're not talking!\n${E.end}XP accumulates steadily while you're in a channel.`,
                    inline: false,
                })
            }

            if ((db.settings.multipliers || []).length > 0 && !db.settings.hideMultipliers) {
                fields.push({
                    name:   `${E.gold} XP Multipliers`,
                    value:  `Some roles in this server grant an XP boost. The more you level up, the more you might qualify for.\n${E.end}Your current multiplier is shown in ${tools.commandTag("info")}.`,
                    inline: false,
                })
            }

            embed = tools.createEmbed({
                title:       "⚡ Earning XP",
                description: `XP is the currency of activity here — the more you engage, the faster you rise!\nSee your progress anytime with ${tools.commandTag("rank")}.`,
                color:       tools.COLOR,
                fields,
                footer:      "Spamming won't help — XP is awarded on a cooldown.",
            })
            break
        }

        case "levels": {
            const rewards    = (db.settings.rewards || []).filter(r => r.id)
            const hasRewards = rewards.length > 0
            const hasRankCard = !db.settings.rankCard?.disabled

            const fields = []

            if (hasRankCard) {
                fields.push({
                    name:   `${E.progress} Your Rank Card`,
                    value:  `Run ${tools.commandTag("rank")} for a visual snapshot of your level and XP progress bar.\n${E.end}${tools.commandTag("top")} shows the full server leaderboard.`,
                    inline: false,
                })
            }

            if (hasRewards) {
                fields.push({
                    name:   `${E.unlocked} Reward Roles`,
                    value:  `This server has **${rewards.length}** reward role${rewards.length !== 1 ? "s" : ""}. Reach the right level milestone and the role is **added automatically** — no need to ask!\n${E.end}See your earned roles with ${tools.commandTag("info")}.`,
                    inline: false,
                })
            } else {
                fields.push({
                    name:   `${E.level} Keep Leveling!`,
                    value:  `Every level reflects your dedication. Track your progress with ${tools.commandTag("rank")} and challenge others on ${tools.commandTag("top")}.`,
                    inline: false,
                })
            }

            embed = tools.createEmbed({
                title:       "🏆 Levels & Reward Roles",
                description: `As you earn XP you level up — and hitting certain milestones can unlock **exclusive roles** automatically. The harder you grind, the more you unlock!`,
                color:       tools.COLOR,
                fields,
                footer:      "Reward roles are synced automatically as you hit each milestone.",
            })
            break
        }

        case "daily": {
            const hasStreak = !!db.settings.streak?.enabled
            const hasQuests = !!db.settings.quests?.enabled
            const fields = []

            if (hasStreak) {
                const baseReward   = db.settings.streak?.baseReward || 0
                const rewardClause = baseReward > 0 ? ` **+${tools.commafy(baseReward)}** bonus XP` : " bonus rewards"
                fields.push({
                    name:   "🔥 Daily Streak",
                    value:  `Claim your streak every day to earn${rewardClause}. Miss a day and it resets back to zero — consistency is everything!\n${E.end}Run ${tools.commandTag("streak")} to claim yours right now.`,
                    inline: false,
                })
            }

            if (hasQuests) {
                const rerollCount = db.settings.quests?.rerollsPerDay ?? 1
                const bonusReward = db.settings.quests?.bonusReward   || 0
                const bonusClause = bonusReward > 0 ? ` **+${tools.commafy(bonusReward)}** ${E.gold}` : " a bonus reward"
                fields.push({
                    name:   "📜 Daily Quests",
                    value:  `Three quests refresh every day — easy, medium, and hard. Complete all three to earn${bonusClause} on top of the individual rewards!\n${E.end}You get **${rerollCount}** reroll${rerollCount !== 1 ? "s" : ""} per day. Run ${tools.commandTag("quests")} to get started.`,
                    inline: false,
                })
            }

            embed = tools.createEmbed({
                title:       "🔥 Daily Rewards",
                description: "Log in every day and the rewards add up fast. Small habits, big gains!",
                color:       tools.COLOR,
                fields,
                footer:      "Rewards reset at midnight UTC — don't miss out!",
            })
            break
        }

        case "compete": {
            const hasLB    = !db.settings.leaderboard?.disabled
            const hasStats = !!db.settings.stats?.enabled

            const fields = [
                {
                    name:   `${E.progress} Leaderboard`,
                    value:  hasLB
                        ? `Run ${tools.commandTag("top")} to see the top members by XP — or check the live web leaderboard from the Dashboard button below!`
                        : `Run ${tools.commandTag("top")} to see who's leading the server.`,
                    inline: false,
                },
                {
                    name:   `${E.level} Your Rank`,
                    value:  `Use ${tools.commandTag("rank")} to see your personal rank card and XP bar. Brag to your friends — or just admire your own grind.`,
                    inline: false,
                },
                {
                    name:   `${E.info} Deep Dive`,
                    value:  `${tools.commandTag("info")} shows your full stats: XP boost, streak, credits, and recent transactions.\n${E.end}${hasStats ? `${tools.commandTag("stats")} gives the server-wide activity overview.` : "That's everything — now go earn some XP! 🚀"}`,
                    inline: false,
                },
            ]

            embed = tools.createEmbed({
                title:       "📊 Compete & Explore",
                description: "Think you're one of the most active members here? Time to prove it.",
                color:       tools.COLOR,
                fields,
                footer:      "That's the full tour — now go earn some XP! 🚀",
            })
            break
        }

        default:
            embed = tools.createEmbed({ title: "Unknown page", color: tools.COLOR })
    }

    return { embed, components }
}

// ─── Module export ────────────────────────────────────────────────────────────
module.exports = {
    metadata: {
        name:        "guide",
        description: "A quick tour for new members — learn the bot in under a minute.",
        args: [
            { type: "bool", name: "hidden", description: "Hides the reply so only you can see it", required: false },
        ],
    },

    buildGuidePage,

    async run(client, int, tools) {
        if (!int.guild) return tools.warn("This command can only be used in a server!")

        const isHidden = !!int.options.get("hidden")?.value
        await int.deferReply({ ephemeral: isHidden })

        const db = await tools.fetchSettings(int.user.id)
        if (!db) return tools.warn("*noData")

        const pages = PAGES.filter(p => p.gate(db))
        let idx = 0

        const first = buildGuidePage(tools, db, pages[idx].id, int.member, int.guild, pages, idx)
        const msg   = await int.editReply({ embeds: [first.embed], components: first.components })

        const collector = msg.createMessageComponentCollector({
            time:   5 * 60_000,
            filter: i => i.user.id === int.user.id,
        })

        collector.on("collect", async i => {
            if (i.isStringSelectMenu()) {
                idx = pages.findIndex(p => p.id === i.values[0])
            } else if (i.customId === "guide_prev") {
                idx = Math.max(0, idx - 1)
            } else if (i.customId === "guide_next") {
                idx = Math.min(pages.length - 1, idx + 1)
            } else {
                return
            }
            const page = buildGuidePage(tools, db, pages[idx].id, int.member, int.guild, pages, idx)
            await i.update({ embeds: [page.embed], components: page.components })
        })

        collector.on("end", () => {
            int.editReply({ components: [] }).catch(() => {})
        })
    },
}
