const mongoose = require("mongoose")

// Most of the properties below are used for the web server, they are not built into the mongo schema

// type:        the value's data type (bool, int, float, string, collection)
// default:     the default value
// min+max:     for numbers, forces between those values
// precision:   for floats, how many decimal places
// maxlength:   for strings, max length
// accept:      for strings, accepted values. discord:channel and discord:role accept any of those kind of ids

const settings = {
    enabled: { type: "bool", default: false },
    enabledVoiceXp: { type: "bool", default: false },
    resetXpOnLeave: { type: "bool", default: false }, 
    nicknameRank: { type: "bool", default: false }, 

    gain: {
        min: { type: "int", default: 50, min: 0, max: 5000 },
        max: { type: "int", default: 100, min: 0, max: 5000 },
        time: { type: "float", precision: 4, default: 60, min: 0, max: 31536000 },
    },

    voice: {
        multiplier: { type: "float", precision: 2, default: 1, min: 0, max: 1 },
        hoursLimit: { type: "float", precision: 2, default: 1, min: 0, max: 24 },
        interval: { type: "int", default: 300, min: 60, max: 3600 },
        mutedMultiplier: { type: "float", precision: 2, default: 0.5, min: 0, max: 1 },
        deafMultiplier: { type: "float", precision: 2, default: 0.3, min: 0, max: 1 },
    },

    curve: {
        3: { type: "float", precision: 10, default: 1, min: 0, max: 100 },
        2: { type: "float", precision: 10, default: 50, min: 0, max: 10000 },
        1: { type: "float", precision: 10, default: 100, min: 0, max: 100000 },
    },
    rounding: { type: "int", default: 100, min: 1, max: 1000  },
    maxLevel: { type: "int", default: 1000, min: 1, max: 1000  },

    levelUp: {
        enabled: { type: "bool", default: false },
        embed: { type: "bool", default: false },
        rewardRolesOnly: { type: "bool", default: false },
        message: { type: "string", maxlength: 6000, default: "" },
        channel: { type: "string", default: "current", accept: ["dm", "current", "discord:channel"] },
        multiple: { type: "int", default: 1, min: 1, max: 1000 },
        multipleUntil: { type: "int", default: 20, min: 0, max: 1000 },
        emoji: { type: "string", default: "✨" },
        maxRank: { type: "int", default: 100, min: 0, max: 1000 },
    },

    multipliers: {
        roles: { type: "collection", values: {
            id: { type: "string", accept: ["discord:role"] },
            boost: { type: "float", min: 0, max: 100, precision: 4 },
        }},
        rolePriority: { type: "string", default: "largest", accept: ["largest", "smallest", "highest", "add", "combine"] },
        channels: { type: "collection", values: {
            id: { type: "string", accept: ["discord:channel"] },
            boost: { type: "float", min: 0, max: 100, precision: 4 },
        }},
        channelStacking: { type: "string", default: "multiply", accept: ["multiply", "add", "largest", "channel", "role"] }
    },

    rewards: { type: "collection", values: {
        id: { type: "string", accept: ["discord:role"] },
        level: { type: "int", min: 1, max: 1000 },
        description: { type: "string", maxlength: 200, default: "" },
        keep: { type: "bool" },
        noSync: { type: "bool" },
    }},

    rewardSyncing: {
        sync: { type: "string", default: "level", accept: ["level", "xp", "never"] },
        noManual: { type: "bool", default: false },
        noWarning: { type: "bool", default: false }
    },

    leaderboard: {
        disabled: { type: "bool", default: false },
        private: { type: "bool", default: false },
        hideRoles: { type: "bool", default: false },
        maxEntries: { type: "int", default: 0, min: 0, max: 1000000 },
        minLevel: { type: "int", default: 0, min: 0, max: 1000 },
        ephemeral: { type: "bool", default: false },
        embedColor: { type: "int", default: -1, min: -1, max: 0xffffff }
    },

    rankCard: {
        disabled: { type: "bool", default: false },
        relativeLevel: { type: "bool", default: false },
        hideCooldown: { type: "bool", default: false },
        ephemeral: { type: "bool", default: false },
        embedColor: { type: "int", default: -1, min: -1, max: 0xffffff }
    },

    hideMultipliers: { type: "bool", default: false },
    manualPerms: { type: "bool", default: false },

    chestDrops: {
        enabled: { type: "bool", default: false },
        channelId: { type: "string", accept: ["discord:channel"] },
        messageCount: { type: "int", default: 25, min: 1, max: 10000 },
        timeGap: { type: "float", default: 1, min: 0.1, max: 24 },
        chancePercent: { type: "int", default: 40, min: 1, max: 100 },
        preChestMessage: { type: "string", maxlength: 2000, default: "👀 Something shiny is about to drop... Be ready to grab it!" },
        showPreMessage: { type: "bool", default: true },
        preMessageDelay: { type: "float", default: 5, min: 1, max: 15 },
        keyEmoji: { type: "string", default: "🗝️" },
        chestEmoji: { type: "string", default: "📦" },
        emojiId: { type: "string", accept: ["discord:emoji"] },
        chestTypes: { type: "collection", values: {
            type: { type: "string" },
            chance: { type: "int", min: 1, max: 100 },
            xpMin: { type: "int", min: -10000, max: 10000 },
            xpMax: { type: "int", min: -10000, max: 10000 },
            color: { type: "int", min: 0, max: 0xffffff }
        }},
        channelActivity: { type: "collection", values: {
            channelId: { type: "string", accept: ["discord:channel"] },
            messageCount: { type: "int", min: 0 },
            lastChestTime: { type: "int" }
        }}
    },

    xpSteal: {
        enabled: { type: "bool", default: false },
        xpMin: { type: "int", default: 1000, min: 0, max: 10000 },
        xpMax: { type: "int", default: 5000, min: 0, max: 10000 },
        itemId: { type: "string", default: "1361292712967539166" },
        range: { type: "int", default: 3, min: 0, max: 100 },
        immuneRoles: { type: "collection", values: {
            id: { type: "string", accept: ["discord:role"] },
        }, default: [] }
    },

    streak: {
        enabled: { type: "bool", default: false },
        xpPerClaim: { type: "int", default: 100, min: 0, max: 10000 },
        creditsPerClaim: { type: "int", default: 10, min: 0, max: 10000 },
        minStreakForCredits: { type: "int", default: 0, min: 0, max: 1000 },
        milestones: { type: "collection", values: {
            days: { type: "int", min: 1, max: 1000 },
            roleId: { type: "string", accept: ["discord:role"] }
        }, default: [] }
    },

    shop: {
        enabled: { type: "bool", default: false },
        items: { type: "collection", values: {
            roleId: { type: "string", accept: ["discord:role"] },
            name: { type: "string", maxlength: 100 },
            price: { type: "int", min: 0 },
            duration: { type: "float", min: 0 },
            emoji: { type: "string", maxlength: 100 }
        }}
    },

    chests: {
        enabled: { type: "bool", default: false },
        items: { type: "collection", values: {
            name: { type: "string", maxlength: 100 },
            price: { type: "int", min: 0 },
            xpMin: { type: "int", min: 0, max: 1000000 },
            xpMax: { type: "int", min: 0, max: 1000000 },
            emoji: { type: "string", maxlength: 100 }
        }}
    },
    
    coinflip: {
        enabled: { type: "bool", default: false }
    },

    
    confession: {
        enabled: { type: "bool", default: false },
        channelId: { type: "string", accept: ["discord:channel"] },
        anonymous: { type: "bool", default: true },
        cooldown: { type: "int", default: 300, min: 0, max: 86400 },
        logChannelId: { type: "string", accept: ["discord:channel"] },
        maxLength: { type: "int", default: 2000, min: 1, max: 4000 },
        allowImages: { type: "bool", default: false }
    },

    activityLeaderboard: {
        enabled: { type: "bool", default: false },
        channelId: { type: "string", default: "", accept: ["discord:channel"] },
        rewardLogChannelId: { type: "string", default: "", accept: ["discord:channel"] },
        interval: { type: "int", default: 24, min: 4, max: 24, choices: [4, 6, 8, 12, 24] },
        topCredits: { type: "int", default: 0, min: 0 },
        topRoleId: { type: "string", default: "" }
    },

    stats: {
        enabled: { type: "bool", default: false },
        logChannelId: { type: "string", default: "", accept: ["discord:channel"] },
        reportHourUtc: { type: "int", default: 12, min: 0, max: 23 },
        dailyEnabled: { type: "bool", default: true },
        dailyChannelId: { type: "string", default: "", accept: ["discord:channel"] },
        weeklyEnabled: { type: "bool", default: true },
        weeklyChannelId: { type: "string", default: "", accept: ["discord:channel"] },
        monthlyEnabled: { type: "bool", default: false },
        monthlyChannelId: { type: "string", default: "", accept: ["discord:channel"] },
        quarterlyEnabled: { type: "bool", default: false },
        quarterlyChannelId: { type: "string", default: "", accept: ["discord:channel"] },
        activeThresholdDaily: { type: "int", default: 8, min: 1, max: 100000 },
        activeThresholdWeekly: { type: "int", default: 35, min: 1, max: 100000 },
        activeThresholdMonthly: { type: "int", default: 140, min: 1, max: 100000 },
        activeThresholdQuarterly: { type: "int", default: 420, min: 1, max: 100000 }
    },

    bump: {
        enabled: { type: "bool", default: false },
        channelId: { type: "string", default: "1280913100924653608", accept: ["discord:channel"] },
        rewardCredits: { type: "int", default: 5, min: 0, max: 1000000 },
        cooldownSeconds: { type: "int", default: 7200, min: 0, max: 31536000 },
        disboardBotId: { type: "string", default: "302050872383242240" }
    },

    quests: {
        enabled: { type: "bool", default: false },
        rewardEasy: { type: "int", default: 50, min: 0, max: 100000 },
        rewardMedium: { type: "int", default: 150, min: 0, max: 100000 },
        rewardHard: { type: "int", default: 400, min: 0, max: 100000 },
        rewardBonus: { type: "int", default: 300, min: 0, max: 100000 },
        streakBonusMultiplier: { type: "float", precision: 2, default: 0.1, min: 0, max: 5 },
        streakBonusCap: { type: "int", default: 7, min: 0, max: 365 },
        rerollCost: { type: "int", default: 100, min: 0, max: 100000 },
        rerollsPerDay: { type: "int", default: 1, min: 0, max: 10 },
        announceChannelId: { type: "string", default: "", accept: ["discord:channel"] },
        templates: { type: "collection", values: {
            id:          { type: "string", maxlength: 40 },
            tier:        { type: "string", maxlength: 10, accept: ["easy", "medium", "hard"] },
            label:       { type: "string", maxlength: 40 },
            description: { type: "string", maxlength: 120 },
            eventType:   { type: "string", maxlength: 30, accept: [
                "message", "channel", "msgXp", "voiceMin", "voiceXp",
                "coinflipWin", "coinflipWinStreak", "coinflipBet",
                "chestOpen", "shopBuy", "transferOut", "streakClaim",
                "bumpClaim", "chestDropGrab", "confessSubmit",
                "activityTop10", "dailyXpHigh"
            ]},
            targetMin:   { type: "int", min: 1, max: 1000000 },
            targetMax:   { type: "int", min: 1, max: 1000000 }
        }}
    }
}

