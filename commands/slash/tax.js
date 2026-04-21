module.exports = {
    metadata: {
        name: "tax",
        description: "View the server's current tax pool.",
        args: []
    },
    async run(client, int, tools) {
        const db = await tools.fetchSettings(int.user.id);
        const taxCollected = db.info?.taxCollected || 0;

        return tools.safeReply({
            content: `There are currently **${tools.commafy(taxCollected)}** credits sitting in the server's tax pool.`
        });
    }
}
