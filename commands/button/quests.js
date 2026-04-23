module.exports = {
    metadata: { name: "button:quests" },
    async run(client, int, tools) {
        return client.commands.get("quests").run(client, int, tools)
    }
}
