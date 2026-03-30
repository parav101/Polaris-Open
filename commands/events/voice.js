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

        // Handle joining/leaving voice channels
        const joinedVoice = !oldState.channelId && newState.channelId
        const leftVoice = oldState.channelId && !newState.channelId

        // User joined voice - add session to database
        if (joinedVoice) {
            // Update user streak based on voice activity
            await tools.updateStreak(newState.member, db, client, newState.channel, null)
            await tools.updateDailyXpSnapshot(newState.member, db, client)

            // Add voice session to database
            const voiceSession = {
                userId: userId,
                joinTime: Date.now(),
                lastXpTime: Date.now(),
                shardId: client.shard.id
            }

            // Find and update existing session or create new one
            const existingSession = db.voiceSessions?.findIndex(s => s.userId === userId)
            if (existingSession >= 0) {
                db.voiceSessions[existingSession] = voiceSession
            } else {
                if (!db.voiceSessions) db.voiceSessions = []
                db.voiceSessions.push(voiceSession)
            }

            client.db.update(guildId, { $set: { voiceSessions: db.voiceSessions } }).exec()
        }

        // User left voice - remove session from database
        if (leftVoice) {
            if (db.voiceSessions) {
                const sessionIndex = db.voiceSessions.findIndex(s => s.userId === userId)
                if (sessionIndex >= 0) {
                    db.voiceSessions.splice(sessionIndex, 1)
                    client.db.update(guildId, { $set: { voiceSessions: db.voiceSessions } }).exec()
                }
            }
        }
    }
}