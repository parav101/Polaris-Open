const Tools = require("../../classes/Tools.js");
const voice = require("../events/voice.js");
let tools = Tools.global

// Define the two formulas
function newFormula(level) {
    if (level === 0) return 0;
    return 100 + 50 * (level - 1) ** 2;
}

function alternativeFormula(level) {
    return 2 * level ** 3 + 50 * level ** 2 + 100;
}

module.exports = {
    async run(client, serverID, importSettings = {}, jsonData) {
        let details = []
        let newData = {}
        let importedUsers = 0
        if (jsonData) {
            for (let i = 0; i < jsonData.levels.length; i++) {
                let user = jsonData.levels[i]
                importedUsers++
                const newXp = alternativeFormula(user.level)
                let obj = { xp: newXp, cooldown:0, voiceTime:0 }
                newData[`users.${user.userId}`] = obj
            }
            details.push(`${tools.commafy(importedUsers)} user${importedUsers == 1 ? "" : "s"}`)
        }
        if (!details.length) return { error: `No JSON data found! Syntax is { users: {...} }, settings: {...} }` }
        return { data: newData, details }
    }

}