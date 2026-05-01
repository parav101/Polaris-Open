const Discord = require('discord.js')
const path = require('path')
const logger = require("../../classes/Logger.js")

module.exports = {
    metadata: {
        name: "prettyleaderboard",
        description: "View a fancy server leaderboard with customizable layout.",
        args: [
            { type: "string", name: "variant", description: "The layout variant to use", required: false, choices: [
                { name: "Default", value: "default" },
                { name: "Simple", value: "simple" }
            ]}
        ]
    },

    async run(client, int, tools) {
        const cmdStart = Date.now()
        const perfMeta = { command: "prettyleaderboard", guildId: int.guild.id, userId: int.user.id, shardId: client.shard?.id ?? null }
        await int.deferReply()

        try {
            // Fetch settings and sorted stats in parallel
            const settingsPromise = tools.fetchSettings()
            const rankingsPromise = client.userStats.fetchAllSorted(int.guild.id, "xp")

            const fetchStart = Date.now()
            const [settings, allRankings] = await Promise.all([settingsPromise, rankingsPromise])
            logger.perf("prettyleaderboard.fetch", Date.now() - fetchStart, { ...perfMeta, usersCount: allRankings.length, source: "user_stats" })

            if (!allRankings.length) return int.editReply({ content: "Nobody in this server is ranked yet!" })
            if (!settings.settings.enabled) return int.editReply({ content: tools.errors.xpDisabled })
            if (settings.settings.leaderboard.disabled) return int.editReply({ content: "The leaderboard is disabled in this server!" })

            const variant = int.options.getString('variant') || 'default'
            const number = variant === 'default' ? 7 : 10

            let minLeaderboardXP = settings.settings.leaderboard.minLevel > 1
                ? tools.xpForLevel(settings.settings.leaderboard.minLevel, settings.settings)
                : 0

            const sortStart = Date.now()
            let rankings = allRankings
            if (minLeaderboardXP > 0) rankings = rankings.filter(x => x.xp > minLeaderboardXP)
            rankings = rankings.slice(0, number)
            logger.perf("prettyleaderboard.sort", Date.now() - sortStart, { ...perfMeta, resultCount: rankings.length, variant })

            if (!rankings.length) return int.editReply({ content: "Nobody in this server is on the leaderboard yet!" })

            // Fetch Discord member data for display
            const renderStart = Date.now()
            const memberList = await Promise.all(rankings.map(async (user, index) => {
                const member = await int.guild.members.fetch(user.id).catch(() => null)
                if (!member) return null
                return {
                    avatar:       member.user.displayAvatarURL({ forceStatic: true, size: 128 }),
                    username:     member.user.username,
                    displayName:  member.displayName,
                    level:        tools.getLevel(user.xp, settings.settings),
                    xp:           user.xp,
                    rank:         index + 1
                }
            }))

            const validMembers = memberList.filter(m => m !== null)
            const backgroundImagePath = path.resolve(__dirname, '../../app/assets/beautiful-anime-character-cartoon-scene_23-2151035158.jpg')

            const image = await tools.leaderboardBuilder({
                title:           `${int.guild.name} Leaderboard`,
                subtitle:        `Top ${validMembers.length} Members`,
                image:           int.guild.iconURL({ forceStatic: true, size: 128 }),
                memberList:      validMembers,
                variant:         int.options.getString('variant') || 'default',
                backgroundImage: backgroundImagePath,
            })

            await int.editReply({ files: [{ attachment: image, name: 'leaderboard.png' }] })
            logger.perf("prettyleaderboard.render", Date.now() - renderStart, { ...perfMeta, resultCount: validMembers.length, variant })
            logger.perf("prettyleaderboard.total", Date.now() - cmdStart, { ...perfMeta, resultCount: validMembers.length, variant })

        } catch (error) {
            console.error('Leaderboard generation error:', error)
            logger.error("command", {
                msg: "prettyleaderboard failed",
                meta: { ...perfMeta, error: error.message }
            })
            await int.editReply({ content: "Failed to generate the leaderboard image!" })
        }
    }
}
