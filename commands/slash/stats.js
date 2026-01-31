const Discord = require("discord.js")

module.exports = {
    metadata: {
        name: "stats",
        description: "View your personal XP stats and milestones.",
        args: [
            { type: "user", name: "member", description: "Which member to view", required: false },
            { type: "bool", name: "hidden", description: "Hides the reply so only you can see it", required: false }
        ]
    },

    async run(client, int, tools) {
                // const startTime = Date.now(); // Start timing
        // fetch member
        let member = int.member
        let foundUser = int.options.get("user") || int.options.get("member") // option is "user" if from context menu
        if (foundUser) member = foundUser.member
        if (!member) return tools.warn("That member couldn't be found!")

        // fetch server xp settings
        let db = await tools.fetchSettings(member.id)
        if (!db) return tools.warn("*noData")
        else if (!db.settings.enabled) return tools.warn("*xpDisabled")

        let isHidden = !!int.options.get("hidden")?.value
        if (!int.replied && !int.deferred) await int.deferReply({ ephemeral: isHidden })

        let currentXP = db.users[member.id]

        // if user has no xp, stop here
        if (!currentXP || !currentXP.xp) return tools.noXPYet(foundUser ? foundUser.user : int.user)

        let xp = currentXP.xp
        let levelData = tools.getLevel(xp, db.settings, true)
        let maxLevel = levelData.level >= db.settings.maxLevel
        let levelPercent = maxLevel ? 100 : (xp - levelData.previousLevel) / (levelData.xpRequired - levelData.previousLevel) * 100

        let multiplierData = tools.getMultiplier(member, db.settings)
        let multiplier = multiplierData.multiplier

        // Progress Bar
        let barSize = 25
        let barRepeat = Math.round(levelPercent / (100 / barSize))
        let progressBar = `${"▓".repeat(barRepeat)}${"░".repeat(barSize - barRepeat)} (${!maxLevel ? Number(levelPercent.toFixed(1)) + "%" : "MAX"})`

        // Milestone formatting
        let rewards = (db.settings.rewards || []).sort((a, b) => a.level - b.level)
        let milestoneLines = []
        
        if (rewards.length === 0) {
            milestoneLines.push("_No milestones configured for this server._")
        } else {
            rewards.forEach(r => {
                if (r.level <= 1) return; // Skip Level 1 milestones
                let reached = levelData.level >= r.level
                let desc = r.description ? ` | ${r.description}` : ""
                milestoneLines.push(`${reached ? "<:unlocked:1466817218166788278>" : "<:locked:1466817215918772275>"} **Level ${r.level}**${desc}`)
            })
        }

        let embed = tools.createEmbed({
            author: { 
                name: "Progress Overview", 
                iconURL: member.user.displayAvatarURL({ dynamic: true }) 
            },
            description: `\n\n<:level:1466817213830009045> **Level ${levelData.level}** (${multiplier}x multiplier)\n\n <:info:1466817220687695967> **XP Required for Next Level**\n<:extendedend:1466819484999225579> ${tools.commafy(levelData.xpRequired - xp)} <:userxp:1466822701724340304>\n\n` +
                         `<:progress:1466819928110792816> **Milestones**\n${milestoneLines.join("\n")}\n\n` +
                         `Keep up the activity in VC/Chat to gain XP and unlock new milestones!`,
            thumbnail: member.user.displayAvatarURL({ dynamic: true }),
            color: member.displayColor || tools.COLOR,
        })
        
        // Add back standard stats in fields for quick viewing
        let rank = tools.getRank(member.id, db.users)
        // embed.addFields([
        //     { name: "Level", value: levelData.level.toString(), inline: true },
        //     { name: "Rank", value: `#${rank}`, inline: true },
        //     { name: "Total XP", value: tools.commafy(xp), inline: true }
        // ])

        // Navigation Buttons
        let buttons = tools.button([
            { style: "Success", label: "Progress", customId: `stats_view~progress~${member.id}` },
            { style: "Secondary", label: "Info", customId: `stats_view~info~${member.id}` },
        ])

        // const endTime = Date.now();
        // const executionTime = endTime - startTime;
        // console.log(`Execution time for /stats command: ${executionTime} ms`);

        return int.editReply({ embeds: [embed], components: tools.row(buttons) })
    }
}
