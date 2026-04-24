<script>
	// @ts-nocheck
	import { onMount, tick } from 'svelte'
	import { page } from '$app/stores'
	import { apiFetch, loginButton } from '$lib/api.js'
	import { xpForLevel, getLevel, commafy, timeStr, roleColor } from '$lib/xpMath.js'
	import { Zap, Award, TrendingUp, Layers, CreditCard, Trophy, Database, Package, Shuffle, Flame, MessageSquare, Activity, Settings, Home, Scroll, ShoppingCart, Box, Coins, BarChart2, ArrowUpCircle } from 'lucide-svelte'

	const guildID = $page.params.id

	// ── state ──────────────────────────────────────────────────────────────────
	let loading = true
	let loadError = null
	let guild = null
	let roles = []
	let channels = []
	let otherServers = []
	let curvePresets = []

	/** Mirror of db.settings – mutations here drive all inputs */
	let s = {}
	let lastSaved = {}      // deep copy of s for dirty-checking
	let lastSavedTables = {} // deep copy of dynamic tables for dirty-checking

	let activeCategory = 'server'
	let saving = false
	let saveError = null
	let saveSuccess = false

	// Dynamic tables (maintained as local arrays, included in save payload)
	let rewards = []
	let roleMultipliers = []
	let channelMultipliers = []
	let streakMilestones = []
	let immuneRoles = []
	let questTemplates = []
	let shopItems = []
	let chestItems = []
	let chestTypes = []
	let lastUpdated = 0

	// Shop editor state
	let newShopRoleId = ''
	let newShopName = ''
	let newShopPrice = 0
	let newShopDuration = 0
	let newShopEmoji = ''
	let editingShopIndex = -1
	let editingShopData = {}

	// Chest editor state
	let newChestName = ''
	let newChestPrice = 0
	let newChestXpMin = 0
	let newChestXpMax = 100
	let newChestEmoji = ''
	let editingChestIndex = -1
	let editingChestData = {}

	// Chest type (chestDrops tier) editor state
	let newChestTypeName = ''
	let newChestTypeChance = 25
	let newChestTypeXpMin = 50
	let newChestTypeXpMax = 200
	let newChestTypeColor = '#00ff80'
	let editingChestTypeIndex = -1
	let editingChestTypeData = {}

	// Quest editor state
	const VALID_EVENT_TYPES = [
		"message", "channel", "msgXp", "voiceMin", "voiceXp",
		"coinflipWin", "coinflipWinStreak", "coinflipBet",
		"chestOpen", "shopBuy", "transferOut", "streakClaim",
		"bumpClaim", "chestDropGrab", "confessSubmit",
		"activityTop10", "dailyXpHigh"
	]
	const EVENT_TYPE_LABELS = {
		message: "Send messages", channel: "Chat in channels", msgXp: "Earn message XP",
		voiceMin: "Minutes in voice", voiceXp: "Earn voice XP",
		coinflipWin: "Win coinflips", coinflipWinStreak: "Win coinflips in a row", coinflipBet: "Bet credits on coinflips",
		chestOpen: "Open chests", shopBuy: "Buy from shop", transferOut: "Transfer credits",
		streakClaim: "Claim daily streak", bumpClaim: "Claim bump reward",
		chestDropGrab: "Grab XP chest drop", confessSubmit: "Submit a confession",
		activityTop10: "Land in top 10 activity LB", dailyXpHigh: "New daily XP high"
	}
	let questPresets = {}
	let selectedQuestPreset = ''
	let showPresetConfirm = false
	let newQuestTier = 'easy'
	let newQuestId = ''
	let newQuestLabel = ''
	let newQuestDescription = ''
	let newQuestEventType = 'message'
	let newQuestTargetMin = 1
	let newQuestTargetMax = 10
	let editingQuestIndex = -1
	let editingQuestData = {}

	// UI sub-state
	let curveNumbers = [1, 2, 3, 4, 5, 7, 10, 25, 50, 100, 200]
	let showFullCurvePreview = false
	let lvlMessageMode = 'text'   // 'text' | 'embed'
	let useCustomRankColor = false
	let useCustomTopColor = false
	let selectedPreset = null
	let presetList = []

	// Multiplier descriptions
	const roleMultDesc = {
		largest: 'If you have 0.5x and 2.0x role multipliers, 2.0x will be picked.',
		smallest: 'If you have 0.5x and 2.0x role multipliers, 0.5x will be picked.',
		highest: 'If you have multiple role multipliers, the highest listed role will be picked.',
		add: 'If you have 1.5x, 2.0x, and 0.75x role multipliers, they will be summed to 2.25x.',
		combine: 'If you have 2.0x and 3.0x role multipliers, they will be multiplied to 6.0x. Scales absurdly fast.'
	}
	const channelMultDesc = {
		multiply: 'If your role is 2.0x and the channel is 3.0x, final multiplier is 6.0x.',
		add: 'If your role is 2.0x and the channel is 1.5x, they will be summed to 2.5x.',
		largest: 'If your role is 2.0x and the channel is 1.5x, 2.0x will be picked.',
		channel: 'If the channel has any multiplier (including 1.0x), always use it instead of the role.',
		role: 'If you have any role multiplier (including 1.0x), always use it instead of the channel.'
	}

	// Sidebar categories
	const categories = [
		{ id: 'server', label: 'Home', icon: null },
		{ id: 'xp', label: 'XP gain', icon: Zap },
		{ id: 'rewardroles', label: 'Reward roles', icon: Award },
		{ id: 'levelup', label: 'Level up message', icon: TrendingUp },
		{ id: 'multipliers', label: 'Multipliers', icon: Layers },
		{ id: 'rankcard', label: 'Rank card', icon: CreditCard },
		{ id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
		{ id: 'data', label: 'Data', icon: Database },
		{ id: 'chestDrops', label: 'XP Chest', icon: Package },
		{ id: 'xpSteal', label: 'XP Steal', icon: Shuffle },
		{ id: 'streak', label: 'Streaks', icon: Flame },
		{ id: 'confession', label: 'Confessions', icon: MessageSquare },
		{ id: 'activityleaderboard', label: 'Activity LB', icon: Activity },
		{ id: 'quests', label: 'Daily Quests', icon: Scroll },
		{ id: 'shop', label: 'Shop', icon: ShoppingCart },
		{ id: 'chests', label: 'Chests', icon: Box },
		{ id: 'coinflip', label: 'Coinflip', icon: Coins },
		{ id: 'bump', label: 'Bump Rewards', icon: ArrowUpCircle },
		{ id: 'stats', label: 'Server Stats', icon: BarChart2 },
		{ id: 'advanced', label: 'Advanced', icon: Settings }
	]

	// ── helpers ────────────────────────────────────────────────────────────────
	let loaded = false
	$: dirty = loaded && (
		JSON.stringify(s) !== JSON.stringify(lastSaved)
		|| JSON.stringify({ rewards, roleMultipliers, channelMultipliers, streakMilestones, immuneRoles, questTemplates, shopItems, chestItems, chestTypes })
		   !== JSON.stringify(lastSavedTables)
	)

	function snapshotLastSaved() {
		lastSaved = JSON.parse(JSON.stringify(s))
		lastSavedTables = JSON.parse(JSON.stringify({ rewards, roleMultipliers, channelMultipliers, streakMilestones, immuneRoles, questTemplates, shopItems, chestItems, chestTypes }))
	}

	function roleName(id) {
		return roles.find(r => r.id === id)?.name || `Unknown (${id})`
	}

	function getRoleColor(id) {
		const r = roles.find(x => x.id === id)
		return roleColor(r?.color || 0)
	}

	function channelName(id) {
		return channels.find(c => c.id === id)?.name || `Unknown (${id})`
	}

	function getCurveDifficulty(curve) {
		const x = 75
		const d2 = 6 * (curve[3] || 0) * x + 2 * (curve[2] || 0)
		return d2 < 0 ? 'Easiest' : d2 < 300 ? 'Easy' : d2 < 1000 ? 'Medium' : d2 < 3000 ? 'Hard' : 'Hardest'
	}

	function getXPForLevel(lvl, curve, rounding) {
		const raw = (curve[3] || 0) * lvl ** 3 + (curve[2] || 0) * lvl ** 2 + (curve[1] || 0) * lvl
		const r = rounding > 1 ? rounding : 1
		return r > 1 ? r * Math.round(raw / r) : raw
	}

	function getAvgMsgs(min, max, xp) {
		const avg = (max - min) / 2 + min || 1
		return avg > 0 ? Math.ceil(xp / avg) : 0
	}

	$: curveTableRows = buildCurveRows(curveNumbers, s.curve, s.rounding, s.gain?.min, s.gain?.max, s.gain?.time)
	$: fullCurveRows = showFullCurvePreview ? buildCurveRows(Array.from({ length: 500 }, (_, i) => i + 1), s.curve, s.rounding, s.gain?.min, s.gain?.max, s.gain?.time, true) : []
	$: curveDifficulty = s.curve ? getCurveDifficulty(s.curve) : ''

	function buildCurveRows(levels, curve, rounding, min, max, time, extra = false) {
		if (!curve) return []
		return levels.map(lvl => {
			const xp = getXPForLevel(lvl, curve, rounding)
			const prev = getXPForLevel(lvl - 1, curve, rounding)
			const rel = Math.max(0, Math.round(xp - prev))
			const msgs = getAvgMsgs(min, max, rel)
			const cumMsgs = getAvgMsgs(min, max, xp)
			const apx = min === max ? '' : '~ '
			return { lvl, xp, rel, msgs, cumMsgs, time: msgs * time, cumTime: cumMsgs * time, apx, extra }
		})
	}

	// ── reward roles ───────────────────────────────────────────────────────────
	let newRewardRole = ''
	let newRewardLevel = 1

	function addRewardRole() {
		if (!newRewardRole || rewards.find(r => r.id === newRewardRole)) return
		const level = Math.max(1, +newRewardLevel || 1)
		rewards = [...rewards, { id: newRewardRole, level, noSync: false }].sort((a, b) => a.level - b.level)
		newRewardRole = ''
	}

	function removeRewardRole(id) {
		rewards = rewards.filter(r => r.id !== id)
	}

	// ── role multipliers ───────────────────────────────────────────────────────
	let newRoleMultRole = ''
	let newRoleMultAmount = 2

	function addRoleMultiplier() {
		if (!newRoleMultRole || roleMultipliers.find(r => r.id === newRoleMultRole)) return
		roleMultipliers = [...roleMultipliers, { id: newRoleMultRole, boost: +newRoleMultAmount }]
		newRoleMultRole = ''
	}

	function removeRoleMultiplier(id) {
		roleMultipliers = roleMultipliers.filter(r => r.id !== id)
	}

	// ── channel multipliers ────────────────────────────────────────────────────
	let newChanMultChan = ''
	let newChanMultAmount = 2

	function addChannelMultiplier() {
		if (!newChanMultChan || channelMultipliers.find(c => c.id === newChanMultChan)) return
		channelMultipliers = [...channelMultipliers, { id: newChanMultChan, boost: +newChanMultAmount }]
		newChanMultChan = ''
	}

	function removeChannelMultiplier(id) {
		channelMultipliers = channelMultipliers.filter(c => c.id !== id)
	}

	// ── streak milestones ──────────────────────────────────────────────────────
	let newMilestoneRole = ''
	let newMilestoneDays = 7

	function addStreakMilestone() {
		if (!newMilestoneRole) return
		streakMilestones = [...streakMilestones, { roleId: newMilestoneRole, days: +newMilestoneDays }].sort((a, b) => a.days - b.days)
		newMilestoneRole = ''
	}

	function removeMilestone(roleId, days) {
		streakMilestones = streakMilestones.filter(m => !(m.roleId === roleId && m.days === days))
	}

	// ── immune roles ───────────────────────────────────────────────────────────
	let newImmuneRole = ''

	function addImmuneRole() {
		if (!newImmuneRole || immuneRoles.find(r => r.id === newImmuneRole)) return
		immuneRoles = [...immuneRoles, { id: newImmuneRole }]
		newImmuneRole = ''
	}

	function removeImmuneRole(id) {
		immuneRoles = immuneRoles.filter(r => r.id !== id)
	}

	// ── quest template editor ──────────────────────────────────────────────────
	function addQuestTemplate() {
		const id = newQuestId.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
		if (!id || !newQuestLabel.trim() || !newQuestDescription.trim()) return alert('ID, label and description are required.')
		if (questTemplates.find(t => t.id === id)) return alert(`A quest with id "${id}" already exists.`)
		const tMin = Math.max(1, +newQuestTargetMin)
		const tMax = Math.max(tMin, +newQuestTargetMax)
		questTemplates = [...questTemplates, { id, tier: newQuestTier, label: newQuestLabel.trim(), description: newQuestDescription.trim(), eventType: newQuestEventType, targetMin: tMin, targetMax: tMax }]
		newQuestId = ''; newQuestLabel = ''; newQuestDescription = ''
	}

	function removeQuestTemplate(id) {
		questTemplates = questTemplates.filter(t => t.id !== id)
		if (editingQuestIndex >= 0 && questTemplates[editingQuestIndex]?.id !== id) editingQuestIndex = -1
	}

	function startEditQuest(index) {
		editingQuestIndex = index
		editingQuestData = { ...questTemplates[index] }
	}

	function saveEditQuest() {
		const updated = { ...editingQuestData }
		updated.id = updated.id.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
		updated.targetMin = Math.max(1, +updated.targetMin)
		updated.targetMax = Math.max(updated.targetMin, +updated.targetMax)
		questTemplates = questTemplates.map((t, i) => i === editingQuestIndex ? updated : t)
		editingQuestIndex = -1
	}

	function loadQuestPreset() {
		const preset = questPresets[selectedQuestPreset]
		if (!preset) return
		if (!confirm(`Load "${preset.name}" preset? This will replace the current quest pool.`)) return
		questTemplates = JSON.parse(JSON.stringify(preset.templates))
		showPresetConfirm = false
	}

	function rollQuestPreview(templates, questSettings) {
		const tiers = ['easy', 'medium', 'hard']
		const rewards = { easy: questSettings?.rewardEasy || 50, medium: questSettings?.rewardMedium || 150, hard: questSettings?.rewardHard || 400 }
		return tiers.map(tier => {
			const pool = templates.filter(t => t.tier === tier)
			if (!pool.length) return null
			const tmpl = pool[Math.floor(Math.random() * pool.length)]
			const target = tmpl.targetMin === tmpl.targetMax ? tmpl.targetMin : Math.floor(Math.random() * (tmpl.targetMax - tmpl.targetMin + 1)) + tmpl.targetMin
			return { tier, label: tmpl.label, description: tmpl.description.replace('{target}', target), reward: rewards[tier] }
		}).filter(Boolean)
	}

	// ── shop item editor ──────────────────────────────────────────────────────
	function addShopItem() {
		if (!newShopName.trim()) return alert('Name is required.')
		if (!newShopRoleId) return alert('Please select a role.')
		const price = Math.max(0, +newShopPrice)
		const duration = Math.max(0, +newShopDuration)
		shopItems = [...shopItems, { roleId: newShopRoleId, name: newShopName.trim(), price, duration, emoji: newShopEmoji.trim() }]
		newShopRoleId = ''; newShopName = ''; newShopPrice = 0; newShopDuration = 0; newShopEmoji = ''
	}

	function removeShopItem(index) {
		shopItems = shopItems.filter((_, i) => i !== index)
		if (editingShopIndex === index) editingShopIndex = -1
	}

	function startEditShop(index) {
		editingShopIndex = index
		editingShopData = { ...shopItems[index] }
	}

	function saveEditShop() {
		const updated = { ...editingShopData }
		updated.name = updated.name?.trim() || ''
		updated.emoji = updated.emoji?.trim() || ''
		updated.price = Math.max(0, +updated.price)
		updated.duration = Math.max(0, +updated.duration)
		shopItems = shopItems.map((item, i) => i === editingShopIndex ? updated : item)
		editingShopIndex = -1
	}

	// ── chest item editor ──────────────────────────────────────────────────────
	function addChestItem() {
		if (!newChestName.trim()) return alert('Name is required.')
		const price = Math.max(0, +newChestPrice)
		const xpMin = Math.max(0, +newChestXpMin)
		const xpMax = Math.max(xpMin, +newChestXpMax)
		chestItems = [...chestItems, { name: newChestName.trim(), price, xpMin, xpMax, emoji: newChestEmoji.trim() }]
		newChestName = ''; newChestPrice = 0; newChestXpMin = 0; newChestXpMax = 100; newChestEmoji = ''
	}

	function removeChestItem(index) {
		chestItems = chestItems.filter((_, i) => i !== index)
		if (editingChestIndex === index) editingChestIndex = -1
	}

	function startEditChest(index) {
		editingChestIndex = index
		editingChestData = { ...chestItems[index] }
	}

	function saveEditChest() {
		const updated = { ...editingChestData }
		updated.name = updated.name?.trim() || ''
		updated.emoji = updated.emoji?.trim() || ''
		updated.price = Math.max(0, +updated.price)
		updated.xpMin = Math.max(0, +updated.xpMin)
		updated.xpMax = Math.max(updated.xpMin, +updated.xpMax)
		chestItems = chestItems.map((item, i) => i === editingChestIndex ? updated : item)
		editingChestIndex = -1
	}

	// ── level up message ───────────────────────────────────────────────────────
	let lvlTextContent = ''
	let lvlEmbedContent = ''

	let roleVariables = false
	$: if (typeof s.levelUp?.rewardRolesOnly !== 'undefined') roleVariables = s.levelUp.rewardRolesOnly

	// ── color pickers ──────────────────────────────────────────────────────────
	let rankEmbedColor = '#00ff80'
	let topEmbedColor = '#00ff80'

	function syncColorInput(e, target) {
		const val = e.currentTarget.value
		if (/^#[0-9a-fA-F]{6}$/.test(val)) {
			if (target === 'rank') rankEmbedColor = val
			else topEmbedColor = val
		}
	}

	// ── save ───────────────────────────────────────────────────────────────────
	async function save() {
		if (saving) return
		saving = true
		saveError = null

		// Check min/max
		if (s.gain && +s.gain.min > +s.gain.max) {
			const tmp = s.gain.min; s.gain.min = s.gain.max; s.gain.max = tmp
		}

		// Build payload — only changed primitive settings
		const payload = {}
		function setIfChanged(key, val) {
			if (JSON.stringify(lastSaved[key]) !== JSON.stringify(val)) payload[key] = val
		}

		// Flatten settings into dotpath keys for comparison
		// The server endpoint accepts the full settings object so just send all
		Object.assign(payload, {
			enabled: s.enabled,
			enabledVoiceXp: s.enabledVoiceXp,
			'gain.min': +s.gain.min,
			'gain.max': +s.gain.max,
			'gain.time': +s.gain.time,
			'voice.multiplier': +s.voice?.multiplier,
			'voice.hoursLimit': +s.voice?.hoursLimit,
			'voice.mutedMultiplier': +s.voice?.mutedMultiplier,
			'voice.deafMultiplier': +s.voice?.deafMultiplier,
			'voice.interval': +s.voice?.interval,
			'curve.1': +(s.curve?.[1] || 0),
			'curve.2': +(s.curve?.[2] || 0),
			'curve.3': +(s.curve?.[3] || 0),
			rounding: +s.rounding,
			maxLevel: +s.maxLevel,
			'levelUp.enabled': s.levelUp?.enabled,
			'levelUp.channel': s.levelUp?.channel || 'current',
			'levelUp.embed': s.levelUp?.embed,
			'levelUp.message': s.levelUp?.embed ? lvlEmbedContent : lvlTextContent,
			'levelUp.emoji': s.levelUp?.emoji,
			'levelUp.multiple': +s.levelUp?.multiple,
			'levelUp.multipleUntil': +s.levelUp?.multipleUntil,
			'levelUp.rewardRolesOnly': s.levelUp?.rewardRolesOnly,
			'rankCard.disabled': s.rankCard?.disabled,
			'rankCard.hideCooldown': s.rankCard?.hideCooldown,
			'rankCard.ephemeral': s.rankCard?.ephemeral,
			'rankCard.relativeLevel': s.rankCard?.relativeLevel,
			'rankCard.embedColor': useCustomRankColor ? parseInt(rankEmbedColor.replace('#', ''), 16) : -1,
			'leaderboard.disabled': s.leaderboard?.disabled,
			'leaderboard.ephemeral': s.leaderboard?.ephemeral,
			'leaderboard.hideRoles': s.leaderboard?.hideRoles,
			'leaderboard.minLevel': +s.leaderboard?.minLevel,
			'leaderboard.maxEntries': +s.leaderboard?.maxEntries,
			'leaderboard.private': s.leaderboard?.private,
			'leaderboard.embedColor': useCustomTopColor ? parseInt(topEmbedColor.replace('#', ''), 16) : -1,
			'multipliers.rolePriority': s.multipliers?.rolePriority,
			'multipliers.channelStacking': s.multipliers?.channelStacking,
			'multipliers.roles': roleMultipliers,
			'multipliers.channels': channelMultipliers,
			'hideMultipliers': s.hideMultipliers,
			rewards: rewards,
			'chestDrops.enabled': s.chestDrops?.enabled,
			'chestDrops.channelId': s.chestDrops?.channelId,
			'chestDrops.messageCount': +s.chestDrops?.messageCount,
			'chestDrops.timeGap': +s.chestDrops?.timeGap,
			'chestDrops.chancePercent': +s.chestDrops?.chancePercent,
			'xpSteal.enabled': s.xpSteal?.enabled,
			'xpSteal.xpMin': +s.xpSteal?.xpMin,
			'xpSteal.xpMax': +s.xpSteal?.xpMax,
			'xpSteal.range': +s.xpSteal?.range,
			'xpSteal.itemId': s.xpSteal?.itemId,
			'xpSteal.immuneRoles': immuneRoles,
			'streak.enabled': s.streak?.enabled,
			'streak.xpPerClaim': +s.streak?.xpPerClaim,
			'streak.creditsPerClaim': +s.streak?.creditsPerClaim,
			'streak.minStreakForCredits': +s.streak?.minStreakForCredits,
			'streak.milestones': streakMilestones,
			'rewardSyncing.sync': s.rewardSyncing?.sync,
			'rewardSyncing.noManual': s.rewardSyncing?.noManual,
			'rewardSyncing.noWarning': s.rewardSyncing?.noWarning,
			'chestDrops.showPreMessage': s.chestDrops?.showPreMessage,
			'chestDrops.preChestMessage': s.chestDrops?.preChestMessage,
			'chestDrops.preMessageDelay': +s.chestDrops?.preMessageDelay,
			'chestDrops.keyEmoji': s.chestDrops?.keyEmoji,
			'chestDrops.chestEmoji': s.chestDrops?.chestEmoji,
			'confession.enabled': s.confession?.enabled,
			'confession.channelId': s.confession?.channelId,
			'confession.anonymous': s.confession?.anonymous,
			'confession.cooldown': +s.confession?.cooldown,
			'confession.logChannelId': s.confession?.logChannelId,
			'confession.maxLength': +s.confession?.maxLength,
			'confession.allowImages': s.confession?.allowImages,
			'activityLeaderboard.enabled': s.activityLeaderboard?.enabled,
			'activityLeaderboard.channelId': s.activityLeaderboard?.channelId,
			'activityLeaderboard.rewardLogChannelId': s.activityLeaderboard?.rewardLogChannelId,
			'activityLeaderboard.interval': +s.activityLeaderboard?.interval,
			'activityLeaderboard.topCredits': +s.activityLeaderboard?.topCredits,
			'activityLeaderboard.topRoleId': s.activityLeaderboard?.topRoleId,
			'levelUp.maxRank': +s.levelUp?.maxRank,
			manualPerms: s.manualPerms,
			resetXpOnLeave: s.resetXpOnLeave,
			nicknameRank: s.nicknameRank,
			'quests.enabled': s.quests?.enabled,
			'quests.rewardEasy': +s.quests?.rewardEasy,
			'quests.rewardMedium': +s.quests?.rewardMedium,
			'quests.rewardHard': +s.quests?.rewardHard,
			'quests.rewardBonus': +s.quests?.rewardBonus,
			'quests.streakBonusMultiplier': +s.quests?.streakBonusMultiplier,
			'quests.streakBonusCap': +s.quests?.streakBonusCap,
			'quests.rerollCost': +s.quests?.rerollCost,
			'quests.rerollsPerDay': +s.quests?.rerollsPerDay,
			'quests.announceChannelId': s.quests?.announceChannelId,
			'quests.templates': questTemplates,
			'shop.enabled':   s.shop?.enabled,
			'shop.items':     shopItems,
			'chests.enabled': s.chests?.enabled,
			'chests.items':   chestItems,
			'coinflip.enabled': s.coinflip?.enabled,
			'bump.enabled':         s.bump?.enabled,
			'bump.channelId':       s.bump?.channelId,
			'bump.rewardCredits':   +s.bump?.rewardCredits,
			'bump.cooldownSeconds': +s.bump?.cooldownSeconds,
			'bump.disboardBotId':   s.bump?.disboardBotId,
			'stats.enabled':                    s.stats?.enabled,
			'stats.logChannelId':               s.stats?.logChannelId,
			'stats.reportHourUtc':              +s.stats?.reportHourUtc,
			'stats.activeThresholdDaily':       +s.stats?.activeThresholdDaily,
			'stats.activeThresholdWeekly':      +s.stats?.activeThresholdWeekly,
			'stats.activeThresholdMonthly':     +s.stats?.activeThresholdMonthly,
			'stats.activeThresholdQuarterly':   +s.stats?.activeThresholdQuarterly,
			'chestDrops.emojiId':    s.chestDrops?.emojiId,
			'chestDrops.chestTypes': chestTypes
		})

		try {
			await apiFetch(`/api/settings/${guildID}`, { method: 'POST', body: JSON.stringify(payload) })
			snapshotLastSaved()
			lastUpdated = Date.now()
			saveSuccess = true
			setTimeout(() => (saveSuccess = false), 3000)
		} catch (e) {
			saveError = e.message || 'Unknown error'
		} finally {
			saving = false
		}
	}

	// ── download XP ────────────────────────────────────────────────────────────
	async function downloadXP(format) {
		const res = await fetch(`/api/xp/${guildID}?format=${format}`)
		if (!res.ok) { const x = await res.json().catch(() => ({})); alert(`Error! ${x.message || 'Unknown'}`); return }
		const blob = await res.blob()
		const a = document.createElement('a')
		a.href = URL.createObjectURL(blob)
		a.download = `${guild?.name || guildID}.${format === 'everything' ? 'json' : format}`
		a.style.display = 'none'
		document.body.appendChild(a); a.click(); document.body.removeChild(a)
	}

	// ── reset XP ───────────────────────────────────────────────────────────────
	let showResetXPConfirm = false
	let showResetXPFinal = false
	let showResetSettingsConfirm = false

	async function confirmResetXP() {
		try {
			await apiFetch(`/api/settings/${guildID}`, { method: 'POST', body: JSON.stringify({ resetXP: true }) })
			alert('XP reset successfully!')
		} catch (e) { alert(`Error! ${e.message}`) }
		showResetXPConfirm = false; showResetXPFinal = false
	}

	async function confirmResetSettings() {
		try {
			await apiFetch(`/api/settings/${guildID}`, { method: 'POST', body: JSON.stringify({ resetSettings: true }) })
			window.location.reload()
		} catch (e) { alert(`Error! ${e.message}`) }
		showResetSettingsConfirm = false
	}

	// ── prune ──────────────────────────────────────────────────────────────────
	let pruneAmount = 100

	async function pruneMembers() {
		if (!confirm(`Delete all members with less than ${pruneAmount} XP? This cannot be undone!`)) return
		try {
			await apiFetch(`/api/pruneMembers`, { method: 'POST', body: JSON.stringify({ guildID, amount: pruneAmount, confirmPrune: 'hell yes' }) })
			alert('Pruned!')
		} catch (e) { alert(`Error! ${e.message}`) }
	}

	// ── import ─────────────────────────────────────────────────────────────────
	let importType = 'json'
	let importXP = true
	let importSettings = false
	let importSettingsPolaris = true
	let importServerID = ''
	let importJSONFile = null
	let importLurkrFile = null
	let importLoading = false
	let showImportConfirm = false

	async function runImport() {
		if (importLoading) return
		importLoading = true
		showImportConfirm = false
		try {
			if (importType === 'json' || importType === 'lurkr') {
				const file = importType === 'json' ? importJSONFile : importLurkrFile
				if (!file) { alert('Please select a file first!'); importLoading = false; return }
				const text = await file.text()
				const jsonData = JSON.parse(text)
				await apiFetch(`/api/importfrombot`, { method: 'POST', body: JSON.stringify({
					guildID,
					import: { bot: importType, xp: importXP, settings: importType === 'json' ? importSettings : false },
					jsonData
				}) })
			} else {
				// polaris → polaris server transfer
				await apiFetch(`/api/importfrombot`, { method: 'POST', body: JSON.stringify({
					guildID,
					import: { bot: 'polaris', xp: importXP, settings: importSettingsPolaris, serverID: importServerID }
				}) })
			}
			alert('Import successful!')
		} catch (e) { alert(`Error! ${e.message}`) }
		finally { importLoading = false }
	}

	// ── example level up msg ───────────────────────────────────────────────────
	let exampleLevel = 10
	let exampleState = 'idle'   // 'idle' | 'sending' | 'sent' | 'error'

	async function sendExample() {
		exampleState = 'sending'
		try {
			await apiFetch(`/api/sendexample`, { method: 'POST', body: JSON.stringify({
				guildID,
				message: s.levelUp?.embed ? lvlEmbedContent : lvlTextContent,
				embed: s.levelUp?.embed || false,
				level: +exampleLevel
			}) })
			exampleState = 'sent'
			setTimeout(() => (exampleState = 'idle'), 5000)
		} catch (e) { exampleState = 'error'; setTimeout(() => (exampleState = 'idle'), 4000) }
	}

	// ── curve preset selection ─────────────────────────────────────────────────
	let selectedPresetName = ''
	$: selectedPresetObj = presetList.find(p => p.name === selectedPresetName)

	function applyPreset() {
		const p = selectedPresetObj
		if (!p) return
		s.curve = { ...p.curve }
		s.rounding = p.round
		s.gain.min = p.bestRange[0]
		s.gain.max = p.bestRange[1]
	}

	// ── on mount ──────────────────────────────────────────────────────────────
	onMount(async () => {
		const data = await apiFetch(`/api/settings/${guildID}`).catch(e => { loadError = e.message; return null })
		if (!data) { loading = false; return }

		const db = data.settings
		guild = data.guild
		roles = data.roles || []
		channels = data.channels || []
		otherServers = data.ownedServers || []
		lastUpdated = data.guild.lastUpdate || 0

		// Flatten settings into our reactive object
		s = JSON.parse(JSON.stringify(db))

		// Ensure nested objects exist with defaults
		s.rewardSyncing = s.rewardSyncing || { sync: 'level', noManual: false, noWarning: false }
		s.confession = s.confession || { enabled: false, channelId: '', anonymous: true, cooldown: 300, logChannelId: '', maxLength: 2000, allowImages: false }
		s.activityLeaderboard = s.activityLeaderboard || { enabled: false, channelId: '', rewardLogChannelId: '', interval: 24, topCredits: 0, topRoleId: '' }
		if (s.streak) { s.streak.creditsPerClaim = s.streak.creditsPerClaim ?? 0; s.streak.minStreakForCredits = s.streak.minStreakForCredits ?? 0 }
		if (s.chestDrops) { s.chestDrops.showPreMessage = s.chestDrops.showPreMessage ?? true; s.chestDrops.keyEmoji = s.chestDrops.keyEmoji ?? '🗝️'; s.chestDrops.chestEmoji = s.chestDrops.chestEmoji ?? '📦' }

		s.shop     = s.shop     || { enabled: false }
		s.chests   = s.chests   || { enabled: false }
		s.coinflip = s.coinflip || { enabled: false }
		s.bump     = s.bump     || { enabled: false, channelId: '1280913100924653608', rewardCredits: 5, cooldownSeconds: 7200, disboardBotId: '302050872383242240' }
		s.stats    = s.stats    || { enabled: false, logChannelId: '', reportHourUtc: 12, activeThresholdDaily: 8, activeThresholdWeekly: 35, activeThresholdMonthly: 140, activeThresholdQuarterly: 420 }
		if (s.chestDrops) s.chestDrops.emojiId = s.chestDrops.emojiId ?? ''

		// Ensure quests object exists with defaults
		s.quests = s.quests || { enabled: false, rewardEasy: 50, rewardMedium: 150, rewardHard: 400, rewardBonus: 300, streakBonusMultiplier: 0.1, streakBonusCap: 7, rerollCost: 100, rerollsPerDay: 1, announceChannelId: '', templates: [] }

		// Extract tables
		rewards = (db.rewards || []).map(r => ({ ...r, noSync: r.noSync || false }))
		roleMultipliers = db.multipliers?.roles || []
		channelMultipliers = db.multipliers?.channels || []
		streakMilestones = db.streak?.milestones || []
		immuneRoles = db.xpSteal?.immuneRoles || []
		questTemplates = db.quests?.templates || []
		shopItems  = db.shop?.items  || []
		chestItems = db.chests?.items || []
		chestTypes = db.chestDrops?.chestTypes || []

		// Load quest presets
		apiFetch('/api/questPresets').then(p => { questPresets = p }).catch(() => {})

		// Level up message modes
		lvlMessageMode = db.levelUp?.embed ? 'embed' : 'text'
		lvlTextContent = (!db.levelUp?.embed && db.levelUp?.message) ? db.levelUp.message : ''
		lvlEmbedContent = (db.levelUp?.embed && db.levelUp?.message) ? db.levelUp.message : ''

		// Color pickers
		if (typeof db.rankCard?.embedColor === 'number' && db.rankCard.embedColor >= 0) {
			useCustomRankColor = true
			rankEmbedColor = '#' + db.rankCard.embedColor.toString(16).padStart(6, '0')
		}
		if (typeof db.leaderboard?.embedColor === 'number' && db.leaderboard.embedColor >= 0) {
			useCustomTopColor = true
			topEmbedColor = '#' + db.leaderboard.embedColor.toString(16).padStart(6, '0')
		}

		// Curve presets
		const presetsData = data.curvePresets?.presets || []
		presetList = [
			{ name: guild.name, desc: 'Your server\'s current settings.', curve: db.curve, round: db.rounding, bestRange: [db.gain.min, db.gain.max] },
			...presetsData
		]
		selectedPresetName = presetList.find(p => p.name !== guild.name && JSON.stringify([p.curve, p.round, p.bestRange]) === JSON.stringify([db.curve, db.rounding, [db.gain.min, db.gain.max]]))?.name || presetList[0].name

		snapshotLastSaved()
		loaded = true
		document.title = `Settings for ${guild.name}`
		loading = false
	})
</script>

<svelte:head>
	<title>Settings</title>
	<meta name="robots" content="noindex" />
</svelte:head>

{#if loading}
	<h2 style="margin-top: 75px; width: 100%;" class="middleflex">Loading...</h2>

{:else if loadError}
	<div class="uhoh">
		<h2>Something went wrong</h2>
		<p>{loadError}</p>
	</div>

{:else if guild && s.gain}
	<div style="display: flex; width: 1600px">

		<!-- ── SIDEBAR ──────────────────────────────────────────────────────── -->
		<div id="sidebar">
			{#each categories as cat}
				<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
				<div
					tabindex="0"
					class="category"
					class:current={activeCategory === cat.id}
					title={cat.id}
					on:click={() => (activeCategory = cat.id)}
					on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') activeCategory = cat.id }}
				>
					{#if cat.id === 'server'}
						<img class="serverIcon" style="border-radius: 420px" src={guild.icon || '/assets/avatar.png'} alt="" />
					{:else if cat.icon}
						<svelte:component this={cat.icon} size={20} strokeWidth={1.75} />
					{/if}
					<p>{cat.label}</p>
				</div>
			{/each}
		</div>

		<!-- ── UNSAVED WARNING ───────────────────────────────────────────────── -->
		<div id="unsavedWarning" class:activeWarning={saveError || saveSuccess || dirty}>
			{#if saveError}
				<div class="unsavedBox" style="background-color: var(--emojired)">
					<p>{saveError}</p>
				</div>
			{:else if saveSuccess}
				<div class="unsavedBox" style="background-color: var(--emojigreen)">
					<p>Saved!</p>
				</div>
			{:else if dirty}
				<div class="unsavedBox">
					<p>All done?</p>
					<button style="background-color: var(--emojigreen)" on:click={save} disabled={saving}>
						{saving ? 'Saving...' : 'Save'}
					</button>
				</div>
			{/if}
		</div>

		<!-- ── HOME / SERVER INFO ────────────────────────────────────────────── -->
		{#if activeCategory === 'server'}
			<div class="configboxes">
				<div class="settingBox box fulllength" style="padding: 15px 20px; position: relative">
					<div class="centerflex">
						<img src={guild.icon || '/assets/avatar.png'} alt="" class="serverIcon" style="border-radius: 420px; height: 75px" />
						<div style="margin-left: 18px; overflow: hidden">
							<h1 style="text-overflow: ellipsis; overflow: hidden; white-space: nowrap; margin-bottom: 0">{guild.name}</h1>
							<p style="margin-top: 0">{commafy(guild.members || 0)} member{guild.members === 1 ? '' : 's'}</p>
						</div>
					</div>
					<div class="middleflex" style="position: absolute; top: 0; right: 30px; height: 100%">
						<a tabindex="-1" href="/servers">
							<button style="font-size: 24px; height: 50px; width: 200px; margin-right: 25px; background-color: var(--emojiblue)">Change Server</button>
						</a>
						{#if !s.leaderboard?.disabled}
							<a tabindex="-1" href="/leaderboard/{guildID}" target="_blank" rel="noreferrer">
								<button style="font-size: 24px; height: 50px; width: 200px; background-color: var(--emojipurple)">Leaderboard</button>
							</a>
						{/if}
					</div>
				</div>

				{#each categories.slice(1) as cat}
					<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
					<div class="settingBox box categoryBox canfocus" tabindex="0" on:click={() => (activeCategory = cat.id)} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') activeCategory = cat.id }} style="cursor: pointer">
						<div class="centerflex">
							{#if cat.icon}
								<span class="catIcon">
									<svelte:component this={cat.icon} size={40} strokeWidth={1.4} />
								</span>
							{/if}
							<div style="overflow: hidden">
								<h2>{cat.label}</h2>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<!-- ── XP GAIN ───────────────────────────────────────────────────────── -->
		{#if activeCategory === 'xp'}
			<div class="configboxes">
				<div class="settingBox box fulllength">
					<h1>XP Gain</h1>
					<p>Whenever a member sends a message, they gain a random amount of XP and trigger a short cooldown.</p>
					<h2>Enable XP</h2>
					<p class="details">When enabled, members will be able to gain XP.</p>
					<label class="slider" style="margin-top: 5px">
						<input type="checkbox" bind:checked={s.enabled} /><span class="sliderspan"></span>
					</label>
				</div>

				<div class="settingBox box fulllength">
					<h1>Voice XP Gain</h1>
					<p>Members can also gain XP by participating in voice channels.</p>
					<h2>Enable Voice XP</h2>
					<label class="slider" style="margin-top: 5px">
						<input type="checkbox" bind:checked={s.enabledVoiceXp} /><span class="sliderspan"></span>
					</label>
				</div>

				<div class="settingBox box fulllength">
					<h1>Basic Settings</h1>
					<div class="simpleflex">
						<div class="sideoption">
							<h2>XP per message</h2>
							<p class="details">Randomly picked between min and max</p>
							<div class="centerflex spacedflex">
								<p>Between</p>
								<input type="number" bind:value={s.gain.min} min="0" max="5000" style="width: 75px" />
								<p>and</p>
								<input type="number" bind:value={s.gain.max} min="0" max="5000" style="width: 75px" />
							</div>
						</div>
						<div class="sideoption">
							<h2>Cooldown</h2>
							<p class="details">Seconds until next XP gain</p>
							<div class="centerflex spacedflex">
								<input type="number" bind:value={s.gain.time} min="0" max="31536000" style="width: 100px" />
								<p>seconds</p>
								{#if s.gain.time >= 60}<p style="opacity: 70%">({timeStr(s.gain.time * 1000)})</p>{/if}
							</div>
						</div>
					</div>
				</div>

				{#if s.enabledVoiceXp}
					<div class="settingBox box fulllength">
						<h1>Voice XP Settings</h1>
						<div class="simpleflex">
							<div class="sideoption">
								<h2>Voice XP Multiplier</h2>
								<p class="details">0 = no voice XP, 1 = equal to message XP</p>
								<input type="number" bind:value={s.voice.multiplier} min="0" max="1" step="0.1" style="width: 75px" />
							</div>
							<div class="sideoption">
								<h2>Hours limit</h2>
								<p class="details">0 means no limit</p>
								<div class="centerflex spacedflex">
									<input type="number" bind:value={s.voice.hoursLimit} min="0" max="24" step="0.5" style="width: 75px" />
									<p>hours</p>
								</div>
							</div>
							<div class="sideoption">
								<h2>XP Interval</h2>
								<p class="details">Seconds between voice XP grants (60–3600)</p>
								<div class="centerflex spacedflex">
									<input type="number" bind:value={s.voice.interval} min="60" max="3600" style="width: 90px" />
									<p>seconds</p>
								</div>
							</div>
						</div>
						<div class="simpleflex" style="margin-top: 20px">
							<div class="sideoption">
								<h2>Muted penalty</h2>
								<p class="details">XP multiplier when muted (0–1)</p>
								<input type="number" bind:value={s.voice.mutedMultiplier} min="0" max="1" step="0.1" style="width: 75px" />
							</div>
							<div class="sideoption">
								<h2>Deafened penalty</h2>
								<p class="details">XP multiplier when deafened (0–1)</p>
								<input type="number" bind:value={s.voice.deafMultiplier} min="0" max="1" step="0.1" style="width: 75px" />
							</div>
						</div>
					</div>
				{/if}

				<div class="settingBox box fulllength">
					<h1>Level Scaling</h1>
					<p>Adjust the cubic formula that determines how much XP is needed per level.</p>
					<div class="simpleflex">
						<div class="sideoption">
							<h2>Curve formula</h2>
							<p class="details">Cubic function: c3·x³ + c2·x² + c1·x</p>
							<div class="centerflex curvefield">
								<input type="number" bind:value={s.curve[3]} min="0" max="100" step="0.0001" style="width: 65px" />
								<p>x<sup>3</sup> + </p>
								<input type="number" bind:value={s.curve[2]} min="0" max="10000" step="0.01" style="width: 65px" />
								<p>x<sup>2</sup> + </p>
								<input type="number" bind:value={s.curve[1]} min="0" max="100000" step="0.1" style="width: 65px" />
								<p>x</p>
							</div>
							<p>Difficulty: <b style="color: aqua">{curveDifficulty}</b></p>
						</div>
						<div class="sideoption">
							<h2>Rounding</h2>
							<p class="details">Rounds XP to a nicer number (e.g. 791 → 800)</p>
							<div class="centerflex spacedflex">
								<p>Round to nearest</p>
								<input type="number" bind:value={s.rounding} min="1" max="1000" style="width: 80px" />
							</div>
						</div>
					</div>

					<div class="simpleflex" style="margin-top: 20px">
						<div>
							<h2 style="margin-bottom: 12px">Preview</h2>
							<div class="simpleflex flexTable">
								<div col="level"><p><b>Level</b></p>{#each curveTableRows as r}<p>{r.lvl}</p>{/each}</div>
								<div col="cum_xp"><p><b>Total XP</b></p>{#each curveTableRows as r}<p>{commafy(r.xp)}</p>{/each}</div>
								<div col="cum_msgs"><p><b>Total msgs</b></p>{#each curveTableRows as r}<p>{r.apx}{commafy(r.cumMsgs)}</p>{/each}</div>
								<div col="cum_time"><p><b>Total time</b></p>{#each curveTableRows as r}<p>{r.apx}{timeStr(r.cumTime * 1000)}</p>{/each}</div>
							</div>
							<button style="margin-top: 16px; width: 140px" on:click={() => (showFullCurvePreview = !showFullCurvePreview)}>
								{showFullCurvePreview ? 'Less info' : 'More info'}
							</button>
						</div>
					</div>

					{#if showFullCurvePreview}
						<div class="simpleflex flexTable" style="margin-top: 16px; max-height: 400px; overflow-y: auto">
							<div col="level"><p><b>Level</b></p>{#each fullCurveRows as r}<p>{r.lvl}</p>{/each}</div>
							<div col="xp"><p><b>+XP</b></p>{#each fullCurveRows as r}<p>+{commafy(r.rel)}</p>{/each}</div>
							<div col="cum_xp"><p><b>Total XP</b></p>{#each fullCurveRows as r}<p>{commafy(r.xp)}</p>{/each}</div>
							<div col="cum_msgs"><p><b>Total msgs</b></p>{#each fullCurveRows as r}<p>{r.apx}{commafy(r.cumMsgs)}</p>{/each}</div>
							<div col="cum_time"><p><b>Total time</b></p>{#each fullCurveRows as r}<p>{r.apx}{timeStr(r.cumTime * 1000)}</p>{/each}</div>
						</div>
					{/if}

					<h2 style="margin-top: 30px">Presets</h2>
					<div class="simpleflex">
						<div class="sideoption">
							<select bind:value={selectedPresetName} style="font-size: 20px; width: 250px">
								{#each presetList as p}<option value={p.name}>{p.name}</option>{/each}
							</select>
							{#if selectedPresetObj}
								<p class="details" style="margin-top: 8px">{selectedPresetObj.desc}</p>
								<p class="details">
									{+selectedPresetObj.curve[3].toFixed(4)}x<sup>3</sup> + {+selectedPresetObj.curve[2].toFixed(4)}x<sup>2</sup> + {+selectedPresetObj.curve[1].toFixed(4)}x
									&nbsp;•&nbsp; Round: {selectedPresetObj.round}
									&nbsp;•&nbsp; XP: {selectedPresetObj.bestRange.join(' – ')}
								</p>
								<button style="margin-top: 8px" on:click={applyPreset}>Apply preset</button>
							{/if}
						</div>
					</div>
				</div>
			</div>
		{/if}

		<!-- ── REWARD ROLES ──────────────────────────────────────────────────── -->
		{#if activeCategory === 'rewardroles'}
			<div class="configboxes">
				<div class="settingBox box fulllength">
					<h1>Reward Roles</h1>
					<p>Automatically grant roles when members reach certain levels.</p>

					<h2 style="margin-top: 20px">Add Reward Role</h2>
					<div class="centerflex spacedflex" style="margin-top: 10px">
						<select bind:value={newRewardRole}>
							<option value="" disabled selected>(Select role)</option>
							{#each roles as r}<option value={r.id} style="color: {roleColor(r.color)}">{r.name}</option>{/each}
						</select>
						<p>at level</p>
						<input type="number" bind:value={newRewardLevel} min="1" max="1000" style="width: 80px" />
						<button on:click={addRewardRole}>Add</button>
					</div>

					<h2 style="margin-top: 40px; margin-bottom: 15px">Reward roles ({rewards.length})</h2>
					{#if rewards.length}
						<div class="simpleflex flexTable">
							<div><p><b>Role</b></p>{#each rewards as r}<p style="color: {getRoleColor(r.id)}">{roleName(r.id)}</p>{/each}</div>
							<div><p><b>Level</b></p>{#each rewards as r, i}<p><input type="number" bind:value={rewards[i].level} min="1" max="1000" style="width: 65px" /></p>{/each}</div>
							<div><p><b>Keep</b></p>
								{#each rewards as r, i}
									<p><input type="checkbox" bind:checked={rewards[i].keep} /></p>
								{/each}
							</div>
							<div><p><b>No Sync</b></p>
								{#each rewards as r, i}
									<p><input type="checkbox" bind:checked={rewards[i].noSync} /></p>
								{/each}
							</div>
							<div><p><b>Delete</b></p>
								{#each rewards as r}
									<p class="deleteRow" tabindex="0" style="cursor: pointer" on:click={() => removeRewardRole(r.id)} on:keydown={(e) => { if (e.key === 'Enter') removeRewardRole(r.id) }}>🗑️</p>
								{/each}
							</div>
						</div>
					{:else}
						<p style="opacity: 60%">No reward roles yet.</p>
					{/if}
				</div>

				<div class="settingBox box fulllength">
					<h1>Role Syncing</h1>
					<p class="details">How reward roles are applied when a member interacts with the bot.</p>
					<div class="simpleflex" style="margin-top: 10px">
						<div class="sideoption">
							<h2>Sync mode</h2>
							<select bind:value={s.rewardSyncing.sync}>
								<option value="level">By level (default)</option>
								<option value="xp">By raw XP</option>
								<option value="never">Never sync</option>
							</select>
						</div>
					</div>
					<div class="centerflex spacedflex" style="margin-top: 15px">
						<label class="slider"><input type="checkbox" bind:checked={s.rewardSyncing.noManual} /><span class="sliderspan"></span></label>
						<p>Disable manual sync (/sync command)</p>
					</div>
					<div class="centerflex spacedflex" style="margin-top: 10px">
						<label class="slider"><input type="checkbox" bind:checked={s.rewardSyncing.noWarning} /><span class="sliderspan"></span></label>
						<p>Suppress sync warning messages</p>
					</div>
				</div>
			</div>
		{/if}

		<!-- ── LEVEL UP MESSAGE ──────────────────────────────────────────────── -->
		{#if activeCategory === 'levelup'}
			<div class="configboxes">
				<div class="settingBox box fulllength">
					<h1>Level Up Message</h1>
					<p>Send a customizable message when a member levels up.</p>

					<h2>Enable level up messages</h2>
					<label class="slider" style="margin-top: 5px">
						<input type="checkbox" bind:checked={s.levelUp.enabled} /><span class="sliderspan"></span>
					</label>
				</div>

				{#if s.levelUp.enabled}
					<div class="settingBreak"></div>
					<div class="settingBox box fulllength">
						<h1>Message</h1>
						<div class="simpleflex">
							<div class="sideoption">
								<h2>Embed mode</h2>
								<p class="details">Send a fancy embed instead of a plain message</p>
								<label class="slider" style="margin-top: 5px">
									<input type="checkbox" bind:checked={s.levelUp.embed} on:change={() => (lvlMessageMode = s.levelUp.embed ? 'embed' : 'text')} /><span class="sliderspan"></span>
								</label>
							</div>
							<div class="sideoption">
								<h2>Emoji</h2>
								<p class="details">Emoji shown in the level up message</p>
								<input type="text" bind:value={s.levelUp.emoji} style="width: 80px" placeholder="🎉" />
							</div>
						</div>

						{#if !s.levelUp.embed}
							<h2 style="margin-top: 20px">Message text</h2>
							<textarea class="lvlTextbox" bind:value={lvlTextContent} style="width: 800px" placeholder="(leave blank to use the default message)"></textarea>
						{:else}
							<h2 style="margin-top: 20px">Embed JSON</h2>
							<p><b>Step 1:</b> <a target="_blank" href="https://discohook.org/" rel="noreferrer">Generate an embed here!</a></p>
							<p><b>Step 2:</b> Open JSON Data Editor → copy and paste below.</p>
							<textarea class="lvlTextbox codeArea" bind:value={lvlEmbedContent} style="width: 800px" placeholder="(no embed)"></textarea>
						{/if}

						<div class="simpleflex" style="margin-top: 15px">
							<div class="sideoption">
								<h2>Variables</h2>
								<div class="varList">
									<select on:change={(e) => { const v = e.currentTarget.value; if (v !== 'x') { lvlTextContent += v; lvlEmbedContent += v } e.currentTarget.value = 'x' }}>
										<option value="x" selected disabled>XP</option>
										<option value="[[LEVEL]]">Level</option>
										<option value="[[OLD_LEVEL]]">Previous level</option>
										<option value="[[XP]]">XP</option>
										<option value="[[NEXT_LEVEL]]">Next level</option>
										<option value="[[NEXT_XP]]">XP to next level</option>
									</select>
									<select on:change={(e) => { const v = e.currentTarget.value; if (v !== 'x') { lvlTextContent += v; lvlEmbedContent += v } e.currentTarget.value = 'x' }}>
										<option value="x" selected disabled>Member</option>
										<option value="[[@]]">@mention</option>
										<option value="[[DISPLAYNAME]]">Display Name</option>
										<option value="[[USERNAME]]">Username</option>
										<option value="[[ID]]">ID</option>
										<option value="[[NICKNAME]]">Nickname</option>
										<option value="[[AVATAR]]">Avatar URL</option>
									</select>
									<select on:change={(e) => { const v = e.currentTarget.value; if (v !== 'x') { lvlTextContent += v; lvlEmbedContent += v } e.currentTarget.value = 'x' }}>
										<option value="x" selected disabled>Advanced</option>
										<option value="[[CHOOSE | Message 1 | Message 2 | Message 3... ]]">Random pick</option>
										<option value="[[IFLEVEL = 10 | Only on level 10 ]]">Level condition</option>
										<option value="[[IFROLE | Only upon gaining a role ]]">Reward role condition</option>
									</select>
									{#if roleVariables}
										<select on:change={(e) => { const v = e.currentTarget.value; if (v !== 'x') { lvlTextContent += v; lvlEmbedContent += v } e.currentTarget.value = 'x' }}>
											<option value="x" selected disabled>Role</option>
											<option value="[[ROLE]]">Reward role (@mention)</option>
											<option value="[[ROLE_NAME]]">Reward role name</option>
										</select>
									{/if}
								</div>
							</div>
							<div class="sideoption">
								<h2>Send example</h2>
								<p class="details">
									{#if exampleState === 'sending'}Sending...
									{:else if exampleState === 'sent'}<span style="color: lime">Sent! Check your DMs.</span>
									{:else if exampleState === 'error'}<span style="color: red">Error! Are DMs open?</span>
									{:else}Send a test message to check it works
									{/if}
								</p>
								<div class="centerflex spacedflex">
									<button style="background-color: var(--emojipurple)" on:click={sendExample} disabled={exampleState === 'sending'}>Send in DMs</button>
									<input type="number" bind:value={exampleLevel} min="1" max="1000" placeholder="Level" style="height: 37px; width: 70px" />
								</div>
							</div>
						</div>
					</div>

					<div class="settingBox box fulllength">
						<h1>Channel</h1>
						<select bind:value={s.levelUp.channel}>
							<option value="current">Current channel</option>
							<option value="dm">Send in DMs</option>
							{#each channels as ch}<option value={ch.id}>#{ch.name}</option>{/each}
						</select>
					</div>

					<div class="settingBox box fulllength">
						<h1>Interval</h1>
						<div class="simpleflex">
							<div class="sideoption">
								<h2>Multiple</h2>
								<p class="details">Only send on multiples of this level (e.g. 5 → levels 5, 10, 15...)</p>
								<div class="centerflex spacedflex">
									<p>Every</p>
									<input type="number" bind:value={s.levelUp.multiple} min="1" max="1000" style="width: 100px" />
									<p>level(s)</p>
								</div>
							</div>
							<div class="sideoption">
								<h2>Use multiple until</h2>
								<p class="details">Once above this level, send for every level (0 = disabled)</p>
								<div class="centerflex spacedflex">
									<p>Level</p>
									<input type="number" bind:value={s.levelUp.multipleUntil} min="0" max="1000" style="width: 100px" />
								</div>
							</div>
						</div>

						<div style="margin-top: 20px">
							<h2>Reward roles only</h2>
							<p class="details">Only send when obtaining a new reward role</p>
							<label class="slider" style="margin-top: 5px">
								<input type="checkbox" bind:checked={s.levelUp.rewardRolesOnly} /><span class="sliderspan"></span>
							</label>
						</div>
						<div style="margin-top: 20px">
							<h2>Max rank</h2>
							<p class="details">Only send to members ranked below this position (0 = all members).</p>
							<input type="number" bind:value={s.levelUp.maxRank} min="0" max="1000" style="width: 100px" />
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<!-- ── MULTIPLIERS ───────────────────────────────────────────────────── -->
		{#if activeCategory === 'multipliers'}
			<div class="configboxes">
				<div class="settingBox box fulllength" style="padding-bottom: 15px">
					<h1>Multipliers</h1>
					<p>Make certain roles/channels grant extra XP, or none at all.</p>
				</div>
				<div class="settingBreak"></div>

				<div class="settingBox box">
					<h2>Add a role multiplier</h2>
					<p class="details">Members with this role will have XP gain multiplied by the set value.</p>
					<div class="centerflex spacedflex" style="margin-top: 10px">
						<select bind:value={newRoleMultRole}>
							<option value="" disabled selected>(Select role)</option>
							{#each roles as r}<option value={r.id} style="color: {roleColor(r.color)}">{r.name}</option>{/each}
						</select>
						<p>grants</p>
						<input type="number" bind:value={newRoleMultAmount} min="0" max="100" step="0.01" style="width: 70px; margin-right: 2px" />
						<p>⨯ XP</p>
					</div>
					<button style="margin-top: 10px" on:click={addRoleMultiplier}>Add</button>

					<h2 style="margin-top: 50px; margin-bottom: 15px">Role multipliers ({roleMultipliers.length})</h2>
					{#if roleMultipliers.length}
						<div class="simpleflex flexTable">
							<div><p><b>Role</b></p>{#each roleMultipliers as r}<p style="color: {getRoleColor(r.id)}">{roleName(r.id)}</p>{/each}</div>
							<div><p><b>Multiplier</b></p>{#each roleMultipliers as r, i}
								<p><input type="number" bind:value={roleMultipliers[i].boost} min="0" max="100" step="0.01" style="width: 70px" />x</p>
							{/each}</div>
							<div><p><b>Delete</b></p>
								{#each roleMultipliers as r}
									<p class="deleteRow" style="cursor: pointer" on:click={() => removeRoleMultiplier(r.id)}>🗑️</p>
								{/each}
							</div>
						</div>
					{:else}<p style="opacity: 60%">No role multipliers.</p>{/if}

					<h2 style="margin-top: 40px">Role priority</h2>
					<p class="details">If a member has multiple multiplier roles, which takes priority?</p>
					<select bind:value={s.multipliers.rolePriority}>
						<option value="largest">Largest multiplier</option>
						<option value="smallest">Smallest multiplier</option>
						<option value="highest">Highest role</option>
						<option value="add">Add them together</option>
						<option value="combine">COMBINE THEM ALL!!! (bad idea)</option>
					</select>
					<p class="details" style="margin-top: 8px">{roleMultDesc[s.multipliers.rolePriority] || ''}</p>
				</div>

				<div class="settingBox box">
					<h2>Add a channel multiplier</h2>
					<p class="details">Category multipliers apply to channels without a more specific multiplier.</p>
					<div class="centerflex spacedflex" style="margin-top: 10px">
						<select bind:value={newChanMultChan}>
							<option value="" disabled selected>(Select channel)</option>
							{#each channels as ch}<option value={ch.id}>#{ch.name}</option>{/each}
						</select>
						<p>grants</p>
						<input type="number" bind:value={newChanMultAmount} min="0" max="100" step="0.01" style="width: 70px; margin-right: 2px" />
						<p>⨯ XP</p>
					</div>
					<button style="background-color: var(--emojipurple); margin-top: 10px" on:click={addChannelMultiplier}>Add</button>

					<h2 style="margin-top: 50px; margin-bottom: 15px">Channel multipliers ({channelMultipliers.length})</h2>
					{#if channelMultipliers.length}
						<div class="simpleflex flexTable">
							<div><p><b>Channel</b></p>{#each channelMultipliers as c}<p>#{channelName(c.id)}</p>{/each}</div>
							<div><p><b>Multiplier</b></p>{#each channelMultipliers as c, i}
								<p><input type="number" bind:value={channelMultipliers[i].boost} min="0" max="100" step="0.01" style="width: 70px" />x</p>
							{/each}</div>
							<div><p><b>Delete</b></p>
								{#each channelMultipliers as c}
									<p class="deleteRow" style="cursor: pointer" on:click={() => removeChannelMultiplier(c.id)}>🗑️</p>
								{/each}
							</div>
						</div>
					{:else}<p style="opacity: 60%">No channel multipliers.</p>{/if}

					<h2 style="margin-top: 40px">Stacking</h2>
					<p class="details">What happens if a member also has a role multiplier?</p>
					<select bind:value={s.multipliers.channelStacking}>
						<option value="multiply">Multiply together with role</option>
						<option value="add">Add together with role</option>
						<option value="largest">Use the higher multiplier</option>
						<option value="channel">Always use channel multiplier</option>
						<option value="role">Always use role multiplier</option>
					</select>
					<p class="details" style="margin-top: 8px">{channelMultDesc[s.multipliers.channelStacking] || ''}</p>
				</div>
			</div>
		{/if}

		<!-- ── RANK CARD ─────────────────────────────────────────────────────── -->
		{#if activeCategory === 'rankcard'}
			<div class="configboxes">
				<div class="settingBox box fulllength">
					<h1>Rank Card</h1>
					<p>Tweak the details shown on rank cards.</p>

					<h2>Enable rank cards</h2>
					<p class="details">Allows members to check their XP with /rank.</p>
					<label class="slider" style="margin-top: 5px">
						<input type="checkbox" checked={!s.rankCard?.disabled} on:change={(e) => (s.rankCard.disabled = !e.currentTarget.checked)} /><span class="sliderspan"></span>
					</label>
				</div>
				<div class="settingBreak"></div>

				{#if !s.rankCard?.disabled}
					<div class="settingBox box">
						<h2>Hide cooldown</h2>
						<p class="details">Prevents members from viewing XP cooldown time.</p>
						<label class="slider" style="margin-top: 5px">
							<input type="checkbox" bind:checked={s.rankCard.hideCooldown} /><span class="sliderspan"></span>
						</label>
					</div>

					<div class="settingBox box">
						<h2>Force hidden</h2>
						<p class="details">Forces /rank to always be ephemeral.</p>
						<label class="slider" style="margin-top: 5px">
							<input type="checkbox" bind:checked={s.rankCard.ephemeral} /><span class="sliderspan"></span>
						</label>
					</div>

					<div class="settingBox box">
						<h2>Relative XP</h2>
						<p class="details">Show XP progress starting from 0 each level rather than total XP.</p>
						<label class="slider" style="margin-top: 5px">
							<input type="checkbox" bind:checked={s.rankCard.relativeLevel} /><span class="sliderspan"></span>
						</label>
					</div>
				{/if}

				<div class="settingBox box">
					<h2>Hide multipliers</h2>
					<p class="details">Prevents members from seeing which roles have multipliers.</p>
					<label class="slider" style="margin-top: 5px">
						<input type="checkbox" bind:checked={s.hideMultipliers} /><span class="sliderspan"></span>
					</label>
				</div>
			</div>
		{/if}

		<!-- ── LEADERBOARD ───────────────────────────────────────────────────── -->
		{#if activeCategory === 'leaderboard'}
			<div class="configboxes">
				<div class="settingBox box fulllength">
					<h1>Leaderboard</h1>
					<p>Tweak leaderboard settings and privacy.</p>
					<a tabindex="-1" href="/leaderboard/{guildID}" target="_blank" rel="noreferrer">
						<button style="background-color: var(--emojipurple)">Visit leaderboard</button>
					</a>

					<h2 style="margin-top: 20px">Enable leaderboard</h2>
					<label class="slider" style="margin-top: 5px">
						<input type="checkbox" checked={!s.leaderboard?.disabled} on:change={(e) => (s.leaderboard.disabled = !e.currentTarget.checked)} /><span class="sliderspan"></span>
					</label>
				</div>
				<div class="settingBreak"></div>

				<div class="settingBox box">
					<h2>Force hidden</h2>
					<p class="details">Forces /leaderboard to always be ephemeral.</p>
					<label class="slider" style="margin-top: 5px">
						<input type="checkbox" bind:checked={s.leaderboard.ephemeral} /><span class="sliderspan"></span>
					</label>
				</div>

				{#if !s.leaderboard?.disabled}
					<div class="settingBox box">
						<h2>Hide reward roles</h2>
						<p class="details">Disables the reward roles tab on the online leaderboard.</p>
						<label class="slider" style="margin-top: 5px">
							<input type="checkbox" bind:checked={s.leaderboard.hideRoles} /><span class="sliderspan"></span>
						</label>
					</div>

					<div class="settingBox box">
						<h2>Minimum level</h2>
						<p class="details">Only show members above this level (0 = all members).</p>
						<input type="number" bind:value={s.leaderboard.minLevel} min="0" max="1000" style="width: 100px" />
					</div>

					<div class="settingBox box">
						<h2>Maximum members</h2>
						<p class="details">Only show the top X members (0 = all members).</p>
						<input type="number" bind:value={s.leaderboard.maxEntries} min="0" max="1000000" style="width: 100px" />
					</div>

					<div class="settingBox box">
						<h2>Private leaderboard</h2>
						<p class="details">Only server members can view the leaderboard (requires login).</p>
						<label class="slider" style="margin-top: 5px">
							<input type="checkbox" bind:checked={s.leaderboard.private} /><span class="sliderspan"></span>
						</label>
					</div>
				{/if}
			</div>
		{/if}

		<!-- ── DATA ─────────────────────────────────────────────────────────── -->
		{#if activeCategory === 'data'}
			<div class="configboxes">
				<div class="settingBox box fulllength" style="padding-bottom: 15px">
					<h1>Data</h1>
					<p>Settings related to the server's data.</p>
				</div>
				<div class="settingBreak"></div>

				<div class="settingBox box fulllength">
					<h2>Download XP</h2>
					<p class="details" style="margin-bottom: 10px">Export everyone's XP. <b>Download all data to import into an open-source Polaris fork.</b></p>
					<button style="background-color: var(--emojipurple)" on:click={() => downloadXP('everything')}>Download all data</button>
					<button style="margin-left: 10px" on:click={() => downloadXP('json')}>Download as .json</button>
					<button style="margin-left: 10px" on:click={() => downloadXP('csv')}>Download as .csv</button>
					<button style="margin-left: 10px" on:click={() => downloadXP('txt')}>Download as .txt</button>
				</div>
				<div class="settingBreak"></div>

				<div class="settingBox box">
					<h2>Clear all XP</h2>
					<p class="details">Reset everyone's XP to 0. <b>Cannot be undone!</b></p>
					<button style="background-color: var(--emojired)" on:click={() => (showResetXPConfirm = !showResetXPConfirm, showResetXPFinal = false)}>Reset!</button>
					{#if showResetXPConfirm}
						<button style="margin-left: 10px; background-color: var(--emojiblue)" on:click={() => (showResetXPFinal = !showResetXPFinal)}>Are you sure?</button>
					{/if}
					{#if showResetXPFinal}
						<button style="margin-left: 10px; background-color: var(--emojipurple)" on:click={confirmResetXP}>Positive?</button>
					{/if}
				</div>

				<div class="settingBox box">
					<h2>Reset settings</h2>
					<p class="details">Restore all settings to defaults. XP is not affected. <b>Cannot be undone!</b></p>
					<button style="background-color: var(--emojired)" on:click={() => (showResetSettingsConfirm = !showResetSettingsConfirm)}>Reset!</button>
					{#if showResetSettingsConfirm}
						<button style="margin-left: 10px; background-color: var(--emojiblue)" on:click={confirmResetSettings}>Are you sure?</button>
					{/if}
				</div>
				<div class="settingBreak"></div>

				<div class="settingBox box">
					<h2>Prune Members</h2>
					<p class="details">Delete data for members with less than a set amount of XP. <b>Cannot be undone!</b></p>
					<div class="centerflex spacedflex">
						<p>Less than:</p>
						<input type="number" bind:value={pruneAmount} min="1" style="width: 150px" />
						<button style="background-color: var(--emojired)" on:click={pruneMembers}>Prune!</button>
					</div>
				</div>

				<div class="settingBox box fulllength">
					<div class="spacedflex centerflex" style="margin-top: 15px; margin-bottom: 5px">
						<h2 style="margin: 0">Import settings and XP from</h2>
						<select bind:value={importType} style="margin-left: 8px; width: 250px; font-weight: bold">
							<option value="json">.json file</option>
							<option value="polaris">Another server</option>
							<option value="lurkr">Lurkr</option>
						</select>
					</div>

					{#if importType === 'json'}
						<p class="details">Import XP and settings from a downloaded Polaris data file.</p>
						<div class="centerflex spacedflex">
							<p>Import from:</p>
							<input type="file" accept="application/json" on:change={(e) => (importJSONFile = e.currentTarget.files[0])} style="padding-top: 15px; width: 500px; margin: 10px 0" />
						</div>
						<div class="centerflex spacedflex">
							<label class="slider"><input type="checkbox" bind:checked={importXP} /><span class="sliderspan"></span></label>
							<p>Import XP (overwrites existing members!)</p>
						</div>
					{:else if importType === 'polaris'}
						<p class="details">Copy XP and settings from another server using this bot. <b>Requires server owner.</b></p>
						<div class="centerflex spacedflex">
							<p>Import from:</p>
							<select bind:value={importServerID}>
								{#each otherServers as srv}<option value={srv.id}>{srv.name}</option>{/each}
							</select>
						</div>
						<div class="centerflex spacedflex">
							<label class="slider"><input type="checkbox" bind:checked={importXP} /><span class="sliderspan"></span></label>
							<p>Import XP (overwrites existing members!)</p>
						</div>
						<div class="centerflex spacedflex">
							<label class="slider"><input type="checkbox" bind:checked={importSettingsPolaris} /><span class="sliderspan"></span></label>
							<p>Import settings</p>
						</div>
					{:else}
						<p class="details">Import XP from a Lurkr JSON file.</p>
						<input type="file" accept="application/json" on:change={(e) => (importLurkrFile = e.currentTarget.files[0])} style="padding-top: 15px; width: 500px; margin: 10px 0" />
					{/if}

					{#if !importLoading}
						<button style="margin-top: 15px; background-color: var(--emojigreen)" on:click={() => (showImportConfirm = !showImportConfirm)}>Import!</button>
						{#if showImportConfirm}
							<button style="margin-left: 10px; background-color: var(--emojiblue)" on:click={runImport}>Are you sure?</button>
						{/if}
					{:else}
						<p><b>Working on it...</b></p>
					{/if}
				</div>
			</div>
		{/if}

		<!-- ── XP CHEST ──────────────────────────────────────────────────────── -->
		{#if activeCategory === 'chestDrops'}
			<div class="configboxes">
				<div class="settingBox box fulllength">
					<h1>XP Chest</h1>
					<p>Settings related to the XP chest feature.</p>

					<h2>Enable XP Chest</h2>
					<label class="slider" style="margin-top: 5px">
						<input type="checkbox" bind:checked={s.chestDrops.enabled} /><span class="sliderspan"></span>
					</label>
				</div>
				<div class="settingBreak"></div>

				{#if s.chestDrops?.enabled}
					<div class="settingBox box">
						<h2>Drop Channel</h2>
						<p class="details">Channel where XP chests drop.</p>
						<select bind:value={s.chestDrops.channelId}>
							<option value="">Any channel</option>
							{#each channels as ch}<option value={ch.id}>#{ch.name}</option>{/each}
						</select>
					</div>

					<div class="settingBox box">
						<h2>Message Count</h2>
						<p class="details">Messages required to trigger a chest drop.</p>
						<input type="number" bind:value={s.chestDrops.messageCount} min="1" max="10000" style="width: 120px" />
					</div>

					<div class="settingBox box">
						<h2>Time Gap</h2>
						<p class="details">Minimum hours between chest drops.</p>
						<div class="centerflex spacedflex">
							<input type="number" bind:value={s.chestDrops.timeGap} min="0.1" max="24" step="0.1" style="width: 80px" />
							<p>hours</p>
						</div>
					</div>

					<div class="settingBox box">
						<h2>Drop Chance</h2>
						<p class="details">Chance percentage for a chest to drop after conditions are met.</p>
						<div class="centerflex spacedflex">
							<input type="number" bind:value={s.chestDrops.chancePercent} min="1" max="100" style="width: 80px" />
							<p>%</p>
						</div>
					</div>

					<div class="settingBox box">
						<h2>Pre-drop warning</h2>
						<p class="details">Send a warning message before the chest appears.</p>
						<label class="slider" style="margin-top: 5px">
							<input type="checkbox" bind:checked={s.chestDrops.showPreMessage} /><span class="sliderspan"></span>
						</label>
					</div>

					{#if s.chestDrops.showPreMessage}
						<div class="settingBox box fulllength">
							<h2>Pre-drop message</h2>
							<p class="details">Message sent a few seconds before the chest drops.</p>
							<textarea bind:value={s.chestDrops.preChestMessage} style="width: 600px; height: 80px"></textarea>
						</div>

						<div class="settingBox box">
							<h2>Warning delay</h2>
							<p class="details">Seconds before chest appears after warning (1–15).</p>
							<div class="centerflex spacedflex">
								<input type="number" bind:value={s.chestDrops.preMessageDelay} min="1" max="15" step="0.5" style="width: 80px" />
								<p>seconds</p>
							</div>
						</div>
					{/if}

					<div class="settingBox box">
						<h2>Key emoji</h2>
						<p class="details">Emoji members click to open the chest.</p>
						<input type="text" bind:value={s.chestDrops.keyEmoji} style="width: 80px" placeholder="🗝️" />
					</div>

					<div class="settingBox box">
						<h2>Chest emoji</h2>
						<p class="details">Emoji shown when the chest appears.</p>
						<input type="text" bind:value={s.chestDrops.chestEmoji} style="width: 80px" placeholder="📦" />
					</div>

					<div class="settingBox box">
						<h2>Custom emoji ID</h2>
						<p class="details">Discord custom emoji ID to use for the chest button. Overrides the emoji fields above when set. Leave blank to use the emoji text instead.</p>
						<input type="text" bind:value={s.chestDrops.emojiId} style="width: 220px" placeholder="e.g. 1234567890123456789" />
					</div>

					<div class="settingBox box fulllength">
						<h2>Chest tiers</h2>
						<p class="details">Define custom chest types with different XP rewards and drop chances. When set, the bot will randomly pick a tier on each chest drop according to the chance weights.</p>

						<h2 style="margin-top: 20px">Add tier</h2>
						<div class="simpleflex" style="gap: 12px; flex-wrap: wrap; align-items: flex-end; margin-top: 8px">
							<div class="field">
								<p class="details" style="margin-bottom: 2px">Type name</p>
								<input type="text" bind:value={newChestTypeName} placeholder="e.g. Rare" style="width: 130px" />
							</div>
							<div class="field">
								<p class="details" style="margin-bottom: 2px">Chance %</p>
								<input type="number" bind:value={newChestTypeChance} min="1" max="100" style="width: 80px" />
							</div>
							<div class="field">
								<p class="details" style="margin-bottom: 2px">XP min</p>
								<input type="number" bind:value={newChestTypeXpMin} min="-10000" max="10000" style="width: 90px" />
							</div>
							<div class="field">
								<p class="details" style="margin-bottom: 2px">XP max</p>
								<input type="number" bind:value={newChestTypeXpMax} min="-10000" max="10000" style="width: 90px" />
							</div>
							<div class="field">
								<p class="details" style="margin-bottom: 2px">Color</p>
								<input type="color" bind:value={newChestTypeColor} style="width: 45px; height: 40px" />
							</div>
							<button style="margin-bottom: 0" on:click={() => {
								if (!newChestTypeName.trim()) return alert('Type name is required.')
								const color = parseInt(newChestTypeColor.replace('#', ''), 16)
								chestTypes = [...chestTypes, { type: newChestTypeName.trim(), chance: Math.max(1, +newChestTypeChance), xpMin: +newChestTypeXpMin, xpMax: Math.max(+newChestTypeXpMin, +newChestTypeXpMax), color }]
								newChestTypeName = ''; newChestTypeChance = 25; newChestTypeXpMin = 50; newChestTypeXpMax = 200; newChestTypeColor = '#00ff80'
							}}>Add</button>
						</div>

						<h2 style="margin-top: 30px; margin-bottom: 15px">Current tiers ({chestTypes.length})</h2>
						{#if chestTypes.length}
							<div style="overflow-x: auto">
								<table style="border-collapse: collapse; min-width: 100%">
									<thead>
										<tr style="border-bottom: 2px solid rgba(255,255,255,0.15)">
											<th style="padding: 6px 10px; text-align: left">Type</th>
											<th style="padding: 6px 10px; text-align: left">Chance</th>
											<th style="padding: 6px 10px; text-align: left">XP range</th>
											<th style="padding: 6px 10px; text-align: left">Color</th>
											<th style="padding: 6px 10px"></th>
											<th style="padding: 6px 10px"></th>
										</tr>
									</thead>
									<tbody>
										{#each chestTypes as ct, i}
											{#if editingChestTypeIndex === i}
												<tr style="border-bottom: 1px solid rgba(255,255,255,0.07); background: rgba(255,255,255,0.04)">
													<td style="padding: 6px 8px"><input type="text" bind:value={editingChestTypeData.type} style="width: 110px" /></td>
													<td style="padding: 6px 8px"><input type="number" bind:value={editingChestTypeData.chance} min="1" max="100" style="width: 70px" /></td>
													<td style="padding: 6px 8px">
														<input type="number" bind:value={editingChestTypeData.xpMin} style="width: 80px" />
														<span style="margin: 0 6px">–</span>
														<input type="number" bind:value={editingChestTypeData.xpMax} style="width: 80px" />
													</td>
													<td style="padding: 6px 8px">
														<input type="color" value={'#' + (editingChestTypeData.color || 0).toString(16).padStart(6, '0')} on:input={(e) => editingChestTypeData.color = parseInt(e.currentTarget.value.replace('#',''), 16)} style="width: 40px; height: 34px" />
													</td>
													<td style="padding: 6px 8px"><button style="height: 34px; font-size: 14px; background-color: var(--emojigreen)" on:click={() => {
														const updated = { ...editingChestTypeData }
														updated.xpMin = +updated.xpMin; updated.xpMax = Math.max(+updated.xpMin, +updated.xpMax); updated.chance = Math.max(1, +updated.chance)
														chestTypes = chestTypes.map((t, j) => j === i ? updated : t)
														editingChestTypeIndex = -1
													}}>Save</button></td>
													<td style="padding: 6px 8px"><button style="height: 34px; font-size: 14px" on:click={() => editingChestTypeIndex = -1}>Cancel</button></td>
												</tr>
											{:else}
												<tr style="border-bottom: 1px solid rgba(255,255,255,0.07)">
													<td style="padding: 6px 8px"><b>{ct.type}</b></td>
													<td style="padding: 6px 8px">{ct.chance}%</td>
													<td style="padding: 6px 8px">{ct.xpMin} – {ct.xpMax} XP</td>
													<td style="padding: 6px 8px"><span style="display: inline-block; width: 22px; height: 22px; border-radius: 4px; background: {'#' + (ct.color || 0).toString(16).padStart(6,'0')}; border: 1px solid rgba(255,255,255,0.2)"></span></td>
													<td style="padding: 6px 8px"><span style="cursor: pointer" on:click={() => { editingChestTypeIndex = i; editingChestTypeData = { ...ct } }}>✏️</span></td>
													<td style="padding: 6px 8px"><span class="deleteRow" style="cursor: pointer" on:click={() => { chestTypes = chestTypes.filter((_, j) => j !== i); if (editingChestTypeIndex === i) editingChestTypeIndex = -1 }}>🗑️</span></td>
												</tr>
											{/if}
										{/each}
									</tbody>
								</table>
							</div>
						{:else}
							<p style="opacity: 60%">No tiers defined — the default single chest type will be used.</p>
						{/if}
					</div>
				{/if}
			</div>
		{/if}

		<!-- ── XP STEAL ──────────────────────────────────────────────────────── -->
		{#if activeCategory === 'xpSteal'}
			<div class="configboxes">
				<div class="settingBox box fulllength">
					<h1>XP Steal</h1>
					<p>Configure the XP Steal feature.</p>

					<h2>Enable XP Steal</h2>
					<label class="slider" style="margin-top: 5px">
						<input type="checkbox" bind:checked={s.xpSteal.enabled} /><span class="sliderspan"></span>
					</label>
				</div>

				<div class="settingBox box">
					<h2>XP Range</h2>
					<p class="details">Min and max XP that can be stolen per attempt.</p>
					<div class="centerflex spacedflex">
						<p>Min:</p>
						<input type="number" bind:value={s.xpSteal.xpMin} min="0" max="10000" style="width: 100px" />
						<p>Max:</p>
						<input type="number" bind:value={s.xpSteal.xpMax} min="0" max="10000" style="width: 100px" />
					</div>
				</div>

				<div class="settingBox box">
					<h2>Rank Range</h2>
					<p class="details">Maximum rank difference for stealing.</p>
					<input type="number" bind:value={s.xpSteal.range} min="0" max="100" style="width: 100px" />
				</div>

				<div class="settingBox box">
					<h2>Item ID</h2>
					<p class="details">Shop item ID required to use XP Steal.</p>
					<input type="text" bind:value={s.xpSteal.itemId} placeholder="Enter item ID" style="width: 300px" />
				</div>

				<div class="settingBox box">
					<h2>Add Immune Role</h2>
					<p class="details">Roles immune to XP stealing.</p>
					<div class="centerflex spacedflex" style="margin-top: 10px">
						<select bind:value={newImmuneRole}>
							<option value="" disabled selected>(Select role)</option>
							{#each roles as r}<option value={r.id} style="color: {roleColor(r.color)}">{r.name}</option>{/each}
						</select>
						<button style="margin-left: 10px" on:click={addImmuneRole}>Add</button>
					</div>
					<h2 style="margin-top: 30px; margin-bottom: 15px">Immune roles ({immuneRoles.length})</h2>
					{#if immuneRoles.length}
						<div class="simpleflex flexTable">
							<div><p><b>Role</b></p>{#each immuneRoles as r}<p style="color: {getRoleColor(r.id)}">{roleName(r.id)}</p>{/each}</div>
							<div><p><b>Delete</b></p>
								{#each immuneRoles as r}
									<p class="deleteRow" style="cursor: pointer" on:click={() => removeImmuneRole(r.id)}>🗑️</p>
								{/each}
							</div>
						</div>
					{:else}<p style="opacity: 60%">No immune roles.</p>{/if}
				</div>
			</div>
		{/if}

		<!-- ── STREAKS ───────────────────────────────────────────────────────── -->
		{#if activeCategory === 'streak'}
			<div class="configboxes">
				<div class="settingBox box fulllength">
					<h1>Streak System</h1>
					<p>Members can claim a daily streak for bonus XP and milestone rewards.</p>

					<h2>Enable Streaks</h2>
					<label class="slider" style="margin-top: 5px">
						<input type="checkbox" bind:checked={s.streak.enabled} /><span class="sliderspan"></span>
					</label>
				</div>

				<div class="settingBox box fulllength">
					<div class="simpleflex">
						<div class="sideoption">
							<h2>XP per Claim</h2>
							<p class="details">XP awarded for each daily streak claim.</p>
							<input type="number" bind:value={s.streak.xpPerClaim} min="0" max="10000" style="width: 120px" />
						</div>
						<div class="sideoption">
							<h2>Credits per Claim</h2>
							<p class="details">Credits awarded for each daily streak claim.</p>
							<input type="number" bind:value={s.streak.creditsPerClaim} min="0" max="10000" style="width: 120px" />
						</div>
						<div class="sideoption">
							<h2>Min streak for credits</h2>
							<p class="details">Minimum streak days required to earn credits (0 = always).</p>
							<input type="number" bind:value={s.streak.minStreakForCredits} min="0" max="1000" style="width: 120px" />
						</div>
					</div>
				</div>

				<div class="settingBox box fulllength">
					<h2>Streak Milestones</h2>
					<p class="details">Grant roles at specific streak counts.</p>
					<div class="centerflex spacedflex" style="margin-top: 10px">
						<p>Role</p>
						<select bind:value={newMilestoneRole}>
							<option value="" disabled selected>(Select role)</option>
							{#each roles as r}<option value={r.id} style="color: {roleColor(r.color)}">{r.name}</option>{/each}
						</select>
						<p>at</p>
						<input type="number" bind:value={newMilestoneDays} min="1" max="1000" style="width: 90px" />
						<p>days</p>
						<button style="margin-left: 10px" on:click={addStreakMilestone}>Add</button>
					</div>

					<h2 style="margin-top: 30px; margin-bottom: 15px">Current milestones ({streakMilestones.length})</h2>
					{#if streakMilestones.length}
						<div class="simpleflex flexTable">
							<div><p><b>Role</b></p>{#each streakMilestones as m}<p style="color: {getRoleColor(m.roleId)}">{roleName(m.roleId)}</p>{/each}</div>
							<div><p><b>Days</b></p>{#each streakMilestones as m}<p>{m.days}</p>{/each}</div>
							<div><p><b>Delete</b></p>
								{#each streakMilestones as m}
									<p class="deleteRow" style="cursor: pointer" on:click={() => removeMilestone(m.roleId, m.days)}>🗑️</p>
								{/each}
							</div>
						</div>
					{:else}<p style="opacity: 60%">No milestones yet.</p>{/if}
				</div>
			</div>
		{/if}

		<!-- ── CONFESSION ───────────────────────────────────────────────────── -->
		{#if activeCategory === 'confession'}
			<div class="configboxes">
				<div class="settingBox box fulllength">
					<h1>Confessions</h1>
					<p>Let members submit anonymous (or named) confessions to a designated channel.</p>
					<h2>Enable Confessions</h2>
					<label class="slider" style="margin-top: 5px">
						<input type="checkbox" bind:checked={s.confession.enabled} /><span class="sliderspan"></span>
					</label>
				</div>

				{#if s.confession?.enabled}
					<div class="settingBox box">
						<h2>Confession channel</h2>
						<p class="details">Channel where confessions are posted publicly.</p>
						<select bind:value={s.confession.channelId}>
							<option value="">(None – required)</option>
							{#each channels as ch}<option value={ch.id}>#{ch.name}</option>{/each}
						</select>
					</div>

					<div class="settingBox box">
						<h2>Log channel</h2>
						<p class="details">Privately log all confessions with author info (optional).</p>
						<select bind:value={s.confession.logChannelId}>
							<option value="">(None)</option>
							{#each channels as ch}<option value={ch.id}>#{ch.name}</option>{/each}
						</select>
					</div>

					<div class="settingBox box">
						<h2>Anonymous</h2>
						<p class="details">When enabled, the author's identity is hidden from the public channel.</p>
						<label class="slider" style="margin-top: 5px">
							<input type="checkbox" bind:checked={s.confession.anonymous} /><span class="sliderspan"></span>
						</label>
					</div>

					<div class="settingBox box">
						<h2>Allow images</h2>
						<p class="details">Let members attach images to their confessions.</p>
						<label class="slider" style="margin-top: 5px">
							<input type="checkbox" bind:checked={s.confession.allowImages} /><span class="sliderspan"></span>
						</label>
					</div>

					<div class="settingBox box">
						<h2>Cooldown</h2>
						<p class="details">Seconds between confessions per user (0 = no cooldown).</p>
						<div class="centerflex spacedflex">
							<input type="number" bind:value={s.confession.cooldown} min="0" max="86400" style="width: 100px" />
							<p>seconds</p>
							{#if s.confession.cooldown >= 60}<p style="opacity: 70%">({timeStr(s.confession.cooldown * 1000)})</p>{/if}
						</div>
					</div>

					<div class="settingBox box">
						<h2>Max length</h2>
						<p class="details">Maximum character length per confession (1–4000).</p>
						<input type="number" bind:value={s.confession.maxLength} min="1" max="4000" style="width: 100px" />
					</div>
				{/if}
			</div>
		{/if}

		<!-- ── ACTIVITY LEADERBOARD ──────────────────────────────────────────── -->
		{#if activeCategory === 'activityleaderboard'}
			<div class="configboxes">
				<div class="settingBox box fulllength">
					<h1>Activity Leaderboard</h1>
					<p>Automatically post a leaderboard of the most active members on a schedule, and optionally reward the top performer.</p>
					<h2>Enable Activity Leaderboard</h2>
					<label class="slider" style="margin-top: 5px">
						<input type="checkbox" bind:checked={s.activityLeaderboard.enabled} /><span class="sliderspan"></span>
					</label>
				</div>

				{#if s.activityLeaderboard?.enabled}
					<div class="settingBox box">
						<h2>Post channel</h2>
						<p class="details">Channel to post the activity leaderboard in.</p>
						<select bind:value={s.activityLeaderboard.channelId}>
							<option value="">(None)</option>
							{#each channels as ch}<option value={ch.id}>#{ch.name}</option>{/each}
						</select>
					</div>

					<div class="settingBox box">
						<h2>Reward log channel</h2>
						<p class="details">Channel to log role reward changes from activity rankings.</p>
						<select bind:value={s.activityLeaderboard.rewardLogChannelId}>
							<option value="">(None)</option>
							{#each channels as ch}<option value={ch.id}>#{ch.name}</option>{/each}
						</select>
					</div>

					<div class="settingBox box">
						<h2>Post interval</h2>
						<p class="details">How often to post the leaderboard.</p>
						<select bind:value={s.activityLeaderboard.interval}>
							<option value={4}>Every 4 hours</option>
							<option value={6}>Every 6 hours</option>
							<option value={8}>Every 8 hours</option>
							<option value={12}>Every 12 hours</option>
							<option value={24}>Every 24 hours</option>
						</select>
					</div>

					<div class="settingBox box">
						<h2>Top role reward</h2>
						<p class="details">Role temporarily given to the #1 most active member each interval.</p>
						<select bind:value={s.activityLeaderboard.topRoleId}>
							<option value="">(None)</option>
							{#each roles as r}<option value={r.id} style="color: {roleColor(r.color)}">{r.name}</option>{/each}
						</select>
					</div>

					<div class="settingBox box">
						<h2>Top credits reward</h2>
						<p class="details">Credits awarded to the #1 most active member each interval (0 = disabled).</p>
						<input type="number" bind:value={s.activityLeaderboard.topCredits} min="0" style="width: 120px" />
					</div>
				{/if}
			</div>
		{/if}

		<!-- ── DAILY QUESTS ─────────────────────────────────────────────────── -->
		{#if activeCategory === 'quests'}
			<div class="configboxes">
				<div class="settingBox box fulllength">
					<h1>Daily Quests</h1>
					<p>Give members 3 random quests every day (Easy / Medium / Hard). Completing quests earns credits. Complete all 3 for a bonus reward.</p>
					<h2>Enable Daily Quests</h2>
					<label class="slider" style="margin-top: 5px">
						<input type="checkbox" bind:checked={s.quests.enabled} /><span class="sliderspan"></span>
					</label>
				</div>
				<div class="settingBreak"></div>

				{#if s.quests?.enabled}
					<!-- ── Rewards ── -->
					<div class="settingBox box fulllength">
						<div class="simpleflex">
							<div class="sideoption">
								<h2>Easy reward</h2>
								<p class="details">Credits for completing the Easy quest.</p>
								<input type="number" bind:value={s.quests.rewardEasy} min="0" max="100000" style="width: 120px" />
							</div>
							<div class="sideoption">
								<h2>Medium reward</h2>
								<p class="details">Credits for completing the Medium quest.</p>
								<input type="number" bind:value={s.quests.rewardMedium} min="0" max="100000" style="width: 120px" />
							</div>
							<div class="sideoption">
								<h2>Hard reward</h2>
								<p class="details">Credits for completing the Hard quest.</p>
								<input type="number" bind:value={s.quests.rewardHard} min="0" max="100000" style="width: 120px" />
							</div>
						</div>
					</div>

					<div class="settingBox box">
						<h2>3/3 Bonus</h2>
						<p class="details">Credits awarded when all 3 quests are completed in one day.</p>
						<input type="number" bind:value={s.quests.rewardBonus} min="0" max="100000" style="width: 120px" />
					</div>

					<div class="settingBox box">
						<h2>Quest streak bonus</h2>
						<p class="details">Multiplier added to the 3/3 bonus per consecutive day of completing all quests.<br/>Bonus = base × (1 + multiplier × min(streak, cap))</p>
						<div class="centerflex spacedflex">
							<p>+</p>
							<input type="number" bind:value={s.quests.streakBonusMultiplier} min="0" max="5" step="0.05" style="width: 80px" />
							<p>× per day, capped at</p>
							<input type="number" bind:value={s.quests.streakBonusCap} min="0" max="365" style="width: 80px" />
							<p>days</p>
						</div>
					</div>

					<!-- ── Rerolls ── -->
					<div class="settingBox box">
						<h2>Rerolls per day</h2>
						<p class="details">How many times a member can reroll a quest per day (0 = disabled).</p>
						<input type="number" bind:value={s.quests.rerollsPerDay} min="0" max="10" style="width: 80px" />
					</div>

					<div class="settingBox box">
						<h2>Reroll cost</h2>
						<p class="details">Credits deducted to reroll one quest.</p>
						<input type="number" bind:value={s.quests.rerollCost} min="0" max="100000" style="width: 120px" />
					</div>

					<!-- ── Announce channel ── -->
					<div class="settingBox box">
						<h2>Announce channel</h2>
						<p class="details">Post a public message when someone completes all 3 quests (optional).</p>
						<select bind:value={s.quests.announceChannelId}>
							<option value="">(None)</option>
							{#each channels as ch}<option value={ch.id}>#{ch.name}</option>{/each}
						</select>
					</div>

					<div class="settingBreak"></div>

					<!-- ── Quest Pool Editor ── -->
					<div class="settingBox box fulllength">
						<h1>Quest Pool</h1>
						<p>Define which quests can be rolled each day. Members get 1 Easy, 1 Medium, and 1 Hard quest randomly drawn from the pool below.</p>
						<p class="details">Use <b>{'{'}target{'}'}</b> in descriptions — it's replaced with the randomly rolled number.</p>

						<!-- Preset loader -->
						{#if Object.keys(questPresets).length}
							<div class="centerflex spacedflex" style="margin-top: 15px; flex-wrap: wrap; gap: 8px">
								<p style="margin: 0"><b>Load preset:</b></p>
								<select bind:value={selectedQuestPreset} style="width: 220px">
									<option value="" disabled selected>(Select preset)</option>
									{#each Object.entries(questPresets) as [key, preset]}
										<option value={key}>{preset.name}</option>
									{/each}
								</select>
								{#if selectedQuestPreset}
									<p class="details" style="margin: 0; font-style: italic">{questPresets[selectedQuestPreset]?.description}</p>
									<button style="background-color: var(--emojiblue)" on:click={loadQuestPreset}>Load preset</button>
								{/if}
								<button style="background-color: var(--emojired)" on:click={() => { if(confirm('Clear all quests from the pool?')) questTemplates = [] }}>Clear pool</button>
							</div>
						{/if}
					</div>

					<!-- Add quest form -->
					<div class="settingBox box fulllength">
						<h2>Add quest</h2>
						<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin-top: 10px">
							<div>
								<p class="details" style="margin-bottom: 4px">Tier</p>
								<select bind:value={newQuestTier} style="width: 100%">
									<option value="easy">🟢 Easy</option>
									<option value="medium">🟡 Medium</option>
									<option value="hard">🔴 Hard</option>
								</select>
							</div>
							<div>
								<p class="details" style="margin-bottom: 4px">ID (a-z, 0-9, _)</p>
								<input type="text" bind:value={newQuestId} placeholder="msg_25" style="width: 100%" maxlength="40" />
							</div>
							<div>
								<p class="details" style="margin-bottom: 4px">Label</p>
								<input type="text" bind:value={newQuestLabel} placeholder="Chatterbox" style="width: 100%" maxlength="40" />
							</div>
							<div>
								<p class="details" style="margin-bottom: 4px">Event type</p>
								<select bind:value={newQuestEventType} style="width: 100%">
									{#each VALID_EVENT_TYPES as et}
										<option value={et}>{EVENT_TYPE_LABELS[et] || et}</option>
									{/each}
								</select>
							</div>
							<div>
								<p class="details" style="margin-bottom: 4px">Target min</p>
								<input type="number" bind:value={newQuestTargetMin} min="1" max="1000000" style="width: 100%" />
							</div>
							<div>
								<p class="details" style="margin-bottom: 4px">Target max</p>
								<input type="number" bind:value={newQuestTargetMax} min="1" max="1000000" style="width: 100%" />
							</div>
						</div>
						<div style="margin-top: 10px">
							<p class="details" style="margin-bottom: 4px">Description (use {'{'}target{'}'} for the number)</p>
							<input type="text" bind:value={newQuestDescription} placeholder="Send {'{'}target{'}'} messages" style="width: 100%; max-width: 600px" maxlength="120" />
						</div>
						<button style="margin-top: 12px; background-color: var(--emojigreen)" on:click={addQuestTemplate}>Add quest</button>
					</div>

					<!-- Pool table -->
					<div class="settingBox box fulllength">
						<h2 style="margin-bottom: 15px">Quest pool ({questTemplates.length} quests)</h2>
						{#if questTemplates.length}
							<div style="overflow-x: auto">
								<table style="width: 100%; border-collapse: collapse; font-size: 0.9em">
									<thead>
										<tr style="text-align: left; border-bottom: 1px solid rgba(255,255,255,0.15)">
											<th style="padding: 6px 8px">Tier</th>
											<th style="padding: 6px 8px">ID</th>
											<th style="padding: 6px 8px">Label</th>
											<th style="padding: 6px 8px">Description</th>
											<th style="padding: 6px 8px">Event</th>
											<th style="padding: 6px 8px">Target range</th>
											<th style="padding: 6px 8px">Edit</th>
											<th style="padding: 6px 8px">Delete</th>
										</tr>
									</thead>
									<tbody>
										{#each questTemplates as qt, i}
											{#if editingQuestIndex === i}
												<tr style="background: rgba(255,255,255,0.05)">
													<td style="padding: 6px 8px">
														<select bind:value={editingQuestData.tier} style="width: 90px">
															<option value="easy">🟢 Easy</option>
															<option value="medium">🟡 Med</option>
															<option value="hard">🔴 Hard</option>
														</select>
													</td>
													<td style="padding: 6px 8px">
														<input type="text" bind:value={editingQuestData.id} style="width: 110px" maxlength="40" />
													</td>
													<td style="padding: 6px 8px">
														<input type="text" bind:value={editingQuestData.label} style="width: 110px" maxlength="40" />
													</td>
													<td style="padding: 6px 8px">
														<input type="text" bind:value={editingQuestData.description} style="width: 200px" maxlength="120" />
													</td>
													<td style="padding: 6px 8px">
														<select bind:value={editingQuestData.eventType} style="width: 140px">
															{#each VALID_EVENT_TYPES as et}
																<option value={et}>{EVENT_TYPE_LABELS[et] || et}</option>
															{/each}
														</select>
													</td>
													<td style="padding: 6px 8px">
														<div class="centerflex spacedflex">
															<input type="number" bind:value={editingQuestData.targetMin} min="1" style="width: 70px" />
															<span>–</span>
															<input type="number" bind:value={editingQuestData.targetMax} min="1" style="width: 70px" />
														</div>
													</td>
													<td style="padding: 6px 8px">
														<button style="background-color: var(--emojigreen); padding: 4px 8px" on:click={saveEditQuest}>✔</button>
														<button style="margin-left: 4px; padding: 4px 8px" on:click={() => editingQuestIndex = -1}>✗</button>
													</td>
													<td></td>
												</tr>
											{:else}
												<tr style="border-bottom: 1px solid rgba(255,255,255,0.07)">
													<td style="padding: 6px 8px">{qt.tier === 'easy' ? '🟢 Easy' : qt.tier === 'medium' ? '🟡 Med' : '🔴 Hard'}</td>
													<td style="padding: 6px 8px; font-family: monospace; font-size: 0.85em; opacity: 0.75">{qt.id}</td>
													<td style="padding: 6px 8px"><b>{qt.label}</b></td>
													<td style="padding: 6px 8px; opacity: 0.85">{qt.description}</td>
													<td style="padding: 6px 8px; font-size: 0.85em">{EVENT_TYPE_LABELS[qt.eventType] || qt.eventType}</td>
													<td style="padding: 6px 8px">{qt.targetMin} – {qt.targetMax}</td>
													<td style="padding: 6px 8px"><span style="cursor: pointer" on:click={() => startEditQuest(i)}>✏️</span></td>
													<td style="padding: 6px 8px"><span class="deleteRow" style="cursor: pointer" on:click={() => removeQuestTemplate(qt.id)}>🗑️</span></td>
												</tr>
											{/if}
										{/each}
									</tbody>
								</table>
							</div>
						{:else}
							<p style="opacity: 60%">No quests in the pool yet. Add some above or load a preset.</p>
						{/if}
					</div>

					<!-- Live preview -->
					{#if questTemplates.length}
						<div class="settingBox box fulllength">
							<h2>Live preview</h2>
							<p class="details">A sample of what today's quests might look like for a member.</p>
							{#key questTemplates}
								{@const preview = rollQuestPreview(questTemplates, s.quests)}
								{#each preview as q}
									<div style="margin: 6px 0; padding: 8px 12px; background: rgba(255,255,255,0.05); border-radius: 6px">
										<b>{q.tier === 'easy' ? '🟢' : q.tier === 'medium' ? '🟡' : '🔴'} {q.tier.charAt(0).toUpperCase() + q.tier.slice(1)}: {q.label}</b>
										— {q.description} · <span style="opacity: 0.75">+{q.reward} credits</span>
									</div>
								{/each}
								{#if preview.length < 3}
									<p style="opacity: 60%; margin-top: 8px">⚠️ {3 - preview.length} tier{3 - preview.length === 1 ? '' : 's'} have no quests — add more to fill all 3 slots.</p>
								{/if}
							{/key}
						</div>
					{/if}
				{/if}
			</div>
		{/if}

		<!-- ── SHOP ──────────────────────────────────────────────────────────── -->
		{#if activeCategory === 'shop'}
			<div class="configboxes">
				<div class="settingBox box fulllength">
					<h1>Shop</h1>
					<p>Let members spend their credits to buy temporary Discord roles.</p>
					<h2>Enable Shop</h2>
					<label class="slider" style="margin-top: 5px">
						<input type="checkbox" bind:checked={s.shop.enabled} /><span class="sliderspan"></span>
					</label>
				</div>
				<div class="settingBreak"></div>

				{#if s.shop?.enabled}
					<!-- Add item form -->
					<div class="settingBox box fulllength">
						<h2>Add shop item</h2>
						<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; margin-top: 10px">
							<div>
								<p class="details" style="margin-bottom: 4px">Role</p>
								<select bind:value={newShopRoleId} style="width: 100%">
									<option value="" disabled selected>(Select role)</option>
									{#each roles as r}<option value={r.id}>{r.name}</option>{/each}
								</select>
							</div>
							<div>
								<p class="details" style="margin-bottom: 4px">Name</p>
								<input type="text" bind:value={newShopName} placeholder="VIP Pass" style="width: 100%" maxlength="100" />
							</div>
							<div>
								<p class="details" style="margin-bottom: 4px">Price (credits)</p>
								<input type="number" bind:value={newShopPrice} min="0" style="width: 100%" />
							</div>
							<div>
								<p class="details" style="margin-bottom: 4px">Duration (hours, 0 = permanent)</p>
								<input type="number" bind:value={newShopDuration} min="0" step="0.5" style="width: 100%" />
							</div>
							<div>
								<p class="details" style="margin-bottom: 4px">Emoji</p>
								<input type="text" bind:value={newShopEmoji} placeholder="🛒" style="width: 100%" maxlength="100" />
							</div>
						</div>
						<button style="margin-top: 12px; background-color: var(--emojigreen)" on:click={addShopItem}>Add item</button>
					</div>

					<!-- Items table -->
					<div class="settingBox box fulllength">
						<h2 style="margin-bottom: 15px">Shop items ({shopItems.length})</h2>
						{#if shopItems.length}
							<div style="overflow-x: auto">
								<table style="width: 100%; border-collapse: collapse; font-size: 0.9em">
									<thead>
										<tr style="text-align: left; border-bottom: 1px solid rgba(255,255,255,0.15)">
											<th style="padding: 6px 8px">Emoji</th>
											<th style="padding: 6px 8px">Name</th>
											<th style="padding: 6px 8px">Role</th>
											<th style="padding: 6px 8px">Price</th>
											<th style="padding: 6px 8px">Duration</th>
											<th style="padding: 6px 8px">Edit</th>
											<th style="padding: 6px 8px">Delete</th>
										</tr>
									</thead>
									<tbody>
										{#each shopItems as item, i}
											{#if editingShopIndex === i}
												<tr style="background: rgba(255,255,255,0.05)">
													<td style="padding: 6px 8px">
														<input type="text" bind:value={editingShopData.emoji} style="width: 70px" maxlength="100" />
													</td>
													<td style="padding: 6px 8px">
														<input type="text" bind:value={editingShopData.name} style="width: 130px" maxlength="100" />
													</td>
													<td style="padding: 6px 8px">
														<select bind:value={editingShopData.roleId} style="width: 140px">
															{#each roles as r}<option value={r.id}>{r.name}</option>{/each}
														</select>
													</td>
													<td style="padding: 6px 8px">
														<input type="number" bind:value={editingShopData.price} min="0" style="width: 90px" />
													</td>
													<td style="padding: 6px 8px">
														<input type="number" bind:value={editingShopData.duration} min="0" step="0.5" style="width: 90px" />
													</td>
													<td style="padding: 6px 8px">
														<button style="background-color: var(--emojigreen); padding: 4px 8px" on:click={saveEditShop}>✔</button>
														<button style="margin-left: 4px; padding: 4px 8px" on:click={() => editingShopIndex = -1}>✗</button>
													</td>
													<td></td>
												</tr>
											{:else}
												<tr style="border-bottom: 1px solid rgba(255,255,255,0.07)">
													<td style="padding: 6px 8px">{item.emoji || '—'}</td>
													<td style="padding: 6px 8px"><b>{item.name}</b></td>
													<td style="padding: 6px 8px">{roleName(item.roleId)}</td>
													<td style="padding: 6px 8px">{item.price} cr</td>
													<td style="padding: 6px 8px">{item.duration > 0 ? item.duration + 'h' : '∞ Permanent'}</td>
													<td style="padding: 6px 8px"><span style="cursor: pointer" on:click={() => startEditShop(i)}>✏️</span></td>
													<td style="padding: 6px 8px"><span class="deleteRow" style="cursor: pointer" on:click={() => removeShopItem(i)}>🗑️</span></td>
												</tr>
											{/if}
										{/each}
									</tbody>
								</table>
							</div>
						{:else}
							<p style="opacity: 60%">No shop items yet. Add one above.</p>
						{/if}
					</div>
				{/if}
			</div>
		{/if}

		<!-- ── CHESTS ─────────────────────────────────────────────────────────── -->
		{#if activeCategory === 'chests'}
			<div class="configboxes">
				<div class="settingBox box fulllength">
					<h1>Chests</h1>
					<p>Let members spend credits to open a chest and receive a random XP reward.</p>
					<h2>Enable Chests</h2>
					<label class="slider" style="margin-top: 5px">
						<input type="checkbox" bind:checked={s.chests.enabled} /><span class="sliderspan"></span>
					</label>
				</div>
				<div class="settingBreak"></div>

				{#if s.chests?.enabled}
					<!-- Add item form -->
					<div class="settingBox box fulllength">
						<h2>Add chest</h2>
						<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; margin-top: 10px">
							<div>
								<p class="details" style="margin-bottom: 4px">Name</p>
								<input type="text" bind:value={newChestName} placeholder="Silver Chest" style="width: 100%" maxlength="100" />
							</div>
							<div>
								<p class="details" style="margin-bottom: 4px">Emoji</p>
								<input type="text" bind:value={newChestEmoji} placeholder="📦" style="width: 100%" maxlength="100" />
							</div>
							<div>
								<p class="details" style="margin-bottom: 4px">Price (credits)</p>
								<input type="number" bind:value={newChestPrice} min="0" style="width: 100%" />
							</div>
							<div>
								<p class="details" style="margin-bottom: 4px">XP min</p>
								<input type="number" bind:value={newChestXpMin} min="0" max="1000000" style="width: 100%" />
							</div>
							<div>
								<p class="details" style="margin-bottom: 4px">XP max</p>
								<input type="number" bind:value={newChestXpMax} min="0" max="1000000" style="width: 100%" />
							</div>
						</div>
						<button style="margin-top: 12px; background-color: var(--emojigreen)" on:click={addChestItem}>Add chest</button>
					</div>

					<!-- Items table -->
					<div class="settingBox box fulllength">
						<h2 style="margin-bottom: 15px">Chests ({chestItems.length})</h2>
						{#if chestItems.length}
							<div style="overflow-x: auto">
								<table style="width: 100%; border-collapse: collapse; font-size: 0.9em">
									<thead>
										<tr style="text-align: left; border-bottom: 1px solid rgba(255,255,255,0.15)">
											<th style="padding: 6px 8px">Emoji</th>
											<th style="padding: 6px 8px">Name</th>
											<th style="padding: 6px 8px">Price</th>
											<th style="padding: 6px 8px">XP range</th>
											<th style="padding: 6px 8px">Edit</th>
											<th style="padding: 6px 8px">Delete</th>
										</tr>
									</thead>
									<tbody>
										{#each chestItems as item, i}
											{#if editingChestIndex === i}
												<tr style="background: rgba(255,255,255,0.05)">
													<td style="padding: 6px 8px">
														<input type="text" bind:value={editingChestData.emoji} style="width: 70px" maxlength="100" />
													</td>
													<td style="padding: 6px 8px">
														<input type="text" bind:value={editingChestData.name} style="width: 130px" maxlength="100" />
													</td>
													<td style="padding: 6px 8px">
														<input type="number" bind:value={editingChestData.price} min="0" style="width: 90px" />
													</td>
													<td style="padding: 6px 8px">
														<div class="centerflex spacedflex">
															<input type="number" bind:value={editingChestData.xpMin} min="0" max="1000000" style="width: 80px" />
															<span>–</span>
															<input type="number" bind:value={editingChestData.xpMax} min="0" max="1000000" style="width: 80px" />
														</div>
													</td>
													<td style="padding: 6px 8px">
														<button style="background-color: var(--emojigreen); padding: 4px 8px" on:click={saveEditChest}>✔</button>
														<button style="margin-left: 4px; padding: 4px 8px" on:click={() => editingChestIndex = -1}>✗</button>
													</td>
													<td></td>
												</tr>
											{:else}
												<tr style="border-bottom: 1px solid rgba(255,255,255,0.07)">
													<td style="padding: 6px 8px">{item.emoji || '—'}</td>
													<td style="padding: 6px 8px"><b>{item.name}</b></td>
													<td style="padding: 6px 8px">{item.price} cr</td>
													<td style="padding: 6px 8px">{item.xpMin} – {item.xpMax} XP</td>
													<td style="padding: 6px 8px"><span style="cursor: pointer" on:click={() => startEditChest(i)}>✏️</span></td>
													<td style="padding: 6px 8px"><span class="deleteRow" style="cursor: pointer" on:click={() => removeChestItem(i)}>🗑️</span></td>
												</tr>
											{/if}
										{/each}
									</tbody>
								</table>
							</div>
						{:else}
							<p style="opacity: 60%">No chests yet. Add one above.</p>
						{/if}
					</div>
				{/if}
			</div>
		{/if}

		<!-- ── COINFLIP ─────────────────────────────────────────────────────── -->
		{#if activeCategory === 'coinflip'}
			<div class="configboxes">
				<div class="settingBox box fulllength">
					<h1>Coinflip</h1>
					<p>Allow members to gamble credits with the <b>/coinflip</b> command. Requires the Shop &amp; Chests system to be active so members have a credit balance to wager.</p>
					<h2>Enable Coinflip</h2>
					<label class="slider" style="margin-top: 5px">
						<input type="checkbox" bind:checked={s.coinflip.enabled} /><span class="sliderspan"></span>
					</label>
				</div>
			</div>
		{/if}

		<!-- ── BUMP REWARDS ──────────────────────────────────────────────────── -->
		{#if activeCategory === 'bump'}
			<div class="configboxes">
				<div class="settingBox box fulllength">
					<h1>Bump Rewards</h1>
					<p>Reward members with credits when they bump the server on Disboard using <b>/bump</b>. The bot watches for the Disboard confirmation message in the configured channel.</p>
					<h2>Enable Bump Rewards</h2>
					<label class="slider" style="margin-top: 5px">
						<input type="checkbox" bind:checked={s.bump.enabled} /><span class="sliderspan"></span>
					</label>
				</div>

				{#if s.bump?.enabled}
					<div class="settingBox box">
						<h2>Bump channel</h2>
						<p class="details">Channel where members run /bump. The bot listens here for the Disboard confirmation.</p>
						<select bind:value={s.bump.channelId}>
							<option value="">(Select channel)</option>
							{#each channels as ch}<option value={ch.id}>#{ch.name}</option>{/each}
						</select>
					</div>

					<div class="settingBox box">
						<h2>Credits reward</h2>
						<p class="details">Credits awarded to the member who successfully bumps.</p>
						<input type="number" bind:value={s.bump.rewardCredits} min="0" max="1000000" style="width: 120px" />
					</div>

					<div class="settingBox box">
						<h2>Cooldown</h2>
						<p class="details">How long after a bump before the reward can be claimed again (matches Disboard's 2-hour cooldown by default).</p>
						<div class="centerflex spacedflex">
							<input type="number" bind:value={s.bump.cooldownSeconds} min="0" max="31536000" style="width: 110px" />
							<p>seconds</p>
						</div>
						<p class="details" style="margin-top: 4px">{Math.round((s.bump.cooldownSeconds || 0) / 60)} minutes / {((s.bump.cooldownSeconds || 0) / 3600).toFixed(2)} hours</p>
					</div>

					<div class="settingBox box">
						<h2>Disboard Bot ID</h2>
						<p class="details">Discord user ID of the Disboard bot. Change only if Disboard updates their bot ID.</p>
						<input type="text" bind:value={s.bump.disboardBotId} style="width: 220px" placeholder="302050872383242240" />
					</div>
				{/if}
			</div>
		{/if}

		<!-- ── SERVER STATS ──────────────────────────────────────────────────── -->
		{#if activeCategory === 'stats'}
			<div class="configboxes">
				<div class="settingBox box fulllength">
					<h1>Server Stats</h1>
					<p>Automatically post a daily activity report to a channel. The report shows how many members were active at different thresholds (daily, weekly, monthly, quarterly).</p>
					<h2>Enable Server Stats</h2>
					<label class="slider" style="margin-top: 5px">
						<input type="checkbox" bind:checked={s.stats.enabled} /><span class="sliderspan"></span>
					</label>
				</div>

				{#if s.stats?.enabled}
					<div class="settingBox box">
						<h2>Log channel</h2>
						<p class="details">Channel where the daily stats report is posted.</p>
						<select bind:value={s.stats.logChannelId}>
							<option value="">(None)</option>
							{#each channels as ch}<option value={ch.id}>#{ch.name}</option>{/each}
						</select>
					</div>

					<div class="settingBox box">
						<h2>Report hour (UTC)</h2>
						<p class="details">Hour of day (UTC 0–23) at which the daily report is posted.</p>
						<input type="number" bind:value={s.stats.reportHourUtc} min="0" max="23" style="width: 80px" />
					</div>

					<div class="settingBox box fulllength">
						<h2>Activity thresholds</h2>
						<p class="details">Minimum number of messages a member needs to send in each period to be counted as "active".</p>
						<div class="simpleflex" style="gap: 40px; flex-wrap: wrap; margin-top: 10px">
							<div class="field">
								<p style="margin-bottom: 4px; font-weight: bold">Daily</p>
								<input type="number" bind:value={s.stats.activeThresholdDaily} min="1" max="100000" style="width: 110px" />
							</div>
							<div class="field">
								<p style="margin-bottom: 4px; font-weight: bold">Weekly</p>
								<input type="number" bind:value={s.stats.activeThresholdWeekly} min="1" max="100000" style="width: 110px" />
							</div>
							<div class="field">
								<p style="margin-bottom: 4px; font-weight: bold">Monthly</p>
								<input type="number" bind:value={s.stats.activeThresholdMonthly} min="1" max="100000" style="width: 110px" />
							</div>
							<div class="field">
								<p style="margin-bottom: 4px; font-weight: bold">Quarterly</p>
								<input type="number" bind:value={s.stats.activeThresholdQuarterly} min="1" max="100000" style="width: 110px" />
							</div>
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<!-- ── ADVANCED ──────────────────────────────────────────────────────── -->
		{#if activeCategory === 'advanced'}
			<div class="configboxes">
				<div class="settingBox box fulllength" style="padding-bottom: 15px">
					<h1>Advanced Settings</h1>
				</div>

				<div class="settingBox box">
					<h2>Ignore Permissions</h2>
					<p class="details">Allows <b>anyone</b> to run moderator commands. Useful for custom slash command permissions.</p>
					<label class="slider" style="margin-top: 5px">
						<input type="checkbox" bind:checked={s.manualPerms} /><span class="sliderspan"></span>
					</label>
				</div>

				<div class="settingBox box">
					<h2>Maximum Level</h2>
					<p class="details">Highest level members can reach. (1000 by default)</p>
					<input type="number" bind:value={s.maxLevel} min="0" max="1000" style="width: 80px" />
				</div>

				<div class="settingBox box">
					<h2>Reset XP on Leave</h2>
					<p class="details">When a member leaves the server, their XP is reset to 0.</p>
					<label class="slider" style="margin-top: 5px">
						<input type="checkbox" bind:checked={s.resetXpOnLeave} /><span class="sliderspan"></span>
					</label>
				</div>

				<div class="settingBox box">
					<h2>Nickname Rank</h2>
					<p class="details">Show member's rank in their nickname (e.g. [#1] Username).</p>
					<label class="slider" style="margin-top: 5px">
						<input type="checkbox" bind:checked={s.nicknameRank} /><span class="sliderspan"></span>
					</label>
				</div>

				<div class="settingBox box">
					<h2>Custom /rank Embed Color</h2>
					<p class="details">Override the embed color for /rank. (uses member's role color by default)</p>
					<div class="centerflex" style="height: 45px">
						<label class="slider" style="margin-top: 5px">
							<input type="checkbox" bind:checked={useCustomRankColor} /><span class="sliderspan"></span>
						</label>
						{#if useCustomRankColor}
							<input type="text" class="colorInput" maxlength="7" bind:value={rankEmbedColor} placeholder="#00ff80" style="width: 100px; margin-left: 20px" />
							<input type="color" bind:value={rankEmbedColor} style="margin-left: 10px; width: 45px; height: 40px; cursor: pointer" />
						{/if}
					</div>
				</div>

				<div class="settingBox box">
					<h2>Custom /leaderboard Embed Color</h2>
					<p class="details">Override the embed color for /leaderboard. (Polaris green by default)</p>
					<div class="centerflex" style="height: 45px">
						<label class="slider" style="margin-top: 5px">
							<input type="checkbox" bind:checked={useCustomTopColor} /><span class="sliderspan"></span>
						</label>
						{#if useCustomTopColor}
							<input type="text" class="colorInput" maxlength="7" bind:value={topEmbedColor} placeholder="#00ff80" style="width: 100px; margin-left: 20px" />
							<input type="color" bind:value={topEmbedColor} style="margin-left: 10px; width: 45px; height: 40px; cursor: pointer" />
						{/if}
					</div>
				</div>
			</div>
		{/if}

	</div>
{/if}

<style>
	:global(input[type='checkbox']) {
		height: auto;
		width: auto;
	}

	/* Compact inputs/selects inside flex tables */
	:global(.flexTable div p:has(> input)),
	:global(.flexTable div p:has(> select)) {
		padding: 3px 8px !important;
		display: flex;
		align-items: center;
		gap: 4px;
	}
	:global(.flexTable input) {
		height: 34px !important;
		font-size: 15px !important;
		padding-left: 6px !important;
		padding-right: 4px !important;
	}

	/* Category box Lucide icon wrapper */
	:global(.categoryBox .catIcon) {
		display: flex;
		align-items: center;
		justify-content: center;
		margin-right: 18px;
		flex-shrink: 0;
		opacity: 0.9;
	}
</style>
