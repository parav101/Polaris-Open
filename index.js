const Discord = require("discord.js")
const fs = require("fs")

const config = require("./config.json")

const Tools = require("./classes/Tools.js")
const Model = require("./classes/DatabaseModel.js")
const { buildActivityLeaderboard, isDue, nextAnchorUnix, snapInterval } = require("./classes/ActivityLeaderboard.js")

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
        Discord.GatewayIntentBits.GuildMembers,
        Discord.GatewayIntentBits.MessageContent
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

    // activity leaderboard auto-post scheduler (shard 0 only, checks every 30 min)
    if (client.shard.id == 0) {
        setInterval(async () => {
            try {
                const guilds = await client.db.find({ "settings.activityLeaderboard.enabled": true })
                for (const doc of guilds) {
                    try {
                        const guildId = doc._id
                        const settings = doc.settings?.activityLeaderboard
                        if (!settings?.enabled || !settings.channelId) continue

                        const intervalHours = snapInterval(settings.interval || 24)
                        const lastPosted = doc.info?.activityLastPosted || 0

                        if (!isDue(Date.now(), lastPosted, intervalHours)) continue

                        const guild = client.guilds.cache.get(guildId)
                        if (!guild) continue // guild is on another shard or unavailable

                        const channel = guild.channels.cache.get(settings.channelId)
                        if (!channel) continue

                        const rankings = await buildActivityLeaderboard(guild, doc)

                        // --- Build and post the embed ---
                        const tools = client.globalTools
                        const RANK_EMOJIS = [
                            "<:1_:1477998075535429713>",
                            "<:2_:1477998064756326471>",
                            "<:3_:1477998056224985190>",
                            "<:4_:1477998060780126270>",
                            "<:5_:1477998058175205523>",
                            "<:6_:1477998062914895925>",
                            "<:7_:1477998069587902566>",
                            "<:8_:1477998071508893756>",
                            "<:9_:1477998073413111979>",
                        ]
                        const nextPost = nextAnchorUnix(Date.now(), intervalHours)
                        const _d = new Date()
                        const nextMidnight = Math.floor(Date.UTC(_d.getUTCFullYear(), _d.getUTCMonth(), _d.getUTCDate() + 1) / 1000)

                        const postLine = `\n\n<:progress:1466819928110792816> Next reward <t:${nextPost}:R>\n<:userxp:1466822701724340304> XP resets <t:${nextMidnight}:R>`
                        const topEntry = rankings[0]
                        let winnerLine = ""
                        if (topEntry && (topCredits > 0 || topRoleId)) {
                            winnerLine = `\n\n<:star:1475076863809294397> <@${topEntry.id}> wins this interval's reward!`
                        }
                        let description
                        if (!rankings.length) {
                            description = "<:info:1466817220687695967> No activity recorded this interval." + postLine
                        } else {
                            description = rankings.map((entry, i) =>
                                `${RANK_EMOJIS[i]} <@${entry.id}> — **${tools.commafy(entry.activityXP)}** Daily XP`
                            ).join("\n") + winnerLine + postLine
                        }

                        const embed = tools.createEmbed({
                            color: tools.COLOR,
                            author: {
                                name: `Activity Leaderboard — ${guild.name}`,
                                iconURL: guild.iconURL()
                            },
                            description
                        })

                        const topCredits = settings.topCredits || 0
                        const topRoleId  = settings.topRoleId  || ""
                        if (topCredits > 0 || topRoleId) {
                            const rewardParts = []
                            if (topCredits > 0) rewardParts.push(`<:extendedend:1466819484999225579><:gold:1472934905972527285> **${tools.commafy(topCredits)}** credits`)
                            if (topRoleId)      rewardParts.push(`<:extendedend:1466819484999225579><@&${topRoleId}>`)
                            embed.addFields([{ name: "<:star:1475076863809294397> Top User Reward", value: rewardParts.join("  ·  "), inline: false }])
                        }

                        await channel.send({ embeds: [embed] }).catch(e => console.error(`[ActivityLB] Failed to post in ${guildId}:`, e.message))

                        // --- Award top user ---
                        const prevTopId = doc.info?.lastTopUserId || ""

                        if (topEntry && (topCredits > 0 || topRoleId)) {
                            const topMember = topEntry.member || await guild.members.fetch(topEntry.id).catch(() => null)

                            // Give credits
                            if (topMember && topCredits > 0) {
                                const currentCredits = doc.users?.[topEntry.id]?.credits || 0
                                await client.db.update(guildId, {
                                    $set: { [`users.${topEntry.id}.credits`]: currentCredits + topCredits }
                                }).exec().catch(() => {})
                            }

                            // Give top role
                            if (topMember && topRoleId) {
                                if (guild.members.me?.permissions.has("ManageRoles")) {
                                    await topMember.roles.add(topRoleId).catch(() => {})
                                }
                            }
                        }

                        // --- Remove role from previous top user if different ---
                        if (topRoleId && prevTopId && prevTopId !== topEntry?.id) {
                            const prevMember = guild.members.cache.get(prevTopId)
                                || await guild.members.fetch(prevTopId).catch(() => null)
                            if (prevMember && guild.members.me?.permissions.has("ManageRoles")) {
                                await prevMember.roles.remove(topRoleId).catch(() => {})
                            }
                        }

                        // --- Update info only (no per-user writes needed) ---
                        await client.db.update(guildId, {
                            $set: {
                                "info.activityLastPosted": Date.now(),
                                "info.lastTopUserId": topEntry?.id || ""
                            }
                        }).exec().catch(e => console.error(`[ActivityLB] Info update failed for ${guildId}:`, e.message))

                    } catch (guildErr) {
                        console.error(`[ActivityLB] Error processing guild ${doc._id}:`, guildErr.message)
                    }
                }
            } catch (err) {
                console.error("[ActivityLB] Scheduler error:", err.message)
            }
        }, 30 * 60000)
    }

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