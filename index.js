const Discord = require("discord.js")
const fs = require("fs")

const config = require("./config.json")

const Tools = require("./classes/Tools.js")
const Model = require("./classes/DatabaseModel.js")

// automatic files: these handle discord status and version number, manage them with the dev commands
const autoPath = "./json/auto/"
if (!fs.existsSync(autoPath)) fs.mkdirSync(autoPath)
if (!fs.existsSync(autoPath + "status.json")) fs.copyFileSync("./json/default_status.json", autoPath + "status.json")
if (!fs.existsSync(autoPath + "version.json")) fs.writeFileSync(autoPath + "version.json", JSON.stringify({ version: "1.0.0", updated: Date.now() }, null, 2))

const rawStatus = require("./json/auto/status.json")
const version = require("./json/auto/version.json")

const startTime = Date.now()

// create client
const client = new Discord.Client({
    allowedMentions: { parse: ["users"] },
    makeCache: Discord.Options.cacheWithLimits({ MessageManager: 0 }),
    intents: [
        Discord.GatewayIntentBits.Guilds,
        Discord.GatewayIntentBits.GuildMessages,
        Discord.GatewayIntentBits.DirectMessages,
        Discord.GatewayIntentBits.GuildVoiceStates,
        Discord.GatewayIntentBits.DirectMessageReactions,
        Discord.GatewayIntentBits.GuildMessageReactions,
        Discord.GatewayIntentBits.GuildPresences,
        Discord.GatewayIntentBits.GuildMembers 
    ],
    partials: [
        Discord.Partials.Channel,
        Discord.Partials.Message,
        Discord.Partials.Reaction
    ],
    failIfNotExists: false,
})

if (!client.shard) {
    console.error("No sharding info found!\nMake sure you start the bot from polaris.js, not index.js")
    return process.exit()
}

client.shard.id = client.shard.ids[0]

client.globalTools = new Tools(client);

// connect to db
client.db = new Model("servers", require("./database_schema.js").schema)

// command files
const dir = "./commands/"
client.commands = new Discord.Collection()
fs.readdirSync(dir).forEach(type => {
    fs.readdirSync(dir + type).filter(x => x.endsWith(".js")).forEach(file => {
        let command = require(dir + type + "/" + file)
        if (!command.metadata) command.metadata = { name: file.split(".js")[0] }
        command.metadata.type = type
        client.commands.set(command.metadata.name, command)
    })
})

client.statusData = rawStatus
client.updateStatus = function() {
    let status = client.statusData
    client.user.setPresence({ activities: status.type ? [{ name: status.name, state: status.state || undefined, type: Discord.ActivityType[status.type], url: status.url }] : [], status: status.status })
}

// when online
client.on("ready", async() => {
    if (client.shard.id == client.shard.count - 1) console.log(`Bot online! (${+process.uptime().toFixed(2)} secs)`)
    client.startupTime = Date.now() - startTime
    client.version = version
    client.application.commands.fetch() // cache slash commands
    .then(cmds => {
        if (cmds.size < 1) { // no commands!! deploy to test server
            console.info("!!! No global commands found, deploying dev commands to test server (Use /deploy global=true to deploy global commands)")
            client.commands.get("deploy").run(client, null, client.globalTools)
        }
    })

    client.updateStatus()
    setInterval(client.updateStatus, 15 * 60000);

    // run the web server
    if (client.shard.id == 0 && config.enableWebServer) require("./web_app.js")(client)
})

// on message
client.on("messageCreate", async message => {
    if (message.system || message.author.bot) return
    else if (!message.guild || !message.member) return // dm stuff
    else {
        client.commands.get("message").run(client, message, client.globalTools)
        // client.commands.get("xpChest").run(client, message, client.globalTools)
        client.commands.get("guildMemberNicknameRank").run(client, message, client.globalTools)
    }
})

