// UserStats — per-user stats collection for indexed leaderboard queries.
//
// Collection: user_stats
// One document per (guildId, userId).
//
// This is the new read/write layer introduced in Phase 1 of the leaderboard migration.
// Commands still use the old servers.users path; this layer exists alongside it
// until dual-write (Phase 3) and read cutover (Phase 4) are complete.

const mongoose = require("mongoose")
const logger = require("./Logger.js")

// ─── Schema ───────────────────────────────────────────────────────────────────

const userStatsSchema = new mongoose.Schema({
    guildId:              { type: String, required: true },
    userId:               { type: String, required: true },
    xp:                   { type: Number, default: 0 },
    credits:              { type: Number, default: 0 },
    hidden:               { type: Boolean, default: false },
    streakCurrent:        { type: Number, default: 0 },
    streakHighest:        { type: Number, default: 0 },
    lastClaim:            { type: Number, default: 0 },
    activityXpAccumulated:{ type: Number, default: 0 },
    lastDailyUpdate:      { type: Number, default: 0 },
    coinflipStreak:       { type: Number, default: 0 },
    updatedAt:            { type: Number, default: 0 },
}, {
    collection: "user_stats",
    // Mongoose will use compound _id-less documents; keep auto ObjectId.
})

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Unique identity
userStatsSchema.index({ guildId: 1, userId: 1 }, { unique: true })

// XP leaderboard
userStatsSchema.index({ guildId: 1, hidden: 1, xp: -1 })

// Credit leaderboard
userStatsSchema.index({ guildId: 1, hidden: 1, credits: -1 })

// Current streak leaderboard
userStatsSchema.index({ guildId: 1, hidden: 1, streakCurrent: -1 })

// Highest streak leaderboard
userStatsSchema.index({ guildId: 1, hidden: 1, streakHighest: -1 })

// Activity leaderboard (today's active users by XP earned today)
userStatsSchema.index({ guildId: 1, hidden: 1, lastDailyUpdate: 1, activityXpAccumulated: -1 })

// ─── Model ────────────────────────────────────────────────────────────────────

const UserStatsModel = mongoose.model("UserStats", userStatsSchema)

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Map a raw user object from servers.users[userId] into a user_stats upsert payload.
 * Safe to call from both backfill and dual-write paths.
 *
 * @param {string} guildId
 * @param {string} userId
 * @param {object} user  - raw user object from servers.users map
 * @returns {object} MongoDB $set payload
 */
function buildStatsPayload(guildId, userId, user) {
    return {
        guildId,
        userId,
        xp:                    Number(user.xp)                             || 0,
        credits:               Number(user.credits)                        || 0,
        hidden:                !!user.hidden,
        streakCurrent:         Number(user.streak?.count)                  || 0,
        streakHighest:         Number(user.streak?.highest)                || 0,
        lastClaim:             Number(user.streak?.lastClaim)              || 0,
        activityXpAccumulated: Number(user.activityXpAccumulated)          || 0,
        lastDailyUpdate:       Number(user.lastDailyUpdate)                || 0,
        coinflipStreak:        Number(user.coinflipStreak)                 || 0,
        updatedAt:             Date.now(),
    }
}

/**
 * Upsert a single user's stats into user_stats.
 * Fire-and-forget safe: errors are logged but never thrown to caller.
 *
 * @param {string} guildId
 * @param {string} userId
 * @param {object} partialFields  - only the fields that changed (not the full user object)
 */
async function upsertUserStats(guildId, userId, partialFields) {
    if (!guildId || !userId) return
    try {
        const setPayload = { ...partialFields, guildId, userId, updatedAt: Date.now() }
        await UserStatsModel.findOneAndUpdate(
            { guildId, userId },
            { $set: setPayload },
            { upsert: true, new: false, setDefaultsOnInsert: true }
        )
    } catch (e) {
        logger.warn("userStats.upsert", {
            msg: "upsert failed",
            meta: { guildId, userId, error: e.message }
        })
    }
}

/**
 * Bulk upsert many users from a servers.users map — used by backfill.
 * Processes in configurable batch sizes to avoid hitting Atlas free-tier limits.
 *
 * @param {string} guildId
 * @param {object} usersMap   - servers.users[userId] map
 * @param {number} batchSize
 * @returns {{ inserted: number, errors: number }}
 */
async function bulkUpsertUsers(guildId, usersMap, batchSize = 50) {
    const userEntries = Object.entries(usersMap || {})
    let inserted = 0
    let errors = 0

    for (let i = 0; i < userEntries.length; i += batchSize) {
        const batch = userEntries.slice(i, i + batchSize)
        const ops = batch.map(([userId, user]) => ({
            updateOne: {
                filter: { guildId, userId },
                update: { $set: buildStatsPayload(guildId, userId, user) },
                upsert: true,
            }
        }))

        try {
            await UserStatsModel.bulkWrite(ops, { ordered: false })
            inserted += batch.length
        } catch (e) {
            logger.warn("userStats.bulkUpsert", {
                msg: "batch failed",
                meta: { guildId, batchIndex: i, batchSize: batch.length, error: e.message }
            })
            errors += batch.length
        }
    }

    return { inserted, errors }
}

/**
 * Query the leaderboard from user_stats with index-backed sort.
 * Returns a page of results.
 *
 * @param {string} guildId
 * @param {object} opts
 * @param {string} opts.sortKey        - one of: "xp" | "credits" | "streakCurrent" | "streakHighest" | "activityXpAccumulated"
 * @param {number} [opts.page=1]
 * @param {number} [opts.pageSize=10]
 * @param {boolean} [opts.activeOnly]  - for activity: filter by lastDailyUpdate == today UTC
 * @param {number} [opts.minXp=0]      - for xp leaderboard: minimum xp threshold
 * @returns {{ results: Array, total: number, page: number, pageSize: number }}
 */
