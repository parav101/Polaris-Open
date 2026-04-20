module.exports = {
metadata: {
    name: "calculate",
    description: "Check how much XP you need to reach a certain level.",
    args: [
        { type: "integer", name: "target", description: "The desired level", min: 1, max: 1000, required: false },
        { type: "user", name: "member", description: "Which member to check", required: false }
    ]
},

async run(client, int, tools) {

    let member = int.member
    let foundUser = int.options.get("member") 
    if (foundUser) member = foundUser.member

    let db = await tools.fetchSettings(member.id)
    if (!db) return tools.warn("*noData")
    let targetLevel = Math.min(int.options.get("target")?.value || (tools.getLevel(db.users[member.id]?.xp || 0, db.settings) + 1), db.settings.maxLevel)
    let targetXP = tools.xpForLevel(targetLevel, db.settings)

    let cardCol = db.settings.rankCard.embedColor
    if (cardCol == -1) cardCol = null

    if (db.settings.rankCard.disabled) {
        let miniEmbed = tools.createEmbed({
            title: `Level ${tools.commafy(targetLevel)}`,
            color: cardCol || member.displayColor || await member.user.fetch().then(x => x.accentColor),
            description: `${tools.commafy(targetXP)} XP required`,
            footer: "Rank cards are disabled, so detailed calculations are hidden."
        })
        return int.reply({embeds: [miniEmbed]})
    }

    let currentXP = db.users[member.id]
    if (!currentXP || !currentXP.xp) return tools.noXPYet(foundUser ? foundUser.user : int.user)
    let xp = currentXP.xp
    let userLevel = tools.getLevel(xp, db.settings)

    let levelData = tools.getLevel(xp, db.settings, true)
    let maxLevel = levelData.level >= db.settings.maxLevel

    let remaining = targetXP - xp
    let reached = remaining <= 0

    // Target-oriented progress bar: fraction of targetXP already accumulated
    let targetPercent = reached ? 100 : Math.min(100, xp / targetXP * 100)
    let barSize = 25
    let barRepeat = Math.round(targetPercent / (100 / barSize))
    let barLabel = (maxLevel && reached) ? "MAX 🎉" : `${Number(targetPercent.toFixed(1))}%`
    let progressBar = `\`[${"█".repeat(barRepeat)}${"░".repeat(barSize - barRepeat)}]\` ${barLabel}`

    let multiplierData = tools.getMultiplier(member, db.settings)
    let multiplier = multiplierData.multiplier || multiplierData.role
    if (multiplier <= 0) return int.reply("Your XP multiplier is set to 0, so you cannot gain any XP!")

    // Message XP estimates
    let xpMinPerMsg = Math.round(db.settings.gain.min * multiplier)
    let xpMaxPerMsg = Math.round(db.settings.gain.max * multiplier)
    let estimatedMin = reached ? 0 : Math.ceil(remaining / xpMaxPerMsg)
    let estimatedMax = reached ? 0 : Math.ceil(remaining / xpMinPerMsg)
    let estimatedAvg = Math.round((estimatedMax + estimatedMin) / 2)
    let estimatedTime = estimatedAvg * db.settings.gain.time

    let xpPerMsgStr = xpMinPerMsg === xpMaxPerMsg
        ? `${tools.commafy(xpMinPerMsg)} XP`
        : `${tools.commafy(xpMinPerMsg)}–${tools.commafy(xpMaxPerMsg)} XP`
    let messagesStr = estimatedMax === estimatedMin
        ? tools.commafy(estimatedMax)
        : `${tools.commafy(estimatedMin)}–${tools.commafy(estimatedMax)}`

    let embedColor = cardCol || member.displayColor || await member.user.fetch().then(x => x.accentColor)

    // Core fields: current, target, XP needed
    let fields = [
        { name: "📍 Current", value: `Level ${tools.commafy(userLevel)}\n${tools.commafy(xp)} XP`, inline: true },
        { name: "🎯 Target", value: `Level ${tools.commafy(targetLevel)}\n${tools.commafy(targetXP)} XP total`, inline: true },
        { name: reached ? "✅ Status" : "✨ XP Needed", value: reached ? "Already reached!" : `**${tools.commafy(remaining)}** XP`, inline: true },
    ]

    // Message/time estimates (only when not yet reached)
    if (!reached) {
        fields.push(
            { name: "💬 XP Per Message", value: xpPerMsgStr, inline: true },
            { name: "📨 Messages Needed", value: messagesStr, inline: true },
            { name: "⏱️ Est. Time", value: estimatedTime === Infinity ? "Until the end of time" : tools.time(estimatedTime * 1000, 1), inline: true }
        )
    }

    // Active multiplier (only if not 1×)
    if (multiplier !== 1) {
        fields.push({ name: "⚡ Active Multiplier", value: `${multiplier}×`, inline: true })
    }

    // Reward roles at exactly the target level
    let rewardRoles = (db.settings.rewards || []).filter(r => r.level === targetLevel)
    if (rewardRoles.length) {
        fields.push({ name: "🎖️ Reward Role", value: rewardRoles.map(r => `<@&${r.id}>`).join("\n"), inline: true })
    }

    // Voice XP section (only when voice XP is enabled and not yet reached)
    if (db.settings.enabledVoiceXp && !reached) {
        const v = db.settings.voice
        const intervalMin = v.interval / 60

        // Compute XP per interval using the same formula as the voice scheduler
        let voiceXpMin = Math.round(v.multiplier * xpMinPerMsg * v.interval / 60)
        let voiceXpMax = Math.round(v.multiplier * xpMaxPerMsg * v.interval / 60)
        let voiceXpAvg = Math.round((voiceXpMin + voiceXpMax) / 2)
        let voiceXpMutedAvg = Math.round(voiceXpAvg * v.mutedMultiplier)
        let voiceXpDeafAvg = Math.round(voiceXpAvg * v.deafMultiplier)

        let voiceRangeStr = voiceXpMin === voiceXpMax
            ? `${tools.commafy(voiceXpMin)} XP`
            : `${tools.commafy(voiceXpMin)}–${tools.commafy(voiceXpMax)} XP`

        let fmtVoiceTime = (xpPerInterval) => {
            if (xpPerInterval <= 0) return "N/A"
            return tools.time(Math.ceil(remaining / xpPerInterval) * v.interval * 1000, 1)
        }

        fields.push({ name: "🎙️ Voice XP", value: [
            `${voiceRangeStr} per ${intervalMin % 1 === 0 ? intervalMin : intervalMin.toFixed(1)}min interval`,
            `🔊 Normal: ~${fmtVoiceTime(voiceXpAvg)}`,
            `🔇 Muted: ~${fmtVoiceTime(voiceXpMutedAvg)}`,
            `🔕 Deafened: ~${fmtVoiceTime(voiceXpDeafAvg)}`
        ].join("\n"), inline: false })
    }

    // Title
    let titleStr = reached ? `✅ Level ${tools.commafy(targetLevel)} — Already Reached!` : `To reach level ${tools.commafy(targetLevel)}`
    if (maxLevel && reached) titleStr = `🎉 Maximum level reached!`

    let embed = tools.createEmbed({
        author: { name: member.user.displayName, iconURL: member.displayAvatarURL() },
        title: titleStr,
        color: embedColor,
        description: progressBar,
        fields
    })

    return int.reply({embeds: [embed]})

}}