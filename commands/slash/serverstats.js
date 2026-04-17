const { buildPeriodStatsEmbed, getUtcDateKey, PERIOD_ORDER } = require("../../classes/ServerStats.js")

module.exports = {
metadata: {
    name: "serverstats",
    description: "View message activity stats for this server.",
    args: [
        { type: "string", name: "period", description: "Which stats window to view", required: false, choices: [
            { name: "Daily", value: "daily" },
            { name: "Weekly", value: "weekly" },
            { name: "Monthly", value: "monthly" },
            { name: "Quarterly", value: "quarterly" }
        ]},
        { type: "bool", name: "hidden", description: "Hides the reply so only you can see it", required: false }
    ]
},

async run(client, int, tools) {
    const isHidden = !!int.options.get("hidden")?.value
    if (!int.deferred && !int.replied) await int.deferReply({ ephemeral: isHidden })

    const db = await tools.fetchAll(int.guild.id)
    if (!db) return tools.warn("*noData")

    const statsSettings = db.settings?.stats
    if (!statsSettings?.enabled) {
        return tools.warn(`Server stats are not enabled in this server!${tools.canManageServer(int.member) ? ` (enable with ${tools.commandTag("config")})` : ""}`)
    }

    const statsDaily = db.statsDaily || {}
    if (!Object.keys(statsDaily).length) {
        return int.editReply({ content: "No server stats have been recorded yet." })
    }

    let period = int.options.get("period")?.value || "daily"
    if (!PERIOD_ORDER.includes(period)) period = "daily"

    const embed = buildPeriodStatsEmbed(int.guild, statsDaily, statsSettings, tools, period, getUtcDateKey())
    return int.editReply({ embeds: [embed] })
}}
