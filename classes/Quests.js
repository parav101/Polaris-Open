// Quest engine — all quest logic lives here.
// Templates are stored per-server in settings.quests.templates (editable from the dashboard).

const VALID_EVENT_TYPES = [
    "message",
    "channel",
    "msgXp",
    "voiceMin",
    "voiceXp",
    "coinflipWin",
    "coinflipWinStreak",
    "coinflipBet",
    "chestOpen",
    "shopBuy",
    "transferOut",
    "streakClaim",
    "bumpClaim",
    "chestDropGrab",
    "confessSubmit",
    "activityTop10",
    "dailyXpHigh",
]

/**
 * Pick a random integer in [min, max] inclusive.
 */
function rngInt(min, max) {
    if (min >= max) return min
    return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Get today's UTC date key "YYYY-MM-DD".
 */
function getTodayKey() {
    return new Date().toISOString().slice(0, 10)
}

/**
 * Returns yesterday's UTC date key.
 */
function getYesterdayKey() {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - 1)
    return d.toISOString().slice(0, 10)
}

/**
 * Pick one random template from the pool for a given tier.
 * Returns null if no eligible template exists for that tier.
 */
function pickTemplate(templates, tier) {
    const pool = (templates || []).filter(t => t.tier === tier && VALID_EVENT_TYPES.includes(t.eventType))
    if (!pool.length) return null
    return pool[rngInt(0, pool.length - 1)]
}

/**
 * Build a fresh active quest from a template + reward settings.
 */
function buildQuest(template, questSettings) {
    const rewardMap = { easy: questSettings.rewardEasy || 50, medium: questSettings.rewardMedium || 150, hard: questSettings.rewardHard || 400 }
    const target = rngInt(template.targetMin || 1, template.targetMax || 1)
    const description = (template.description || "Complete the quest").replace("{target}", target)
    return {
        id:          template.id,
        tier:        template.tier,
        label:       template.label || template.id,
        description,
        eventType:   template.eventType,
        target,
        progress:    0,
        reward:      rewardMap[template.tier] || 50,
        claimed:     false,
    }
}

/**
 * Roll a fresh 3-quest list (1 easy, 1 medium, 1 hard) from settings.quests.templates.
 * If a tier is empty, its slot is omitted.
 */
function rollDailyQuests(settings) {
    const questSettings = settings?.quests || {}
    const templates = questSettings.templates || []
    const list = []
    for (const tier of ["easy", "medium", "hard"]) {
        const tmpl = pickTemplate(templates, tier)
        if (tmpl) list.push(buildQuest(tmpl, questSettings))
    }
    return list
}

/**
 * Ensure userData.quests is initialized and up-to-date for today.
 * Mutates userData in place. Returns true if quests were reset (new day).
 * @param {object} userData  - db.users[userId]
 * @param {object} settings  - db.settings
 * @param {string} todayKey  - "YYYY-MM-DD" (default: today UTC)
 */
function ensureDailyQuests(userData, settings, todayKey) {
    if (!todayKey) todayKey = getTodayKey()

    if (!userData.quests) {
        userData.quests = {
            date: "",
            list: [],
            bonusClaimed: false,
            streak: { count: 0, highest: 0, lastAllDone: "" },
            rerollsUsedToday: 0,
            meta: {},
        }
    }

    const q = userData.quests
    const sameDay = q.date === todayKey
    const hasTemplates = !!(settings?.quests?.templates?.length)

    // If it's the same day AND we already have a rolled list, nothing to do.
    // If the list is empty but templates are now available (e.g. admin added
    // quest templates on the dashboard after the user already hit /quests today),
    // we re-roll for today without touching the streak.
    if (sameDay) {
        if (q.list?.length || !hasTemplates) return false

        q.list = rollDailyQuests(settings)
        q.bonusClaimed = false
        q.meta = {}
        return true
    }

    // --- New day ---
    // Update quest streak: did we complete all quests yesterday?
    const yesterdayKey = getYesterdayKey()
    const allDoneYesterday = q.streak?.lastAllDone === yesterdayKey

    if (!q.streak) q.streak = { count: 0, highest: 0, lastAllDone: "" }
    if (allDoneYesterday) {
        q.streak.count++
        if (q.streak.count > (q.streak.highest || 0)) q.streak.highest = q.streak.count
    } else {
        q.streak.count = 0
    }

    q.date = todayKey
    q.list = rollDailyQuests(settings)
    q.bonusClaimed = false
    q.rerollsUsedToday = 0
    q.meta = {}

    return true
}

/**
 * Increment progress for any matching active quest.
 * Mutates userData.quests.list in place.
 *
 * @param {object} userData   - db.users[userId]
 * @param {string} eventType  - one of VALID_EVENT_TYPES
 * @param {object} payload    - { amount?, channelId? }
 *   amount:    numeric increment for cumulative quests (msgXp, voiceMin, coinflipBet, etc.)
 *   channelId: for "channel" type quests — track unique channels today
 *
 * @returns {Array} quests that just reached their target this tick (for notification purposes)
 */
