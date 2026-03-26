module.exports = {
    metadata: {
        name: "button:chests",
    },

    async run(client, int, tools) {
        // Run the chests slash command logic
        return client.commands.get("chests").run(client, int, tools);
    }
}
