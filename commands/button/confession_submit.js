module.exports = {
    metadata: {
        name: "confession_submit",
        slashEquivalent: "confess"
    },

    async run(client, int, tools) {
        // Check if it's the right user
        let modalData = int.customId.split("~");
        if (modalData[1] != int.user.id) return int.deferUpdate();

        // Acknowledge the interaction immediately to prevent timeout
        await int.deferReply({ ephemeral: true });

        try {
            // Fetch server settings
            let db = await tools.fetchSettings(int.user.id);
            if (!db || !db.settings.confession.enabled) return await tools.safeReply("Confessions are not enabled in this server!");

            // Get confession text
            const confessionText = int.fields.getTextInputValue('confession-text');
            if (!confessionText) return;

            // Check channel
            const confessionChannelId = db.settings.confession.channelId;
            if (!confessionChannelId) return await tools.safeReply("Confession channel not configured!");

            const confessionChannel = await client.channels.fetch(confessionChannelId).catch(() => null);
            if (!confessionChannel) return await tools.safeReply("Confession channel not found!");

            // Apply cooldown
            const cooldown = (db.settings.confession.cooldown || 300) * 1000;
            let userData = db.users[int.user.id] || {};
            userData.confessionCooldown = Date.now() + cooldown;
            db.users[int.user.id] = userData;
            
            await client.db.update(int.guild.id, { $set: { [`users.${int.user.id}`]: userData } }).exec();

            // Create confession embed
            const embed = tools.createEmbed({
                title: "Anonymous Confession",
                description: `||${confessionText}||`,
                color: 0x8B4513, // Brown color for confessions
                footer: {
                    text: `Confession #${Math.floor(Math.random() * 10000) + 1}`
                },
                timestamp: true
            });

            // Send confession
            await confessionChannel.send({ embeds: [embed] });

            // Log confession if log channel is set
            if (db.settings.confession.logChannelId) {
                const logChannel = await client.channels.fetch(db.settings.confession.logChannelId).catch(() => null);
                if (logChannel) {
                    const logEmbed = tools.createEmbed({
                        title: "Confession Logged",
                        description: `**User:** ${int.user.tag} (${int.user.id})\n**Content:** ${confessionText}`,
                        color: 0xFFA500, // Orange color for logs
                        timestamp: true
                    });
                    await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
                }
            }

            // Reply to user
            await tools.safeReply({
                content: "Your anonymous confession has been submitted!",
                ephemeral: true
            });
        } catch (error) {
            console.error("Error in confession submission:", error);
            await tools.safeReply({
                content: "There was an error submitting your confession. Please try again later.",
                ephemeral: true
            });
        }
    }
};