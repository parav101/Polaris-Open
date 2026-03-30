const Discord = require("discord.js")
const schema = require("../../database_schema.js").settingsIDs

module.exports = {
metadata: {
    name: "button:settings_edit",
},

async run(client, int, tools, modal) {

    let buttonData = int.customId.split("~")
    if (!modal && buttonData[2] != int.user.id) return await int.deferUpdate() 

    let settingID = modal || buttonData[1]
    let setting = schema[settingID]
    if (!setting) return tools.warn("Invalid setting!")

    let isBool = setting.type == "bool"
    let isNumber = (setting.type == "int" || setting.type == "float")
    let isString = setting.type == "string"

    if (!modal) {
        if (isNumber) {
            let numModal = new Discord.ModalBuilder()
            .setCustomId(`configmodal~${settingID}~${int.user.id}`)
            .setTitle("Edit setting")
    
            let numOption = new Discord.TextInputBuilder()
            .setLabel("New value")
            .setStyle(Discord.TextInputStyle.Short)
            .setCustomId("configmodal_value")
            .setMaxLength(20)
            .setRequired(true)
            if (!isNaN(setting.min) && !isNaN(setting.max)) numOption.setPlaceholder(`${tools.commafy(setting.min)} - ${tools.commafy(setting.max)}`)
    
            let numRow = new Discord.ActionRowBuilder().addComponents(numOption)
            numModal.addComponents(numRow)
            return int.showModal(numModal);
        }

        if (isString) {
            let strModal = new Discord.ModalBuilder()
            .setCustomId(`configmodal~${settingID}~${int.user.id}`)
            .setTitle("Edit setting")

            let strOption = new Discord.TextInputBuilder()
            .setLabel("New value (leave blank to clear)")
            .setStyle(Discord.TextInputStyle.Short)
            .setCustomId("configmodal_value")
            .setMaxLength(setting.maxlength || 200)
            .setRequired(false)

            if (setting.accept?.includes("discord:channel")) strOption.setPlaceholder("Paste a channel ID (right-click channel → Copy ID)")
            else if (setting.accept?.includes("discord:role")) strOption.setPlaceholder("Paste a role ID (right-click role → Copy ID)")
            else if (setting.default !== undefined && setting.default !== "") strOption.setPlaceholder(`Default: ${setting.default}`)

            let strRow = new Discord.ActionRowBuilder().addComponents(strOption)
            strModal.addComponents(strRow)
            return int.showModal(strModal);
        }
    }

    // Defer immediately for modal submissions
    await int.deferUpdate()

    let db = await tools.fetchSettings()
    if (!db) return tools.warn("*noData")

    let settings = db.settings
    if (!tools.canManageServer(int.member, settings.manualPerms)) return tools.warn("*notMod")

    let newValue;
    let oldValue = tools.getSettingFromID(settingID, settings);

    if (isBool) newValue = !oldValue

    else if (isNumber) {
        let modalVal = int.fields.getTextInputValue("configmodal_value")

        if (modalVal) {
            let num = Number(modalVal)
            if (isNaN(num)) return

            if (setting.type == "int") num = Math.round(num)

            if (!isNaN(setting.min) && num < setting.min) num = setting.min
            else if (!isNaN(setting.max) && num > setting.max) num = setting.max

            newValue = num
        }
    }

    else if (isString) {
        let modalVal = int.fields.getTextInputValue("configmodal_value").trim()
        newValue = modalVal // allow clearing to empty string
    }

    if (newValue === undefined || newValue == oldValue) return

    client.db.update(int.guild.id, { $set: { [`settings.${settingID}`]: newValue, 'info.lastUpdate': Date.now() }}).then(() => {
        client.commands.get("button:settings_view").run(client, int, tools, ["val", null, settingID])
    }).catch(() => tools.warn("Something went wrong while trying to change this setting!"))

}}