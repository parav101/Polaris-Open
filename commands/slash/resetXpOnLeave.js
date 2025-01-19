module.exports = {
    metadata: {
        permission: "ManageGuild",
        name: "resetxponleave",
        description: "Toggle whether user XP should be reset when they leave the server",
    },

    async run(client, int, tools) {
        let db = await tools.fetchSettings() // only fetch settings before checking perms
        // Check if user has manage server permission
        if (!tools.canManageServer(int.member, db.settings.manualPerms)) return tools.warn("*notMod")
        if (!db) return tools.warn("*noData")

        const settings = db.settings
        
        // Toggle the setting
        const enabled = !settings?.resetXpOnLeave;
        
        // Update database
        await client.db.update(int.guild.id, {
            $set: { "settings.resetXpOnLeave": enabled }
        });

        // Reply to the interaction
        await int.reply({
            content: `XP reset on member leave has been ${enabled ? 'enabled' : 'disabled'}.`,
            flags: 64 // This sets the reply to be ephemeral
        });
    }
};
