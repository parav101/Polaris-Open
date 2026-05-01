const LevelUpMessage = require("../../classes/LevelUpMessage.js")
const Discord = require("discord.js")
const { generateLeaderboardEmbed } = require("../../classes/ActivityLeaderboard.js")
const { createStatsIncrementUpdate } = require("../../classes/ServerStats.js")
const { ensureDailyQuests, tickQuest, getTodayKey } = require("../../classes/Quests.js")
const config = require("../../config.json")

const CLAIM_WINDOW_MS = 60 * 1000

function buildClaimRow(disabled = false) {
    const button = new Discord.ButtonBuilder()
        .setCustomId("bump_claim")
        .setLabel("Claim Reward")
        .setStyle(Discord.ButtonStyle.Success)
        .setEmoji("💰")
        .setDisabled(disabled)
    return new Discord.ActionRowBuilder().addComponents(button)
}

function buildClaimEmbed(tools, rewardCredits, expiresAtUnix) {
    return new Discord.EmbedBuilder()
        .setColor(tools.COLOR)
        .setTitle("Bump Reward")
        .setDescription(`First person to claim gets **${tools.commafy(rewardCredits)}** credits.\nExpires ${`<t:${expiresAtUnix}:R>`}.`)
}

async function handleBumpReward(client, message, tools, db) {
    if (!message.author?.bot) return

    const bumpSettings = db.settings?.bump
    if (!bumpSettings?.enabled) return
    if (!bumpSettings.channelId || message.channel.id !== bumpSettings.channelId) return

    const expectedBotId = bumpSettings.disboardBotId || "302050872383242240"
    if (message.author.id !== expectedBotId) return

    const rewardCredits = Math.max(0, Number(bumpSettings.rewardCredits || 0))
    if (rewardCredits <= 0) return

    const expiresAtUnix = Math.floor((Date.now() + CLAIM_WINDOW_MS) / 1000)
    const claimMsg = await message.channel.send({
        embeds: [buildClaimEmbed(tools, rewardCredits, expiresAtUnix)],
        components: [buildClaimRow(false)]
    }).catch(() => null)

    if (!claimMsg) return

    let claimed = false
    const collector = claimMsg.createMessageComponentCollector({
        componentType: Discord.ComponentType.Button,
        time: CLAIM_WINDOW_MS
    })

    collector.on("collect", async (btnInt) => {
        if (btnInt.customId !== "bump_claim") return btnInt.deferUpdate().catch(() => {})

        if (claimed) {
            return btnInt.reply({ content: "This reward is already claimed.", ephemeral: true }).catch(() => {})
        }

        const deferred = await btnInt.deferReply({ ephemeral: true }).then(() => true).catch(() => false)
        if (!deferred) return

        const fresh = await tools.fetchSettings(btnInt.user.id, message.guild.id).catch(() => null)
        if (!fresh?.settings?.bump?.enabled) {
            return btnInt.editReply({ content: "Bump rewards are currently disabled." }).catch(() => {})
        }

        const freshReward = Math.max(0, Number(fresh.settings.bump.rewardCredits || 0))
        const cooldownSeconds = Math.max(0, Number(fresh.settings.bump.cooldownSeconds || 0))
        const now = Date.now()
        const claimantId = btnInt.user.id
        const userData = fresh.users?.[claimantId] || { xp: 0, cooldown: 0, voiceTime: 0 }
        const bumpCooldownUntil = Number(userData.bumpCooldownUntil || 0)

        if (bumpCooldownUntil > now) {
            return btnInt.editReply({
                content: `You are on bump reward cooldown for another **${tools.time(bumpCooldownUntil - now, 1)}**.`
            }).catch(() => {})
        }

        const newCredits = (userData.credits || 0) + freshReward
        const newBumpCooldownUntil = now + (cooldownSeconds * 1000)

        await client.db.update(message.guild.id, {
            $set: {
                [`users.${claimantId}.credits`]: newCredits,
                [`users.${claimantId}.bumpCooldownUntil`]: newBumpCooldownUntil,
                "info.lastUpdate": now
            }
        }).exec()
        client.userStats.dualWritePartial(message.guild.id, claimantId, { credits: newCredits }, "bump").catch(() => {})

        await tools.addCreditLog(client.db, message.guild.id, claimantId, {
            type: "bump",
            amount: freshReward,
            balance: newCredits,
            note: `Claimed bump reward (${tools.commafy(freshReward)} credits)`
        }, 5, userData.creditLogs || [])

        // Tick bumpClaim quest
        if (fresh.settings.quests?.enabled) {
            ensureDailyQuests(userData, fresh.settings, getTodayKey())
            tickQuest(userData, "bumpClaim")
            client.db.update(message.guild.id, {
                $set: { [`users.${claimantId}.quests`]: userData.quests }
            }).exec().catch(() => {})
        }

        claimed = true
        collector.stop("claimed")

        await claimMsg.edit({
            embeds: [
                new Discord.EmbedBuilder()
                    .setColor(0x2ecc71)
                    .setTitle("Bump Reward Claimed")
                    .setDescription(`<@${claimantId}> claimed **${tools.commafy(freshReward)}** credits.`)
                    .setTimestamp()
            ],
            components: [buildClaimRow(true)]
        }).catch(() => {})

        await btnInt.editReply({ content: `You claimed **${tools.commafy(freshReward)}** credits.` }).catch(() => {})
    })

    collector.on("end", async (_, reason) => {
        if (claimed || reason === "claimed") return
        await claimMsg.edit({
            embeds: [
                new Discord.EmbedBuilder()
                    .setColor(0xe67e22)
                    .setTitle("Bump Reward Expired")
                    .setDescription("No one claimed the reward in time.")
                    .setTimestamp()
            ],
            components: [buildClaimRow(true)]
        }).catch(() => {})
    })
}

