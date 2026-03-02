const LevelUpMessage = require("../../classes/LevelUpMessage.js")
const { buildActivityLeaderboard, nextAnchorUnix, snapInterval } = require("../../classes/ActivityLeaderboard.js")
const config = require("../../config.json")

const RANK_EMOJIS = [
    "<:1_:1477998075535429713>",
    "<:2_:1477998064756326471>",
    "<:3_:1477998056224985190>",
    "<:4_:1477998060780126270>",
    "<:5_:1477998058175205523>",
    "<:6_:1477998062914895925>",
    "<:7_:1477998069587902566>",
    "<:8_:1477998071508893756>",
    "<:9_:1477998073413111979>",
]

module.exports = {

async run(client, message, tools) {

    if (config.lockBotToDevOnly && !tools.isDev(message.author)) return

    // fetch server xp settings, this can probably be optimized with caching but shrug
    let author = message.author.id
    let db = await tools.fetchSettings(author, message.guild.id)
    if (!db || !db.settings?.enabled) return
    
    let settings = db.settings
    // ,lb shortcut — only works in the configured activity leaderboard channel
    if (message.content.trim().toLowerCase() === ",lb") {
        const fullDb = await tools.fetchAll(message.guild.id).catch(() => null)
        if (
            fullDb?.settings?.activityLeaderboard?.enabled &&
            fullDb.settings.activityLeaderboard.channelId === message.channel.id
        ) {
            const lbSettings = fullDb.settings.activityLeaderboard
            const intervalHours = snapInterval(lbSettings.interval || 24)
            const nextPost = nextAnchorUnix(Date.now(), intervalHours)
            const _d = new Date()
            const nextMidnight = Math.floor(Date.UTC(_d.getUTCFullYear(), _d.getUTCMonth(), _d.getUTCDate() + 1) / 1000)

            const loadingMsg = await message.reply({ content: "<a:loading:1478025535975325738> Loading activity leaderboard..." }).catch(() => null)

            const rankings = await buildActivityLeaderboard(message.guild, fullDb)

            const postLine = `\n\n<:progress:1466819928110792816> Next reward <t:${nextPost}:R>\n<:userxp:1466822701724340304> XP resets <t:${nextMidnight}:R>`

            let description
            if (!rankings.length) {
                description = "<:info:1466817220687695967> No activity recorded today yet! Members need to chat or be in voice to appear here." + postLine
            } else {
                description = rankings.map((entry, i) =>
                    `${RANK_EMOJIS[i]} <@${entry.id}> — **${tools.commafy(entry.activityXP)}** Daily XP`
                ).join("\n") + postLine
            }

            const embed = tools.createEmbed({
                color: tools.COLOR,
                author: {
                    name: `Activity Leaderboard — ${message.guild.name}`,
                    iconURL: message.guild.iconURL()
                },
                description
            })

            const topCredits = lbSettings.topCredits || 0
            const topRoleId  = lbSettings.topRoleId  || ""
            if (topCredits > 0 || topRoleId) {
                const rewardParts = []
                if (topCredits > 0) rewardParts.push(`<:extendedend:1466819484999225579><:gold:1472934905972527285> **${tools.commafy(topCredits)}** credits`)
                if (topRoleId)      rewardParts.push(`<:extendedend:1466819484999225579><@&${topRoleId}>`)
                embed.addFields([{ name: "<:info:1466817220687695967> Top User Reward", value: rewardParts.join("  ·  "), inline: false }])
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
    
    // set xp cooldown
    if (settings.gain.time > 0) userData.cooldown = Date.now() + (settings.gain.time * 1000)
    
    // if hidden from leaderboard, unhide since they're no longer inactive
    if (userData.hidden) userData.hidden = false

    // database update
    client.db.update(message.guild.id, { $set: { [`users.${author}`]: userData } }).exec();

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