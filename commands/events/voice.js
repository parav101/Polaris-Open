const config = require("../../config.json")

module.exports = {
    async run(client, oldState, newState, tools) {
        const member = newState.member || oldState.member
        const guild = newState.guild || oldState.guild
        if (!member || !guild) return

        // Ignore bots
        if (member.user.bot) return
        if (config.lockBotToDevOnly && !tools.isDev(member.user)) return

        // Get user and guild info
        const userId = member.user.id
        const guildId = guild.id

        // fetch full guild document (we need voiceSessions)
        let db = await tools.fetchAll(guildId)
        if (!db || !db.settings?.enabled || !db.settings.enabledVoiceXp) return

        let settings = db.settings

        // Handle joining/leaving voice channels
        const oldChannel = oldState?.channelId
        const newChannel = newState?.channelId
        const joinedVoice = !oldChannel && newChannel
        const leftVoice = oldChannel && !newChannel

        // User joined voice - add session to database
        if (joinedVoice) {
            // Update user streak based on voice activity
            await tools.updateStreak(member, db, client, newState.channel, null)
            await tools.updateDailyXpSnapshot(member, db, client)

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