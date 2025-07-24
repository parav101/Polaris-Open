const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
    metadata: {
        name: "confess",
        description: "Make an anonymous confession",
        args: []
    },

    async run(client, int, tools) {
        // Fetch server settings
        let db = await tools.fetchSettings(int.user.id);
        if (!db) return tools.warn("*noData");
        else if (!db.settings.confession.enabled) return tools.warn("Confessions are not enabled in this server!");

        // Check cooldown
        let userData = db.users[int.user.id] || { confessionCooldown: 0 };
        if (userData.confessionCooldown > Date.now()) {
            let timeLeft = userData.confessionCooldown - Date.now();
            return tools.warn(`You're on cooldown! Please wait ${tools.time(timeLeft)} before confessing again.`);
        }

        // Create modal for confession
        const modal = new ModalBuilder()
            .setCustomId(`confession-modal~${int.user.id}`)
            .setTitle('Anonymous Confession');

        const confessionInput = new TextInputBuilder()
            .setCustomId('confession-text')
            .setLabel('Your confession:')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000)
            .setPlaceholder('Type your anonymous confession here...');

        const firstActionRow = new ActionRowBuilder().addComponents(confessionInput);
        modal.addComponents(firstActionRow);

        // Show modal
        await int.showModal(modal);
    }
};