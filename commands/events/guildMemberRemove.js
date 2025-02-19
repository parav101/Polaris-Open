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
            
            // Reset member's XP
            await client.db.update(member.guild.id, {
                $unset: { [`users.${member.user.id}`]: "" }
            });
            
            
        } catch (error) {
            console.error('Error in guildMemberRemove event:', error);
        }
    }
};
