module.exports = {
    metadata: {
        name: "resetstreak",
        description: "Resets a user's streak.",
        args: [
            { type: "user", name: "user", description: "The user to reset the streak for.", required: true },
            { type: "bool", name: "hidden", description: "Hides the reply so only you can see it", required: false }
        ]
    },

    async run(client, int, tools) {
        // Check for admin permissions
        if (!tools.canManageServer()) {
            return tools.warn("You don't have permission to use this command!");
        }

        const member = int.options.getMember("user");
        const isHidden = !!int.options.get("hidden")?.value;
        await int.deferReply({ ephemeral: isHidden || false });

        let db = await tools.fetchSettings(member.id);
        if (!db.users[member.id]?.streak) {
            return int.editReply({ content: `${member.displayName} has no streak to reset.`, ephemeral: isHidden });
        }

        let userStreak = db.users[member.id].streak;

        // Remove milestone roles
        if (userStreak.milestoneRoles && userStreak.milestoneRoles.length > 0) {
            try {
                await member.roles.remove(userStreak.milestoneRoles);
            } catch (error) {
                console.error(`Failed to remove milestone roles for ${member.user.tag}:`, error);
                // continue anyway
            }
        }

        // Reset streak
        userStreak.count = 0;
        userStreak.highest = 0;
        userStreak.lastClaim = 0;
        userStreak.milestoneRoles = [];

        await client.db.update(int.guild.id, { $set: { [`users.${member.id}.streak`]: userStreak } }).exec();

        return int.editReply({ content: `Successfully reset ${member.displayName}'s streak.`, ephemeral: isHidden });
    }
}