async function queryLeaderboard(guildId, opts = {}) {
    const {
        sortKey = "xp",
        page = 1,
        pageSize = 10,
        activeOnly = false,
        minXp = 0,
    } = opts

    const validSortKeys = ["xp", "credits", "streakCurrent", "streakHighest", "activityXpAccumulated"]
    const key = validSortKeys.includes(sortKey) ? sortKey : "xp"

    const filter = { guildId, hidden: { $ne: true } }

    if (key === "xp" && minXp > 0) {
        filter.xp = { $gt: minXp }
    }
    if (key === "credits") {
        filter.credits = { $gt: 0 }
    }
    if (key === "streakCurrent") {
        filter.streakCurrent = { $gt: 0 }
    }
    if (key === "streakHighest") {
        filter.streakHighest = { $gt: 0 }
    }
    if (key === "activityXpAccumulated" || activeOnly) {
        // Activity: only users whose lastDailyUpdate is today (UTC)
        const todayStart = Date.UTC(
            new Date().getUTCFullYear(),
            new Date().getUTCMonth(),
            new Date().getUTCDate()
        )
        filter.lastDailyUpdate = { $gte: todayStart }
        filter.activityXpAccumulated = { $gt: 0 }
    }

    const sortOrder = { [key]: -1 }
    const skip = (Math.max(1, page) - 1) * pageSize

    const [results, total] = await Promise.all([
        UserStatsModel.find(filter, { guildId: 0, __v: 0 })
            .sort(sortOrder)
            .skip(skip)
            .limit(pageSize)
            .lean(),
        UserStatsModel.countDocuments(filter),
    ])

    return { results, total, page, pageSize }
}

/**
 * Count how many users rank above a given user (for getRank equivalent).
 * Returns 1-based rank. Returns 0 if user not found.
 *
 * @param {string} guildId
 * @param {string} userId
 * @param {string} [sortKey="xp"]
 * @returns {number} 1-based rank
 */
async function getUserRank(guildId, userId, sortKey = "xp") {
    const validSortKeys = ["xp", "credits", "streakCurrent", "streakHighest"]
    const key = validSortKeys.includes(sortKey) ? sortKey : "xp"

    const userDoc = await UserStatsModel.findOne({ guildId, userId }, { [key]: 1 }).lean()
    if (!userDoc) return 0

    const userValue = userDoc[key] || 0
    const above = await UserStatsModel.countDocuments({
        guildId,
        hidden: { $ne: true },
        [key]: { $gt: userValue },
    })
    return above + 1
}

/**
 * Dual-write helper: extracts all leaderboard-relevant fields from a full userData
 * object (as stored in servers.users[userId]) and upserts them into user_stats.
 *
 * Fire-and-forget safe — logs timing as "userStats.dualWrite" so you can compare
 * against the old db.fetchAll times in the admin dashboard.
 *
 * @param {string} guildId
 * @param {string} userId
 * @param {object} userData   - full user object from servers.users[userId]
 * @param {string} [source]   - label for the perf log (e.g. "message", "streak", "coinflip")
 */
async function dualWriteFromUserData(guildId, userId, userData, source = "unknown") {
    if (!guildId || !userId || !userData) return
    const started = Date.now()
    await upsertUserStats(guildId, userId, {
        xp:                    Number(userData.xp)                          || 0,
        credits:               Number(userData.credits)                     || 0,
        hidden:                !!userData.hidden,
        streakCurrent:         Number(userData.streak?.count)               || 0,
        streakHighest:         Number(userData.streak?.highest)             || 0,
        lastClaim:             Number(userData.streak?.lastClaim)           || 0,
        activityXpAccumulated: Number(userData.activityXpAccumulated)       || 0,
        lastDailyUpdate:       Number(userData.lastDailyUpdate)             || 0,
        coinflipStreak:        Number(userData.coinflipStreak)              || 0,
    })
    logger.perf("userStats.dualWrite", Date.now() - started, {
        command: "userStats.dualWrite",
        guildId,
        userId,
        meta: { source }
    })
}

/**
 * Partial dual-write: only update specific fields (e.g. just credits after a coinflip).
 * Use when you don't have the full userData object available.
 *
 * @param {string} guildId
 * @param {string} userId
 * @param {object} fields   - only the fields that changed
 * @param {string} [source]
 */
async function dualWritePartial(guildId, userId, fields, source = "unknown") {
    if (!guildId || !userId || !fields) return
    const started = Date.now()
    await upsertUserStats(guildId, userId, fields)
    logger.perf("userStats.dualWrite", Date.now() - started, {
        command: "userStats.dualWrite",
        guildId,
        userId,
        meta: { source }
    })
}

/**
 * Count docs in user_stats for a guild — used by backfill validation.
 */
async function countForGuild(guildId) {
    return UserStatsModel.countDocuments({ guildId })
}

/**
 * Ensure indexes are created in Atlas. Call once at startup.
 * Safe to call repeatedly — createIndexes is idempotent.
 */
async function ensureIndexes() {
    try {
        await UserStatsModel.createIndexes()
        logger.info("userStats", { msg: "Indexes ensured for user_stats collection" })
    } catch (e) {
        logger.warn("userStats", { msg: "Index creation warning", meta: { error: e.message } })
    }
}

module.exports = {
    UserStatsModel,
    buildStatsPayload,
    upsertUserStats,
    bulkUpsertUsers,
    dualWriteFromUserData,
    dualWritePartial,
    queryLeaderboard,
    getUserRank,
    countForGuild,
    ensureIndexes,
}
