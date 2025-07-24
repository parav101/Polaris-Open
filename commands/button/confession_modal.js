module.exports = {
    metadata: {
        name: "confession_modal",
        slashEquivalent: "confessionconfig"
    },

    async run(client, int, tools, modalData) {
        if (!tools.canManageServer()) return tools.warn("*notMod");

        // Check if it's the right user
        let [setting, userId] = modalData;
        if (userId != int.user.id) return int.deferUpdate();

        // Fetch server settings
        let db = await tools.fetchSettings(int.user.id);
        if (!db) return tools.warn("*noData");

        // Get the value from the modal
        const value = int.fields.getTextInputValue('confession_value');

        // Handle setting changes
        switch (setting) {
            case "channelId":
                if (!value) return tools.warn("Please specify a channel!");
                let channel = int.guild.channels.cache.get(value.replace(/[^0-9]/g, "")) || 
                             int.guild.channels.cache.find(c => c.name === value);
                if (!channel) return tools.warn("Channel not found!");
                db.settings.confession.channelId = channel.id;
                break;
                
            case "cooldown":
                let cooldown = parseInt(value);
                if (isNaN(cooldown)) return tools.warn("Please specify a valid number for cooldown!");
                db.settings.confession.cooldown = tools.clamp(cooldown, 0, 86400);
                break;
                 
            case "logChannelId":
                if (!value) {
                    db.settings.confession.logChannelId = null;
                } else {
                    let logChannel = int.guild.channels.cache.get(value.replace(/[^0-9]/g, "")) || 
                                   int.guild.channels.cache.find(c => c.name === value);
                    if (!logChannel) return tools.warn("Log channel not found!");
                    db.settings.confession.logChannelId = logChannel.id;
                }
                break;
                
            default:
                return tools.warn("Invalid setting!");
        }

        // Save changes
        await client.db.update(int.guild.id, { $set: { settings: db.settings } }).exec();

        // Confirm changes
        let settingName = setting.charAt(0).toUpperCase() + setting.slice(1);
        let confirmValue = setting === "channelId" || setting === "logChannelId" ? 
                          (db.settings.confession[setting] ? `<#${db.settings.confession[setting]}>` : "None") : 
                          db.settings.confession[setting];
                          
        await int.reply({ 
            content: `✅ Confession setting \`${settingName}\` updated to \`${confirmValue}\``, 
            ephemeral: true 
        });
    }
};