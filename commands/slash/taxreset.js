module.exports = {
    metadata: {
        name: "taxreset",
        description: "Reset the server's tax pool to 0.",
        permission: "ManageGuild",
        args: []
    },
    async run(client, int, tools) {
        const db = await tools.fetchSettings(int.user.id);
        
        if (!tools.canManageServer(int.member, db.settings.manualPerms)) {
            return tools.warn("*notMod");
        }

        await client.db.update(int.guild.id, { $set: { "info.taxCollected": 0 } }).exec();

        return tools.safeReply({
            content: "✅ The server's tax pool has been successfully reset to **0** credits."
        });
    }
}
