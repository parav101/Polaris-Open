const Discord = require("discord.js")
const fs = require("fs")

const config = require("./config.json")

const Tools = require("./classes/Tools.js")
const Model = require("./classes/DatabaseModel.js")
const { buildActivityLeaderboard, generateLeaderboardEmbed, isDue, nextAnchorUnix, snapInterval } = require("./classes/ActivityLeaderboard.js")

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

    // activity leaderboard auto-post scheduler (shard 0 only, checks every 1 min for precise timing)
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
                        if (!guild) {
                            // If shard 0 doesn't have it, we might need a cross-shard fetch if the bot is actually sharded.
                            // However, we'll try to fetch from API if not in cache (common for ShardingManager).
                            const fetchedGuild = await client.guilds.fetch(guildId).catch(() => null)
                            if (!fetchedGuild) continue
                            // Use fetched guild
                            processGuildLeaderboard(fetchedGuild, doc)
                        } else {
                            processGuildLeaderboard(guild, doc)
                        }

                        async function processGuildLeaderboard(guild, doc) {
                            const settings = doc.settings?.activityLeaderboard
                            const channel = guild.channels.cache.get(settings.channelId) 
                                || await guild.channels.fetch(settings.channelId).catch(() => null)
                            if (!channel) return

                            const tools = client.globalTools
                            const embed = await generateLeaderboardEmbed(guild, doc, tools, null, true)
                            if (!embed) return

                            await channel.send({ embeds: [embed] }).catch(e => console.error(`[ActivityLB] Failed to post in ${guildId}:`, e.message))

                            // --- Reward Logging ---
                            const logChannelId = settings.rewardLogChannelId
                            const logChannel = logChannelId ? (guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null)) : null

                            // --- Award top user ---
                            const rankings = await buildActivityLeaderboard(guild, doc)
                            const topEntry = rankings[0]
                            const prevTopId = doc.info?.lastTopUserId || ""

                            const topCredits = settings.topCredits || 0
                            const topRoleId  = settings.topRoleId  || ""
                            let rewardGiven = false

                            if (topEntry && (topCredits > 0 || topRoleId)) {
                                const topMember = topEntry.member || await guild.members.fetch(topEntry.id).catch(() => null)

                                // Give credits
                                if (topMember && topCredits > 0) {
                                    const currentCredits = doc.users?.[topEntry.id]?.credits || 0
                                    await client.db.update(guildId, {
                                        $set: { [`users.${topEntry.id}.credits`]: currentCredits + topCredits }
                                    }).exec().catch(() => {})
                                    
                                    if (logChannel) {
                                        await logChannel.send({
                                            embeds: [tools.createEmbed({
                                                title: "Activity Reward: Credits",
                                                description: `**${topMember.user.tag}** has been awarded **${tools.commafy(topCredits)} credits** for being #1 on the activity leaderboard!`,
                                                color: tools.COLOR,
                                                timestamp: true
                                            })]
                                        }).catch(() => {})
                                    }
                                    rewardGiven = true
                                }

                                // Give top role
                                if (topMember && topRoleId) {
                                    const botMember = guild.members.me || await guild.members.fetch(client.user.id).catch(() => null)
                                    if (botMember?.permissions.has("ManageRoles")) {
                                        await topMember.roles.add(topRoleId).catch(() => {})
                                        
                                        if (logChannel) {
                                            await logChannel.send({
                                                embeds: [tools.createEmbed({
                                                    title: "Activity Reward: Role",
                                                    description: `**${topMember.user.tag}** has been given the <@&${topRoleId}> role for being #1 on the activity leaderboard!`,
                                                    color: tools.COLOR,
                                                    timestamp: true
                                                })]
                                            }).catch(() => {})
                                        }
                                        rewardGiven = true
                                    }
                                }
                            }

                            // --- Remove role from previous top user if different ---
                            if (topRoleId && rewardGiven && prevTopId && prevTopId !== topEntry.id) {
                                const prevMember = guild.members.cache.get(prevTopId)
                                    || await guild.members.fetch(prevTopId).catch(() => null)
                                const botMember = guild.members.me || await guild.members.fetch(client.user.id).catch(() => null)
                                if (prevMember && botMember?.permissions.has("ManageRoles")) {
                                    await prevMember.roles.remove(topRoleId).catch(() => {})
                                    
                                    if (logChannel) {
                                        await logChannel.send({
                                            embeds: [tools.createEmbed({
                                                title: "Activity Reward: Role Removed",
                                                description: `<@&${topRoleId}> has been removed from **${prevMember.user.tag}** as they are no longer #1.`,
                                                color: 0xff4444,
                                                timestamp: true
                                            })]
                                        }).catch(() => {})
                                    }
                                }
                            }

                            // --- Update info only (no per-user writes needed) ---
                            // Ensure activityLastPosted is aligned with the interval anchor (UTC midnight relative)
                            const intervalMs = intervalHours * 3600000
                            const currentIntervalStart = (Math.floor(Date.now() / intervalMs) * intervalMs) + (5 * 60 * 1000)
                            
                            await client.db.update(guildId, {
                                $set: {
                                    "info.activityLastPosted": currentIntervalStart,
                                    "info.lastTopUserId": topEntry?.id || ""
                                }
                            }).exec().catch(e => console.error(`[ActivityLB] Info update failed for ${guildId}:`, e.message))
                        }
                    } catch (guildErr) {
                        console.error(`[ActivityLB] Error processing guild ${doc._id}:`, guildErr.message)
                    }
                }
            } catch (err) {
                console.error("[ActivityLB] Scheduler error:", err.message)
            }
        }, 60000)
    }

    // voice xp scheduler (shard 0 only, runs every 5 minutes to distribute voice XP)
    if (client.shard.id == 0) {
        setInterval(async () => {
            try {
                const guilds = await client.db.find({ "settings.enabledVoiceXp": true })
                for (const guildDoc of guilds) {
                    try {
                        const guildId = guildDoc._id
                        const settings = guildDoc.settings
                        if (!settings?.enabledVoiceXp || !guildDoc.voiceSessions?.length) continue

                        const guild = client.guilds.cache.get(guildId) 
                            || await client.guilds.fetch(guildId).catch(() => null)
                        if (!guild) continue

                        const tools = client.globalTools
                        const updates = {}
                        const now = Date.now()

                        // Process each active voice session
                        for (const session of guildDoc.voiceSessions) {
                            try {
                                const userId = session.userId
                                const lastXpTime = session.lastXpTime || session.joinTime
                                const timeSinceLastXp = now - lastXpTime

                                // Only give XP if configured interval has passed
                                if (timeSinceLastXp < (settings.voice.interval * 1000)) continue

                                // Fetch member from guild
                                const member = guild.members.cache.get(userId) 
                                    || await guild.members.fetch(userId).catch(() => null)
                                
                                // Remove session if member not found or not in voice
                                if (!member?.voice?.channel) {
                                    guildDoc.voiceSessions = guildDoc.voiceSessions.filter(s => s.userId !== userId)
                                    continue
                                }

                                // Get user data
                                let userData = guildDoc.users?.[userId] || { xp: 0, cooldown: 0 }

                                // Check cooldown from messages (voice shouldn't bypass message cooldown)
                                if (userData.cooldown > now) continue

                                // Get multiplier based on role and channel
                                const multiplierData = tools.getMultiplier(member, settings, member.voice.channel)
                                if (multiplierData.multiplier <= 0) continue

                                // Apply mute/deaf penalties
                                let statusMultiplier = 1
                                if (member.voice.selfMute) {
                                    statusMultiplier *= settings.voice.mutedMultiplier
                                }
                                if (member.voice.selfDeaf) {
                                    statusMultiplier *= settings.voice.deafMultiplier
                                }

                                // Calculate XP for this interval
                                let xpRange = [settings.gain.min, settings.gain.max].map(x => 
                                    Math.round(x * multiplierData.multiplier)
                                )
                                let xpGained = tools.rng(...xpRange)
                                xpGained = Math.round(settings.voice.multiplier * xpGained * statusMultiplier)

                                if (xpGained > 0) {
                                    const oldXP = userData.xp
                                    const oldLevel = tools.getLevel(oldXP, settings)
                                    
                                    userData.xp += xpGained

                                    // Add to raw activity XP (for activity leaderboard) - remove all multipliers to get raw XP
                                    userData.activityXpAccumulated = (userData.activityXpAccumulated || 0) + (xpGained / (multiplierData.multiplier * settings.voice.multiplier * statusMultiplier))

                                    // Track last XP gain time
                                    userData.lastXpGain = now

                                    // Unhide if hidden
                                    if (userData.hidden) userData.hidden = false

                                    // Check for level up
                                    const newLevel = tools.getLevel(userData.xp, settings)
                                    const levelUp = newLevel > oldLevel

                                    // Auto sync roles on level up
                                    if (levelUp) {
                                        let syncMode = settings.rewardSyncing.sync
                                        if (syncMode == "xp" || syncMode == "level") {
                                            let roleCheck = tools.checkLevelRoles(
                                                guild.roles.cache,
                                                member.roles.cache,
                                                newLevel,
                                                settings.rewards,
                                                null,
                                                oldLevel
                                            )
                                            tools.syncLevelRoles(member, roleCheck).catch(() => {})
                                        }
                                    }

                                    updates[`users.${userId}`] = userData
                                }

                                // Update session's lastXpTime
                                const sessionIndex = guildDoc.voiceSessions.findIndex(s => s.userId === userId)
                                if (sessionIndex >= 0) {
                                    guildDoc.voiceSessions[sessionIndex].lastXpTime = now
                                }
                            } catch (sessionErr) {
                                console.error(`[VoiceXP] Error processing session for user ${session.userId} in guild ${guildId}:`, sessionErr.message)
                            }
                        }

                        // Perform all updates at once
                        if (Object.keys(updates).length > 0 || JSON.stringify(guildDoc.voiceSessions) !== JSON.stringify((await client.db.fetch(guildId))?.voiceSessions || [])) {
                            const updateData = { ...updates, voiceSessions: guildDoc.voiceSessions }
                            const setObj = updates
                            setObj.voiceSessions = guildDoc.voiceSessions
                            await client.db.update(guildId, { $set: setObj }).exec().catch(e => console.error(`[VoiceXP] DB update failed for ${guildId}:`, e.message))
                        }
                    } catch (guildErr) {
                        console.error(`[VoiceXP] Error processing guild ${guildDoc._id}:`, guildErr.message)
                    }
                }
            } catch (err) {
                console.error("[VoiceXP] Scheduler error:", err.message)
            }
        }, 5 * 60000) // Run every 5 minutes
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