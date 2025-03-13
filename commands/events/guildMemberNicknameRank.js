module.exports = {
    async run(client, int, tools){
        try {
            //fetch server settings
            const member = int.member;
            let db = await tools.fetchSettings(int.author.id, int.guild.id)
            //check if nickname rank is enabled
            if (!db?.settings?.enabled || !db.settings?.nicknameRank) return;
            // Check if member is the server owner - can't change the owner's nickname
            if (member.id === int.guild.ownerId) return;

            if (!db.users?.[member.user.id]) {
                //create user data
                await client.db.update(member.guild.id, {
                    $set: { [`users.${member.user.id}`]: { xp: 0, cooldown: 0, voiceTime: 0 } }
                })
            } else {
                let wholeDB = await tools.fetchAll(int.guild.id);
                const rank = tools.getRank(member.id, wholeDB.users);
                if (!rank) return;
                else if (rank > db.settings.levelUp.maxRank) return;
                
                //get member's nickname
                const currentName = member.nickname || member.user.displayName;
                const emoji = db.settings.levelUp.emoji;
                
                // Check if the nickname already contains any rank
                const rankRegex = new RegExp(`\\s${emoji}\\d+$`);
                if (currentName.match(rankRegex)) {
                    // If there's already a rank and it's the same, do nothing
                    if (currentName.endsWith(`${emoji}${rank}`)) {
                        return;
                    }
                    
                    // If it's a different rank, update it
                    const cleanName = currentName.replace(rankRegex, '');
                    const newNickname = `${cleanName} ${emoji}${rank}`;
                    
                    // Check Discord's 32 character limit for nicknames
                    if (newNickname.length <= 32) {
                        member.setNickname(newNickname);
                    } else {
                        // If too long, truncate the name to fit
                        const maxNameLength = 32 - (emoji.length + rank.toString().length + 1);
                        const truncatedName = cleanName.substring(0, maxNameLength);
                        member.setNickname(`${truncatedName} ${emoji}${rank}`);
                    }
                } else {
                    // No rank in nickname, add the new rank
                    const newNickname = `${currentName} ${emoji}${rank}`;
                    
                    // Check Discord's character limit
                    if (newNickname.length <= 32) {
                        member.setNickname(newNickname);
                    } else {
                        // If too long, truncate the name to fit
                        const maxNameLength = 32 - (emoji.length + rank.toString().length + 1);
                        const truncatedName = currentName.substring(0, maxNameLength);
                        member.setNickname(`${truncatedName} ${emoji}${rank}`);
                    }
                }
            }
        } catch (error) {
            console.error('Error in guildMemberNicknameRank event:', error);
        }
    }
}