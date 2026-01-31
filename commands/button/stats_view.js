const Tools = require("../../classes/Tools.js")

module.exports = {
    metadata: {
        name: "button:stats_view",
    },

    async run(client, int, tools) {
        const data = int.customId.split("~")
        const view = data[1]
        const targetId = data[2]

        // Only the person who ran the command or the target can interact? 
        // Actually, let's just let anyone see but the context should be for targetId
        
        // We need to simulate the interaction enough for the commands to work
        // Most commands use int.member or int.options.get("member")
        
        // Let's modify the interaction object temporarily to "trick" the commands
        // or just re-run them with the right context.

        // Get the command to run
        let cmdName = ""
        switch(view) {
            case "progress": cmdName = "stats"; break;
            case "info": cmdName = "info"; break;

            default: return int.deferUpdate();
        }

        const command = client.commands.get(cmdName)
        if (!command) return int.deferUpdate()

        // Create a fake options object that returns the target member
        if (!int.options) {
            int.options = { 
                get: (name) => {
                    if (name === "member" || name === "user") {
                        const member = int.guild.members.cache.get(targetId)
                        return { member: member, user: member?.user || client.users.cache.get(targetId) }
                    }
                    return null
                },
                getUser: (name) => (name === "member" || name === "user") ? (int.guild.members.cache.get(targetId)?.user || client.users.cache.get(targetId)) : null,
                getMember: (name) => (name === "member" || name === "user") ? int.guild.members.cache.get(targetId) : null,
                getString: () => null,
                getInteger: () => null,
                getBoolean: () => null
            }
        } else {
            const originalGet = int.options.get
            int.options.get = (name) => {
                if (name === "member" || name === "user") {
                    const member = int.guild.members.cache.get(targetId)
                    return { member: member, user: member?.user || client.users.cache.get(targetId) }
                }
                return originalGet ? originalGet.call(int.options, name) : null
            }
        }

        // Most of our commands use editReply if deferred, which is good.
        // We should defer update if we haven't already
        if (!int.deferred && !int.replied) await int.deferUpdate()

        return command.run(client, int, tools)
    }
}
