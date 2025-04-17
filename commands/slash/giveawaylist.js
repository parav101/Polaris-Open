const Discord = require('discord.js');

module.exports = {
    metadata: {
        name: "giveawaylist",
        description: "List all active or recent giveaways in the server.",
        args: [
            { type: "string", name: "status", description: "Giveaway status to show", required: false, choices: [
                { name: "Active", value: "active" },
                { name: "Ended", value: "ended" },
                { name: "All", value: "all" }
            ]}
        ]
    },

    async run(client, int, tools) {
        // Get parameters
        const status = int.options.getString('status') || 'active';
        
        await int.deferReply();
        
        // Fetch server settings and giveaways
        const db = await tools.fetchSettings();
        if (!db) return tools.warn("*noData");
        
        // Get all giveaways for this server
        const allGiveaways = db.giveaways || [];
        
        // Filter by status
        let giveaways = [];
        const now = Date.now();
        
        if (status === 'active') {
            giveaways = allGiveaways.filter(g => !g.ended && g.endTime > now);
        } else if (status === 'ended') {
            giveaways = allGiveaways.filter(g => g.ended || g.endTime <= now);
        } else {
            giveaways = [...allGiveaways];
        }
        
        // Sort giveaways - active first, then most recent
        giveaways.sort((a, b) => {
            // Active first
            const aActive = !a.ended && a.endTime > now;
            const bActive = !b.ended && b.endTime > now;
            
            if (aActive && !bActive) return -1;
            if (!aActive && bActive) return 1;
            
            // Then by end time (most recent first)
            return b.endTime - a.endTime;
        });
        
        // No giveaways found
        if (giveaways.length === 0) {
            return int.followUp({
                content: `No ${status === 'all' ? '' : status + ' '}giveaways found in this server.`,
            });
        }
        
        // Create embeds for pages (10 giveaways per page)
        const pages = [];
        const itemsPerPage = 10;
        
        for (let i = 0; i < giveaways.length; i += itemsPerPage) {
            const pageGiveaways = giveaways.slice(i, i + itemsPerPage);
            let description = '';
            
            for (const giveaway of pageGiveaways) {
                const isActive = !giveaway.ended && giveaway.endTime > now;
                const statusEmoji = isActive ? '🟢' : giveaway.cancelled ? '🔴' : '⚫';
                const endTimeString = isActive 
                    ? `Ends ${tools.time(giveaway.endTime - now, 1)} from now`
                    : `Ended ${tools.formatTime(giveaway.endTime)}`;
                
                const channelMention = `<#${giveaway.channelId}>`;
                const prizeAmount = `${tools.commafy(giveaway.currentGold)} gold`;
                const participantsCount = `${giveaway.participants.length} participants`;
                
                let winnerInfo = '';
                if (giveaway.ended && !giveaway.cancelled) {
                    if (giveaway.winnerIds && giveaway.winnerIds.length > 0) {
                        winnerInfo = `\nWinner${giveaway.winnerIds.length > 1 ? 's' : ''}: ${giveaway.winnerIds.map(id => `<@${id}>`).join(', ')}`;
                    } else if (giveaway.winnerId) {
                        winnerInfo = `\nWinner: <@${giveaway.winnerId}>`;
                    } else {
                        winnerInfo = '\nNo winner selected';
                    }
                }
                
                const statusText = giveaway.cancelled ? 'Cancelled' : isActive ? 'Active' : 'Ended';
                
                description += `${statusEmoji} **${prizeAmount}** (${participantsCount}) - ${channelMention}\n`;
                description += `Host: <@${giveaway.hostId}> | Status: ${statusText} | ${endTimeString}${winnerInfo}\n\n`;
            }
            
            const embed = new Discord.EmbedBuilder()
                .setTitle(`${status === 'active' ? 'Active' : status === 'ended' ? 'Ended' : 'All'} Giveaways`)
                .setDescription(description)
                .setColor(status === 'active' ? 0x00FF00 : 0xFFD700)
                .setFooter({ 
                    text: `Page ${pages.length + 1}/${Math.ceil(giveaways.length / itemsPerPage)} · ${giveaways.length} giveaway${giveaways.length !== 1 ? 's' : ''}`,
                    iconURL: "https://cdn3.emoji.gg/emojis/9385-sparkles-pinkpastel.gif"
                })
                .setTimestamp();
            
            pages.push(embed);
        }
        
        // If only one page, just send it
        if (pages.length === 1) {
            return int.followUp({ embeds: [pages[0]] });
        }
        
        // Multiple pages, add pagination
        let currentPage = 0;
        
        const row = new Discord.ActionRowBuilder()
            .addComponents(
                new Discord.ButtonBuilder()
                    .setCustomId('prev_page')
                    .setLabel('Previous')
                    .setStyle(Discord.ButtonStyle.Secondary)
                    .setEmoji('⬅️')
                    .setDisabled(true),
                new Discord.ButtonBuilder()
                    .setCustomId('next_page')
                    .setLabel('Next')
                    .setStyle(Discord.ButtonStyle.Secondary)
                    .setEmoji('➡️')
                    .setDisabled(pages.length <= 1)
            );
        
        const message = await int.followUp({
            embeds: [pages[currentPage]],
            components: [row]
        });
        
        // Create collector for pagination
        const filter = i => i.user.id === int.user.id && ['prev_page', 'next_page'].includes(i.customId);
        const collector = message.createMessageComponentCollector({ filter, time: 120000 });
        
        collector.on('collect', async i => {
            if (i.customId === 'prev_page') {
                currentPage--;
            } else if (i.customId === 'next_page') {
                currentPage++;
            }
            
            // Update button states
            row.components[0].setDisabled(currentPage === 0);
            row.components[1].setDisabled(currentPage === pages.length - 1);
            
            // Update message
            await i.update({
                embeds: [pages[currentPage]],
                components: [row]
            });
        });
        
        collector.on('end', () => {
            // Disable all buttons
            row.components.forEach(button => button.setDisabled(true));
            int.editReply({ components: [row] }).catch(() => {});
        });
    }
};
