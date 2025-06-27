const config = require("../../config.json")

module.exports = {
    async run(client, oldState, newState, tools) {
        // Ignore bots
        if (oldState.member.user.bot) return
        if (config.lockBotToDevOnly && !tools.isDev(oldState.member.user)) return

        // Get user and guild info
        const userId = oldState.member.user.id
        const guildId = oldState.guild.id

        // fetch server xp settings
        let db = await tools.fetchSettings(userId, guildId)
        if (!db || !db.settings?.enabled || !db.settings.enabledVoiceXp) return

        let settings = db.settings
        if(settings.enabledVoiceXp == false) return

        // Handle joining/leaving voice channels
        const joinedVoice = !oldState.channelId && newState.channelId
        const leftVoice = oldState.channelId && !newState.channelId
        const movedChannel = oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId

        // Get user data
        let userData = db.users[userId] || { xp: 0, cooldown: 0, voiceTime: 0 }
            
        // Calculate voice time and XP
        if (leftVoice || movedChannel) {
            // Check if user is on cooldown
            if (userData.voiceTime > 30000) {
                // Calculate XP gain based on voice time
                const multiplierData = tools.getMultiplier(oldState.member, settings, oldState.channel)
                if (multiplierData.multiplier > 0) {
                    // Add XP and set cooldown
                    const oldXP = userData.xp
                    let xpRange = [settings.gain.min, settings.gain.max].map(x => Math.round(x * multiplierData.multiplier))
                    let xpGained = tools.rng(...xpRange) // number between min and max, inclusive
                    xpGained = Math.round(settings.voice.multiplier * xpGained)
                    
                    let voiceTime = 0;
                    if(settings.voice.hoursLimit > 0 && Date.now() - userData.voiceTime > settings.voice.hoursLimit * 3600000)
                    voiceTime = settings.voice.hoursLimit * 3600000
                    else
                    voiceTime = Date.now() - userData.voiceTime;
                    xpGained = Math.round(xpGained * voiceTime / 60000); // xp per minute
                    if (xpGained > 0) userData.xp += Math.round(xpGained)
                    
                    userData.cooldown = Date.now() + (settings.gain.time * 1000)
                    userData.voiceTime = 0;

                    // Update user data
                    client.db.update(guildId, { $set: { [`users.${userId}`]: userData } }).exec()

                    // Check for level up
                    const oldLevel = tools.getLevel(oldXP, settings)
                    const newLevel = tools.getLevel(userData.xp, settings)

                    // Handle level up
                    if (newLevel > oldLevel) {
                        // Sync roles if needed
                        let syncMode = settings.rewardSyncing.sync
                        if (syncMode == "xp" || (syncMode == "level")) {
                            let roleCheck = tools.checkLevelRoles(oldState.guild.roles.cache, oldState.member.roles.cache, newLevel, settings.rewards, null, oldLevel)
                            tools.syncLevelRoles(oldState.member, roleCheck).catch(() => {})
                        }
                    }
                }
            }
            else{
                userData.voiceTime = 0;
                client.db.update(guildId, { $set: { [`users.${userId}`]: userData } }).exec()
            }
        }

        // Update voice time on join
        if (joinedVoice || movedChannel) {
            userData.voiceTime = Date.now()
            client.db.update(guildId, { $set: { [`users.${userId}`]: userData } }).exec()
            // Update user streak based on voice activity
            await tools.updateStreak(newState.member, db, client, newState.channel);
        }
    }
}