const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
    metadata: {
        name: "button:settings_edit_confession",
        slashEquivalent: "confessionconfig"
    },

    async run(client, int, tools, setting) {
        if (!tools.canManageServer()) return tools.warn("*notMod");

        // Fetch server settings
        let db = await tools.fetchSettings(int.user.id);
        if (!db) return tools.warn("*noData");

        // Handle confession settings
        if (setting.startsWith("confession.")) {
            let confessionSetting = setting.split(".")[1];
            
            // Create modal for setting values
            const modal = new ModalBuilder()
                .setCustomId(`confession_modal~${confessionSetting}~${int.user.id}`)
                .setTitle(`Set Confession ${confessionSetting}`);

            let placeholder, label;
            switch (confessionSetting) {
                case "channelId":
                    label = "Channel ID or Name";
                    placeholder = "Enter channel ID or name";
                    break;
                case "cooldown":
                    label = "Cooldown (seconds)";
                    placeholder = "Enter cooldown in seconds (0-86400)";
                    break;
                    placeholder = "Enter max length (1-2000)";
                    break;
                case "logChannelId":
                    label = "Log Channel ID or Name";
                    placeholder = "Enter channel ID or name (leave empty to disable)";
                    break;
                default:
                    label = confessionSetting;
                    placeholder = `Enter value for ${confessionSetting}`;
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
        } else {
            return tools.warn("Invalid confession setting!");
        }
    }
};