// on voice state update
client.on("voiceStateUpdate", async (oldState, newState) => {
    if (!oldState.guild || !oldState.member) return // ignore DM
    client.commands.get("voice").run(client, oldState, newState, client.globalTools)
})

// on interaction
client.on("interactionCreate", async int => {
    
    if (!int.guild) return int.reply("You can't use commands in DMs!")
        
    // for setting changes
    if (int.isStringSelectMenu()) {
        if (int.customId.startsWith("configmenu_")) {
            if (int.customId.split("_")[1] != int.user.id) return int.deferUpdate()
            let configData = int.values[0].split("_").slice(1)
            let configCmd;
            if (configData[0] == "dir") {
                configCmd = "button:settings_list";
            } else if (configData[1] === "confession" && configData[2] === "confession") {
                configCmd = "button:settings_view_confession";
            } else {
                configCmd = "button:settings_view";
            }
            client.commands.get(configCmd).run(client, int, new Tools(client, int), configData)
        }
        return;
    }

    // also for setting changes
    else if (int.isModalSubmit()) {
        if (int.customId.startsWith("configmodal")) {
            let modalData = int.customId.split("~")
            if (modalData[2] != int.user.id) return int.deferUpdate()
            let settingId = modalData[1];
            let configCmd = settingId.startsWith("confession.") ? "button:settings_edit_confession" : "button:settings_edit";
            client.commands.get(configCmd).run(client, int, new Tools(client, int), settingId)
        }
        // Handle confession modal
        else if (int.customId.startsWith("confession-modal")) {
            let modalData = int.customId.split("~")
            if (modalData[1] != int.user.id) return int.deferUpdate()
            client.commands.get("confession_submit").run(client, int, new Tools(client, int))
        }
        // Handle confession settings modal
        else if (int.customId.startsWith("confession_modal")) {
            let modalData = int.customId.split("~").slice(1)
            if (modalData[1] != int.user.id) return int.deferUpdate()
            client.commands.get("confession_modal").run(client, int, new Tools(client, int), modalData)
        }
        return;
    }

    // general commands and buttons
    let foundCommand = client.commands.get(int.isButton() ? `button:${int.customId.split("~")[0]}` : int.commandName)
    if (!foundCommand) return
    else if (foundCommand.metadata.slashEquivalent) foundCommand = client.commands.get(foundCommand.metadata.slashEquivalent)

    let tools = new Tools(client, int)

    // dev perm check
    if (foundCommand.metadata.dev && !tools.isDev()) return tools.warn("Only developers can use this!")
    else if (config.lockBotToDevOnly && !tools.isDev()) return tools.warn("Only developers can use this bot!")

    try { await foundCommand.run(client, int, tools) }
    catch(e) {
        console.error(e);
        try {
            // Use safe reply to handle timeout errors
            if (!int.replied && !int.deferred) {
                await int.reply({ content: "**Error!** " + e.message, ephemeral: true });
            } else if (int.deferred) {
                await int.editReply({ content: "**Error!** " + e.message, ephemeral: true });
            } else {
                await int.followUp({ content: "**Error!** " + e.message, ephemeral: true });
            }
        } catch (replyError) {
            // If the interaction has timed out, we can't reply anymore
            if (replyError.code !== 10062) {
                console.error("Failed to send error message:", replyError);
            }
        }
    }
})

// Add guildMemberRemove event handler
client.on('guildMemberRemove', async member => {
    if (member.user.bot) return
    if (!member.guild) return // dm stuff
    try {
        await client.commands.get('guildMemberRemove').execute(member, client, client.globalTools);
    } catch (error) {
        console.error('Error handling guildMemberRemove event:', error);
    }
});

client.on('error', e => console.warn(e))
client.on('warn', e => console.warn(e))

process.on('uncaughtException', e => console.warn(e))
process.on('unhandledRejection', (e, p) => console.warn(e))

client.login(process.env.DISCORD_TOKEN)