module.exports = {
    metadata: {
        name: "balance",
        description: "View your current credit balance.",
        args: [
            { type: "user", name: "member", description: "Which member to view", required: false },
            { type: "bool", name: "hidden", description: "Hides the reply so only you can see it", required: false }
        ]
    },

    async run(client, int, tools) {
        let member = int.options.get("member")?.member || int.member;
        if (!member) return tools.warn("That member couldn't be found!");

        let peek = await tools.fetchSettings(int.user.id);
        let deferEphemeral = !!int.options.get("hidden")?.value || !!(peek?.settings?.leaderboard?.ephemeral);
        
        if (!int.deferred && !int.replied) await int.deferReply({ ephemeral: deferEphemeral });

        let db = await tools.fetchSettings(member.user.id);
        if (!db) return tools.warn("*noData");

        let userData = db.users[member.user.id] || { credits: 0 };
        let credits = userData.credits || 0;

        const emoji = "<:gold:1472934905972527285>";
        
        let text = member.user.id === int.user.id
            ? `You currently have **${tools.commafy(credits)}** ${emoji} credits.`
            : `**${member.user.username}** currently has **${tools.commafy(credits)}** ${emoji} credits.`;

        return int.editReply({ content: text });
    }
};