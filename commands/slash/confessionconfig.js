module.exports = {
    metadata: {
        name: "confessionconfig",
        description: "Configure confession settings",
        args: [
            { type: "string", name: "setting", description: "Which setting to change", required: false, choices: [
                { name: "enabled", value: "enabled" },
                { name: "channel", value: "channelId" },
                { name: "anonymous", value: "anonymous" },
                { name: "cooldown", value: "cooldown" },
                { name: "logchannel", value: "logChannelId" }
            ]},
            { type: "string", name: "value", description: "New value for the setting", required: false }
        ]
    },

    async run(client, int, tools) {
        // Acknowledge the interaction immediately to prevent timeout
        await int.deferReply({ ephemeral: true });

        try {
            if (!tools.canManageServer()) return await tools.safeReply("*notMod");

            // Fetch server settings
            let db = await tools.fetchSettings(int.user.id);
            if (!db) return await tools.safeReply("*noData");

            let setting = int.options.get("setting")?.value;
            let value = int.options.get("value")?.value;

            // If no setting specified, show current configuration
            if (!setting) {
                const embed = tools.createEmbed({
                    title: "Confession Configuration",
                    description: "Current confession settings for this server:",
                    color: 0x8B4513,
                    fields: [
                        { name: "Enabled", value: db.settings.confession.enabled ? "Yes" : "No", inline: true },
                        { name: "Channel", value: db.settings.confession.channelId ? `<#${db.settings.confession.channelId}>` : "Not set", inline: true },
                        { name: "Anonymous", value: db.settings.confession.anonymous ? "Yes" : "No", inline: true },
                        { name: "Cooldown", value: `${db.settings.confession.cooldown || 300} seconds`, inline: true },
                        { name: "Log Channel", value: db.settings.confession.logChannelId ? `<#${db.settings.confession.logChannelId}>` : "Not set", inline: true }
                    ]
                });

                return await tools.safeReply({ embeds: [embed], ephemeral: true });
            }

            // Handle setting changes
            let newValue;
            switch (setting) {
                case "enabled":
                    newValue = value?.toLowerCase() === "true" || value?.toLowerCase() === "yes" || value === "1";
                    db.settings.confession.enabled = newValue;
                    break;
                    
                case "channelId":
                    if (!value) return await tools.safeReply("Please specify a channel!");
                    let channel = int.guild.channels.cache.get(value.replace(/[^0-9]/g, "")) ||
                                 int.guild.channels.cache.find(c => c.name === value);
                    if (!channel) return await tools.safeReply("Channel not found!");
                    db.settings.confession.channelId = channel.id;
                    break;
                    
                case "anonymous":
                    newValue = value?.toLowerCase() === "true" || value?.toLowerCase() === "yes" || value === "1";
                    db.settings.confession.anonymous = newValue;
                    break;
                    
                case "cooldown":
                    let cooldown = parseInt(value);
                    if (isNaN(cooldown)) return await tools.safeReply("Please specify a valid number for cooldown!");
                    db.settings.confession.cooldown = tools.clamp(cooldown, 0, 86400);
                    break;
                    
                case "logChannelId":
                    if (!value) {
                        db.settings.confession.logChannelId = null;
                    } else {
                        let logChannel = int.guild.channels.cache.get(value.replace(/[^0-9]/g, "")) ||
                                       int.guild.channels.cache.find(c => c.name === value);
                        if (!logChannel) return await tools.safeReply("Log channel not found!");
                        db.settings.confession.logChannelId = logChannel.id;
                    }
                    break;
                    
                default:
                    return await tools.safeReply("Invalid setting!");
            }

            // Save changes
            await client.db.update(int.guild.id, { $set: { settings: db.settings } }).exec();

            // Confirm changes
            let settingName = setting.charAt(0).toUpperCase() + setting.slice(1);
            let confirmValue = newValue !== undefined ? newValue :
                              setting === "channelId" || setting === "logChannelId" ? `<#${db.settings.confession[setting]}>` :
                              db.settings.confession[setting];
                              
            await tools.safeReply({
                content: `✅ Confession setting \`${settingName}\` updated to \`${confirmValue}\``,
                ephemeral: true
            });
        } catch (error) {
            console.error("Error in confession config:", error);
            await tools.safeReply({
                content: "There was an error updating the confession settings. Please try again later.",
                ephemeral: true
            });
        }
    }
};