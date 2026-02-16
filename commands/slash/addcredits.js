const Discord = require("discord.js")

module.exports = {
metadata: {
    permission: "ManageGuild",
    name: "addcredits",
    description: "Add or remove credits from a member. (requires manage server permission)",
    args: [
        { type: "user", name: "member", description: "Which member to modify", required: true },
        { type: "integer", name: "amount", description: "How many credits to add (negative number to remove)", min: -1000000, max: 1000000, required: true },
        { type: "string", name: "operation", description: "How the amount should be interpreted", required: false, choices: [
            {name: "Add Credits", value: "add"},
            {name: "Set Credits to", value: "set"},
        ]},
    ]
},

async run(client, int, tools) {

    const member = int.options.get("member")?.member
    const amount = int.options.get("amount")?.value
    const operation = int.options.get("operation")?.value || "add"

    let user = member?.user
    if (!user) return tools.warn("I couldn't find that member!")

    let db = await tools.fetchSettings(user.id)
    if (!db) return tools.warn("*noData")
    else if (!tools.canManageServer(int.member, db.settings.manualPerms)) return tools.warn("*notMod")

    if (amount === 0 && operation === "add") return tools.warn("Invalid amount of credits!")
    if (user.bot) return tools.warn("You can't give credits to bots, silly!")

    let userData = db.users[user.id] || { xp: 0, credits: 0 }
    let oldCredits = userData.credits || 0
    let newCredits = oldCredits

    if (operation === "add") newCredits += amount
    else if (operation === "set") newCredits = amount

    newCredits = Math.max(0, newCredits) // min 0

    let diff = newCredits - oldCredits

    client.db.update(int.guild.id, { $set: { [`users.${user.id}.credits`]: newCredits } }).then(() => {
        int.reply(`${newCredits > oldCredits ? "⏫" : "⏬"} ${user.displayName} now has **${tools.commafy(newCredits)}** credits! (previously ${tools.commafy(oldCredits)}, ${diff >= 0 ? "+" : ""}${tools.commafy(diff)})`)
    }).catch(() => tools.warn("Something went wrong while trying to modify credits!"))

}}