const settingsArray = []
const settingsObj = {}
const settingsIDs = {}

const schemaTypes = {
    "bool": Boolean,
    "int": Number,
    "float": Number,
    "string": String,
    "collection": [Object]
}

function schemaVal(val) {
    let result = { type: schemaTypes[val.type] }
    if (val.type == "collection") result.default = []
    else if (val.default !== undefined) result.default = val.default
    return result
}

function addToSettingsArray(value, name) {
    let obj = value
    obj.db = name
    settingsArray.push(obj)
    settingsIDs[name] = obj
}

// for settings, create the actual mongo schema
Object.entries(settings).forEach(x => {
    let [key, val] = x
    if (!val.type) {
        let collection = {}
        Object.entries(val).forEach(z => {
            let [innerKey, innerVal] = z
            collection[innerKey] = schemaVal(innerVal)
            addToSettingsArray(innerVal, `${key}.${innerKey}`)
        })
        settingsObj[key] = collection
    }
    else {
        addToSettingsArray(val, key)
        settingsObj[key] = schemaVal(val)
    }
})

const schema = { 
    _id: String,
    users: { type: Object }, // xp, cooldown, hidden. should be validated but it just slows things down
    settings: settingsObj,
    info: {
        lastUpdate: { type: Number, default: 0 },
        activityLastPosted: { type: Number, default: 0 },
        lastTopUserId: { type: String, default: "" },
        statsLastPostedAt: { type: Number, default: 0 },
        statsLastReportKey: { type: String, default: "" },
        statsLastWeeklyReportKey: { type: String, default: "" },
        statsLastMonthlyReportKey: { type: String, default: "" },
        statsLastQuarterlyReportKey: { type: String, default: "" },
        taxCollected: { type: Number, default: 0 },
    },
    statsDaily: { type: Object, default: {} },
    giveaways: [{
        id: String,
        messageId: String,
        channelId: String,
        guildId: String,
        hostId: String,
        baseCredits: Number,
        creditsPerUser: Number,
        maxCredits: Number,
        baseGold: Number,
        goldPerUser: Number,
        maxGold: Number,
        description: String,
        participants: [String],
        endTime: Number,
        minParticipants: Number,
        requiredLevel: Number,
        requiredRoleId: String,
        requiredStreak: Number,
        ended: Boolean,
        currentCredits: Number,
        currentGold: Number,
        winnerId: String,
        winnerIds: [String],
        participantRewardPercent: Number,
        winnerCount: Number,
        winnerMethod: String,
        cancelled: Boolean,
        rerollable: { type: Boolean, default: true }, // Track if giveaway can be rerolled
        rerollCount: { type: Number, default: 0 },   // Track how many times it's been rerolled
        previousWinners: [[String]],                 // Track previous winners for reference
        createdAt: Number
    }],
    voiceSessions: [{
        userId: String,
        joinTime: Number,
        lastXpTime: Number,
        shardId: Number
    }]
}

const finalSchema = new mongoose.Schema(schema)

module.exports = {
    settings, settingsArray, settingsIDs, schema: finalSchema
}