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
            case "rank": cmdName = "rank"; break;
            case "info": cmdName = "info"; break;
            case "lb": cmdName = "leaderboard"; break;
            default: return int.deferUpdate();
        }

        const command = client.commands.get(cmdName)
        if (!command) return int.deferUpdate()

        // Create a fake options object that returns the target member
        const originalGet = int.options.get
        int.options.get = (name) => {
            if (name === "member" || name === "user") {
                return { member: int.guild.members.cache.get(targetId), user: client.users.cache.get(targetId) }
            }
            return originalGet.call(int.options, name)
        }

        // Most of our commands use editReply if deferred, which is good.
        // We should defer update if we haven't already
        if (!int.deferred && !int.replied) await int.deferUpdate()

        return command.run(client, int, tools)
    }
}
