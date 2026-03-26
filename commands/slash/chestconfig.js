const Discord = require("discord.js")

module.exports = {
metadata: {
    permission: "ManageGuild",
    name: "chestconfig",
    description: "Manage chests. (requires manage server permission)",
    args: [
        { type: "string", name: "name", description: "Name of the chest or 'list' to see all chests or 'remove:<index>' to remove", required: true },
        { type: "integer", name: "price", description: "Price in credits (0 to remove the chest)", min: 0, required: false },
        { type: "integer", name: "xpmin", description: "Minimum XP to gain from this chest", min: 0, required: false },
        { type: "integer", name: "xpmax", description: "Maximum XP to gain from this chest", min: 0, required: false },
        { type: "string", name: "emoji", description: "Emoji for the chest" }
    ]
},

async run(client, int, tools) {

    let db = await tools.fetchSettings()
    if (!tools.canManageServer(int.member, db.settings.manualPerms)) return tools.warn("*notMod")

    let name = int.options.getString("name")
    let price = int.options.getInteger("price")
    let xpMin = int.options.getInteger("xpmin")
    let xpMax = int.options.getInteger("xpmax")
    let emoji = int.options.getString("emoji") || "📦"

    let chestItems = db.settings.chests.items || []

    // List command
    if (name.toLowerCase() === "list") {
        if (chestItems.length === 0) return tools.warn("There are no chests configured yet!")
        
        let chestList = chestItems.map((item, idx) => {
            return `**${idx + 1}.** ${item.emoji} **${item.name}** - ${tools.commafy(item.price)} credits (${tools.commafy(item.xpMin)}-${tools.commafy(item.xpMax)} XP)`
        }).join("\n")
        
        let embed = tools.createEmbed({
            title: "Configured Chests",
            description: chestList,
            color: tools.COLOR
        })
        
        return int.reply({ embeds: [embed] })
    }

    // Remove command
    if (name.toLowerCase().startsWith("remove:")) {
        let indexStr = name.substring(7)
        let index = parseInt(indexStr) - 1
        
        if (isNaN(index) || index < 0 || index >= chestItems.length) {
            return tools.warn("Invalid chest index! Use 'list' to see all chests.")
        }
        
        let removedChest = chestItems.splice(index, 1)[0]
        await client.db.update(int.guild.id, { $set: { 'settings.chests.items': chestItems } })
        return int.reply(`❌ **Removed chest: ${removedChest.emoji} ${removedChest.name}**`)
    }

    // Add/Edit chest
    if (price === null || xpMin === null || xpMax === null) {
        return tools.warn("Please provide all parameters: name, price, xpMin, and xpMax")
    }

    // Validate xpMin and xpMax
    if (xpMin > xpMax) {
        let temp = xpMin
        xpMin = xpMax
        xpMax = temp
    }

    let itemData = {
        name: name,
        price: price,
        xpMin: xpMin,
        xpMax: xpMax,
        emoji: emoji
    }

    // Check if chest with same name already exists
    let existingIndex = chestItems.findIndex(x => x.name.toLowerCase() === name.toLowerCase())
    
    if (existingIndex >= 0) {
        // Update existing chest
        chestItems[existingIndex] = itemData
    } else {
        // Add new chest
        chestItems.push(itemData)
    }

    await client.db.update(int.guild.id, { $set: { 'settings.chests.items': chestItems } })
    
    if (existingIndex >= 0) {
        return int.reply(`✅ **Updated chest: ${emoji} ${name}!**\nPrice: **${tools.commafy(price)}** credits\nXP Range: **${tools.commafy(xpMin)}-${tools.commafy(xpMax)}**`)
    } else {
        return int.reply(`✅ **Added new chest: ${emoji} ${name}!**\nPrice: **${tools.commafy(price)}** credits\nXP Range: **${tools.commafy(xpMin)}-${tools.commafy(xpMax)}**`)
    }

}
}