function tickQuest(userData, eventType, payload = {}) {
    const q = userData.quests
    if (!q?.list?.length) return []

    const justCompleted = []

    for (const quest of q.list) {
        if (quest.claimed) continue
        if (quest.eventType !== eventType) continue
        if (quest.progress >= quest.target) continue // already done

        if (eventType === "channel") {
            // De-duplicate channels — each channel only counts once per day
            if (!q.meta) q.meta = {}
            if (!q.meta.channelsSeen) q.meta.channelsSeen = []
            const channelId = payload.channelId
            if (!channelId) continue
            if (q.meta.channelsSeen.includes(channelId)) continue
            q.meta.channelsSeen.push(channelId)
            quest.progress = Math.min(quest.target, quest.progress + 1)
        } else if (eventType === "coinflipWinStreak") {
            // payload.streak = current win streak value; quest complete when streak >= target
            const streak = payload.streak || 0
            quest.progress = Math.min(quest.target, streak)
        } else {
            // Generic cumulative: add payload.amount (default 1)
            const amount = payload.amount ?? 1
            quest.progress = Math.min(quest.target, quest.progress + amount)
        }

        if (quest.progress >= quest.target) {
            justCompleted.push(quest)
        }
    }

    return justCompleted
}

/**
 * Reroll a quest slot. Deducts rerollCost from userData.credits.
 * Returns { success, reason } where reason is a human-readable string on failure.
 *
 * @param {object} userData
 * @param {object} settings
 * @param {number} slotIndex  - index into userData.quests.list
 */
function rerollQuestSlot(userData, settings, slotIndex) {
    const questSettings = settings?.quests || {}
    const q = userData.quests
    if (!q?.list) return { success: false, reason: "No active quests." }

    const quest = q.list[slotIndex]
    if (!quest) return { success: false, reason: "Invalid quest slot." }
    if (quest.claimed) return { success: false, reason: "That quest is already claimed." }

    const rerollsPerDay = questSettings.rerollsPerDay ?? 1
    const rerollCost = questSettings.rerollCost ?? 100

    if ((q.rerollsUsedToday || 0) >= rerollsPerDay) {
        return { success: false, reason: `You have already used your ${rerollsPerDay} reroll${rerollsPerDay === 1 ? "" : "s"} today.` }
    }

    const credits = userData.credits || 0
    if (credits < rerollCost) {
        return { success: false, reason: `You need **${rerollCost}** credits to reroll (you have **${credits}**).` }
    }

    const templates = questSettings.templates || []
    const tier = quest.tier

    // Pick a different quest if possible
    const tierPool = templates.filter(t => t.tier === tier && VALID_EVENT_TYPES.includes(t.eventType) && t.id !== quest.id)
    const fallbackPool = templates.filter(t => t.tier === tier && VALID_EVENT_TYPES.includes(t.eventType))
    const pool = tierPool.length ? tierPool : fallbackPool

    if (!pool.length) return { success: false, reason: `No other ${tier} quests are available to roll.` }

    const newTemplate = pool[rngInt(0, pool.length - 1)]
    const newQuest = buildQuest(newTemplate, questSettings)

    userData.credits = credits - rerollCost
    q.rerollsUsedToday = (q.rerollsUsedToday || 0) + 1
    q.list[slotIndex] = newQuest

    return { success: true, quest: newQuest, costPaid: rerollCost }
}

/**
 * Compute the 3/3 bonus reward, scaled by the user's quest streak.
 * bonus = rewardBonus * (1 + streakBonusMultiplier * min(streakCount, streakBonusCap))
 */
function computeBonusReward(settings, streakCount) {
    const qs = settings?.quests || {}
    const base = qs.rewardBonus || 300
    const multiplier = qs.streakBonusMultiplier ?? 0.1
    const cap = qs.streakBonusCap ?? 7
    const effectiveStreak = Math.min(streakCount || 0, cap)
    return Math.round(base * (1 + multiplier * effectiveStreak))
}

/**
 * Returns true if all quests in userData.quests.list are completed (progress >= target).
 */
function allQuestsDone(userData) {
    const list = userData.quests?.list
    if (!list?.length) return false
    return list.every(q => q.progress >= q.target)
}

/**
 * Returns true if all quests are claimed.
 */
function allQuestsClaimed(userData) {
    const list = userData.quests?.list
    if (!list?.length) return false
    return list.every(q => q.claimed)
}

module.exports = {
    VALID_EVENT_TYPES,
    getTodayKey,
    rollDailyQuests,
    ensureDailyQuests,
    tickQuest,
    rerollQuestSlot,
    computeBonusReward,
    allQuestsDone,
    allQuestsClaimed,
}
