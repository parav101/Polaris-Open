const Discord = require("discord.js")

module.exports = {
metadata: {
    permission: "ManageGuild",
    name: "shopconfig",
    description: "Manage the credit shop. (requires manage server permission)",
    args: [
        { type: "role", name: "role", description: "The role to add or remove from shop", required: true },
        { type: "integer", name: "price", description: "Price in credits, or 0 to remove", min: 0, required: true },
        { type: "float", name: "duration", description: "Duration in hours", min: 0 },
        { type: "string", name: "name", description: "Custom name for the shop item" },
        { type: "string", name: "emoji", description: "Emoji for the shop item" }
    ]
},

async run(client, int, tools) {

    let db = await tools.fetchSettings()
    if (!tools.canManageServer(int.member, db.settings.manualPerms)) return tools.warn("*notMod")

    let role = int.options.getRole("role")
    let price = int.options.getInteger("price")
    let duration = int.options.getNumber("duration") || 24
    let customName = int.options.getString("name") || role.name
    let emoji = int.options.getString("emoji") || "✨"

    let shopItems = db.settings.shop.items || []
    let existingIndex = shopItems.findIndex(x => x.roleId == role.id)
    let foundExisting = (existingIndex >= 0) ? shopItems[existingIndex] : null

    if (price === 0) {
        if (!foundExisting) return tools.warn("This role is not in the shop!")
        shopItems.splice(existingIndex, 1)
        await client.db.update(int.guild.id, { $set: { 'settings.shop.items': shopItems } })
        return int.reply(`❌ **Removed <@&${role.id}> from the shop.**`)
    }

    if (!role.editable) return tools.warn(`I don't have permission to grant <@&${role.id}>!`)

    let itemData = {
        roleId: role.id,
        name: customName,
        price: price,
        duration: duration,
        emoji: emoji
    }

    if (foundExisting) {
        shopItems[existingIndex] = itemData
    } else {
        shopItems.push(itemData)
    }

    await client.db.update(int.guild.id, { $set: { 'settings.shop.items': shopItems } })
    return int.reply(`✅ **Added/Updated <@&${role.id}> in the shop!**\nPrice: **${tools.commafy(price)}** credits\nDuration: **${duration}** hours\nEmoji: ${emoji}`)

}}
