module.exports = {
    async run(client, int, tools) {
        try {
            const member = int.member;
            let db = await tools.fetchSettings(int.author.id, int.guild.id);
            if (!db?.settings?.enabled || !db.settings?.nicknameRank) return;
            if (member.id === int.guild.ownerId) return;

            // Fetch user streak count (default to 0)
            let userData = db.users?.[member.user.id] || {};
            let streak = (userData.streak && typeof userData.streak.count === 'number') ? userData.streak.count : 0;

            // Get member's nickname
            const emoji = db.settings.levelUp.emoji;
            const currentName = member.nickname || member.user.displayName;
            // Regex to match existing streak at the end
            const streakRegex = new RegExp(`\\s${emoji}(\\d+)$`);
            const streakMatch = currentName.match(streakRegex);
            const prevStreak = streakMatch ? parseInt(streakMatch[1]) : null;

            // Only update if streak changed or not present
            if (streakMatch) {
                if (parseInt(streakMatch[1]) === streak) return;
                const cleanName = currentName.replace(streakRegex, '');
                const newNickname = `${cleanName} ${emoji}${streak}`;
                if (newNickname.length <= 32) {
                    member.setNickname(newNickname);
                } else {
                    const maxNameLength = 32 - (emoji.length + streak.toString().length + 1);
                    const truncatedName = cleanName.substring(0, maxNameLength);
                    member.setNickname(`${truncatedName} ${emoji}${streak}`);
                }
            } else {
                // No streak in nickname, add it
                const newNickname = `${currentName} ${emoji}${streak}`;
                if (newNickname.length <= 32) {
                    member.setNickname(newNickname);
                } else {
                    const maxNameLength = 32 - (emoji.length + streak.toString().length + 1);
                    const truncatedName = currentName.substring(0, maxNameLength);
                    member.setNickname(`${truncatedName} ${emoji}${streak}`);
                }
            }
        } catch (error) {
            console.error('Error in guildMemberNicknameRank event:', error);
        }
    }
};