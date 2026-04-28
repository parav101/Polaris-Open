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

    if (!int.deferred && !int.replied) {
        await int.deferReply()
    }

    let db = await client.db.fetch(int.guild.id, ["settings", `users.${user.id}`])
    if (!db) {
        await client.db.create({ _id: int.guild.id })
        db = { settings: {}, users: {} }
    }
    if (!db.users) db.users = {}
    if (!tools.canManageServer(int.member, db.settings?.manualPerms)) return tools.warn("*notMod")

    if (amount === 0 && operation === "add") return tools.warn("Invalid amount of credits!")
    if (user.bot) return tools.warn("You can't give credits to bots, silly!")

    let userData = db.users[user.id] || { xp: 0, credits: 0 }
    let oldCredits = userData.credits || 0
    let newCredits = oldCredits

    if (operation === "add") newCredits += amount
    else if (operation === "set") newCredits = amount

    newCredits = Math.max(0, newCredits) // min 0

    let diff = newCredits - oldCredits

    const existingLogs = userData.creditLogs || []
    const updatedLogs = [...existingLogs, {
        type: "addcredits",
        amount: diff,
        balance: newCredits,
        note: `Admin ${operation === "set"
            ? `set balance to ${tools.commafy(newCredits)}`
            : diff >= 0
                ? `added ${tools.commafy(Math.abs(diff))} credits`
                : `removed ${tools.commafy(Math.abs(diff))} credits`} (by ${int.member.displayName})`,
        ts: Date.now()
    }].slice(-5)

    await client.db.update(int.guild.id, {
        $set: {
            [`users.${user.id}.credits`]: newCredits,
            [`users.${user.id}.creditLogs`]: updatedLogs
        }
    }).select("_id").lean().exec()

    await int.editReply(`${newCredits > oldCredits ? "⏫" : "⏬"} ${user.displayName} now has **${tools.commafy(newCredits)}** credits! (previously ${tools.commafy(oldCredits)}, ${diff >= 0 ? "+" : ""}${tools.commafy(diff)})`)

}}
