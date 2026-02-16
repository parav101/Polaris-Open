module.exports = {
    metadata: {
        name: "button:shop",
    },

    async run(client, int, tools) {
        // Run the shop slash command logic
        return client.commands.get("shop").run(client, int, tools);
    }
}
