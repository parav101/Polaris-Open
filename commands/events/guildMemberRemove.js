module.exports = {
    name: 'guildMemberRemove',
    async execute(member, client,tools) {
        try {
            // Fetch server settings
            const db = await tools.fetchSettings(member.id,member.guild.id)
            // Check if XP reset is enabled
            if (!db?.settings?.enabled || !db.settings?.resetXpOnLeave) return;
            
            // Check if user has XP data
            if (!db.users?.[member.user.id]) return;
            
            //reduce the xp by 25% and remove the streak data
            let userData = db.users[member.user.id] || { xp: 0, cooldown: 0, voiceTime: 0 };
            if (userData.streak) {
                delete userData.streak; // Remove streak data
            }
            userData.xp = Math.round(userData.xp * 0.75);
            await client.db.update(member.guild.id, {
                $set: { [`users.${member.user.id}`]: userData }
            }).exec();
            
            
        } catch (error) {
            console.error('Error in guildMemberRemove event:', error);
        }
    }
};
