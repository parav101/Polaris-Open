module.exports = {
    metadata: {
        name: "button:settings_view_confession",
        slashEquivalent: "confessionconfig"
    },

    async run(client, int, tools, configData) {
        if (!tools.canManageServer()) return tools.warn("*notMod");

        // Fetch server settings
        let db = await tools.fetchSettings(int.user.id);
        if (!db) return tools.warn("*noData");

        let [dir, setting] = configData;
        
        if (dir === "confession" && setting === "confession") {
            // Show confession settings using the confession_settings command
            const confessionSettingsCommand = client.commands.get("button:confession_settings");
            if (confessionSettingsCommand) {
                return confessionSettingsCommand.run(client, int, tools, ["view", "confession"]);
            }
        }

        return tools.warn("Invalid confession setting!");
    }
};