module.exports = {

async run(client, message, tools) {

    if (config.lockBotToDevOnly && !tools.isDev(message.author)) return
    if (message.system) return
    else if (!message.guild) return // dm stuff

    // fetch server settings, this can probably be optimized with caching but shrug
    let author = message.author.id
    let db = await tools.fetchSettings(author, message.guild.id)
    if (!db) return

    await handleBumpReward(client, message, tools, db).catch(() => {})
    if (message.author.bot) return

    if (db.settings?.stats?.enabled) {
        client.db.update(message.guild.id, createStatsIncrementUpdate(message)).exec().catch(() => {})
    }

    if (!db.settings?.enabled) return

    let settings = db.settings

    // ,lb shortcut — only works in the configured activity leaderboard channel
    if (message.content.trim().toLowerCase() === ",lb") {
        if (
            db?.settings?.activityLeaderboard?.enabled &&
            db.settings.activityLeaderboard.channelId === message.channel.id
        ) {
            const loadingMsg = await message.reply({ content: "<a:loading:1478025535975325738> Loading activity leaderboard..." }).catch(() => null)

            // Use indexed user_stats instead of fetchAll
            const statsUsers = await client.userStats.fetchAllSorted(message.guild.id, "activityXpAccumulated", { activeOnly: true }).catch(() => [])
            const usersMap = {}
            for (const u of statsUsers) {
                usersMap[u.id] = {
                    xp: u.xp,
                    hidden: u.hidden,
                    activityXpAccumulated: u.activityXpAccumulated,
                    lastDailyUpdate: u.lastDailyUpdate,
                }
            }
            const slimDb = { users: usersMap, settings: db.settings }

            const embed = await generateLeaderboardEmbed(message.guild, slimDb, tools, null, false, message.author.id)

            if (!embed) {
                if (loadingMsg) await loadingMsg.edit({ content: "Failed to load leaderboard." }).catch(() => {})
                return
            }

            if (loadingMsg) {
                await loadingMsg.edit({ content: "", embeds: [embed] }).catch(() => {})
            } else {
                await message.reply({ embeds: [embed] }).catch(() => {})
            }
            return
        }
        return
    }

     // Update user streak based on message activity
    await tools.updateStreak(message.member, db, client, message.channel, message);
    await tools.updateDailyXpSnapshot(message.member, db, client);
    await tools.checkTempRoles(message.member, db, client);

    // Ensure daily quests are initialised for today (quest tick happens after XP is awarded below)
    if (db.settings.quests?.enabled) {
        if (!db.users[author]) db.users[author] = {}
        ensureDailyQuests(db.users[author], db.settings, getTodayKey())
    }

    // fetch user's xp, or give them 0
    let userData = db.users[author] || { xp: 0, cooldown: 0, voiceTime: 0 }
    if (userData.cooldown > Date.now()) return // on cooldown, stop here

    // check role+channel multipliers, exit if 0x
    let multiplierData = tools.getMultiplier(message.member, settings, message.channel)
    if (multiplierData.multiplier <= 0) return

    // randomly choose an amount of XP to give
    let oldXP = userData.xp
    let xpRange = [settings.gain.min, settings.gain.max].map(x => Math.round(x * multiplierData.multiplier))
    let xpGained = tools.rng(...xpRange) // number between min and max, inclusive

    if (xpGained > 0) userData.xp += Math.round(xpGained)
    else return
    
    // add to daily raw xp
    userData.activityXpAccumulated = (userData.activityXpAccumulated || 0) + (xpGained / multiplierData.multiplier)
    userData.msgXp = (userData.msgXp || 0) + (xpGained / multiplierData.multiplier)

    // track last xp gain time
    userData.lastXpGain = Date.now()

    // set xp cooldown
    if (settings.gain.time > 0) userData.cooldown = Date.now() + (settings.gain.time * 1000)
    
    // if hidden from leaderboard, unhide since they're no longer inactive
    if (userData.hidden) userData.hidden = false

    // Tick quests for message-related event types
    if (db.settings.quests?.enabled && userData.quests?.list?.length) {
        tickQuest(userData, "message")
        tickQuest(userData, "channel", { channelId: message.channel.id })
        tickQuest(userData, "msgXp", { amount: Math.round(xpGained / multiplierData.multiplier) })
    }

    // database update
    client.db.update(message.guild.id, { $set: { [`users.${author}`]: userData } }).exec();
    client.userStats.dualWriteFromUserData(message.guild.id, author, userData, "message").catch(() => {})

    // check for level up
    let oldLevel = tools.getLevel(oldXP, settings)
    let newLevel = tools.getLevel(userData.xp, settings)
    let levelUp = newLevel > oldLevel

    // auto sync roles on xp gain or level up
    let syncMode = settings.rewardSyncing.sync
    if (syncMode == "xp" || (syncMode == "level" && levelUp)) { 
        let roleCheck = tools.checkLevelRoles(message.guild.roles.cache, message.member.roles.cache, newLevel, settings.rewards, null, oldLevel)
        tools.syncLevelRoles(message.member, roleCheck).catch(() => {})
    }

    // level up message
    if (levelUp && settings.levelUp.enabled && settings.levelUp.message) {
        let useMultiple = (settings.levelUp.multiple > 1 && (settings.levelUp.multipleUntil == 0 || (newLevel < settings.levelUp.multipleUntil)))
        if (!useMultiple || (newLevel % settings.levelUp.multiple == 0)) {
            let lvlMessage = new LevelUpMessage(settings, message, { oldLevel, level: newLevel, userData })
            lvlMessage.send()
        }
    }

}}