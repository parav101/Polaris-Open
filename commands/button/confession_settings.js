const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
    metadata: {
        name: "confession_settings",
        slashEquivalent: "confessionconfig"
    },

    async run(client, int, tools, configData) {
        if (!tools.canManageServer()) return tools.warn("*notMod");

        // Fetch server settings
        let db = await tools.fetchSettings(int.user.id);
        if (!db) return tools.warn("*noData");

        let [action, setting] = configData;

        switch (action) {
            case "view":
                if (setting === "confession") {
                    const embed = tools.createEmbed({
                        title: "Confession Settings",
                        description: "Configure the anonymous confession system",
                        color: 0x8B4513,
                        fields: [
                            { name: "Enabled", value: db.settings.confession.enabled ? "✅ Yes" : "❌ No", inline: true },
                            { name: "Channel", value: db.settings.confession.channelId ? `<#${db.settings.confession.channelId}>` : "Not set", inline: true },
                            { name: "Anonymous", value: db.settings.confession.anonymous ? "✅ Yes" : "❌ No", inline: true },
                            { name: "Cooldown", value: `${db.settings.confession.cooldown || 300} seconds`, inline: true },
                            { name: "Log Channel", value: db.settings.confession.logChannelId ? `<#${db.settings.confession.logChannelId}>` : "Not set", inline: true }
                        ]
                    });

                    const buttons = tools.button([
                        { style: "Primary", label: "Enable/Disable", customId: `confession_settings~toggle~enabled` },
                        { style: "Primary", label: "Set Channel", customId: `confession_settings~set~channelId` },
                        { style: "Primary", label: "Toggle Anonymous", customId: `confession_settings~toggle~anonymous` },
                        { style: "Primary", label: "Set Cooldown", customId: `confession_settings~set~cooldown` },
                        { style: "Primary", label: "Set Log Channel", customId: `confession_settings~set~logChannelId` },
                        { style: "Secondary", label: "Back", customId: "settings_list" }
                    ]);

                    return int.update({ embeds: [embed], components: tools.row(buttons) });
                }
                break;

            case "toggle":
                let newValue = !db.settings.confession[setting];
                db.settings.confession[setting] = newValue;
                await client.db.update(int.guild.id, { $set: { settings: db.settings } }).exec();
                
                await int.reply({ 
                    content: `✅ Confession setting \`${setting}\` ${newValue ? "enabled" : "disabled"}`, 
                    ephemeral: true 
                });
                
                // Refresh the view
                setTimeout(async () => {
                    let refreshDb = await tools.fetchSettings(int.user.id);
                    const refreshEmbed = tools.createEmbed({
                        title: "Confession Settings",
                        description: "Configure the anonymous confession system",
                        color: 0x8B4513,
                        fields: [
                            { name: "Enabled", value: refreshDb.settings.confession.enabled ? "✅ Yes" : "❌ No", inline: true },
                            { name: "Channel", value: refreshDb.settings.confession.channelId ? `<#${refreshDb.settings.confession.channelId}>` : "Not set", inline: true },
                            { name: "Anonymous", value: refreshDb.settings.confession.anonymous ? "✅ Yes" : "❌ No", inline: true },
                            { name: "Cooldown", value: `${refreshDb.settings.confession.cooldown || 300} seconds`, inline: true },
                            { name: "Log Channel", value: refreshDb.settings.confession.logChannelId ? `<#${refreshDb.settings.confession.logChannelId}>` : "Not set", inline: true }
                        ]
                    });
                    await int.message.edit({ embeds: [refreshEmbed] });
                }, 1000);
                break;

            case "set":
                // Create modal for setting values
                const modal = new ModalBuilder()
                    .setCustomId(`confession_modal~${setting}~${int.user.id}`)
                    .setTitle(`Set Confession ${setting}`);

                let placeholder, label;
                switch (setting) {
                    case "channelId":
                        label = "Channel ID or Name";
                        placeholder = "Enter channel ID or name";
                        break;
                    case "cooldown":
                        label = "Cooldown (seconds)";
                        placeholder = "Enter cooldown in seconds (0-86400)";
                        break;
                    case "logChannelId":
                        label = "Log Channel ID or Name";
                        placeholder = "Enter channel ID or name (leave empty to disable)";
                        break;
                    default:
                        label = setting;
                        placeholder = `Enter value for ${setting}`;
                }

                const input = new TextInputBuilder()
                    .setCustomId('confession_value')
                    .setLabel(label)
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setPlaceholder(placeholder);

                const actionRow = new ActionRowBuilder().addComponents(input);
                modal.addComponents(actionRow);

                await int.showModal(modal);
                break;
        }
    }
};