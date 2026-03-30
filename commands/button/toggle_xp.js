const Discord = require('discord.js')
module.exports = {
metadata: {
    name: "button:toggle_xp",
},

async run(client, int, tools) {
    // Defer immediately before any async operations
    await int.deferUpdate()
    
    let enabled = int.component.style == Discord.ButtonStyle.Success
    let db = await tools.fetchSettings()
    if (!db) return tools.warn("*noData")

    let settings = db.settings

    if (!tools.canManageServer(int.member, settings.manualPerms)) return tools.warn("*notMod")

    if (enabled == settings.enabled) return tools.warn(`XP is already ${enabled ? "enabled" : "disabled"} in this server!`)

    client.db.update(int.guild.id, { $set: { 'settings.enabled': enabled, 'info.lastUpdate': Date.now() }}).then(async () => {
        await int.editReply(`✅ **XP is now ${enabled ? "enabled" : "disabled"} in this server!**`).catch(() => {})
    }).catch(() => tools.warn("Something went wrong while trying to toggle XP!"))
}}