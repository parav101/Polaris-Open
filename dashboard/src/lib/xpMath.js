// @ts-nocheck
/**
 * Convert an XP value to a level using the cubic curve.
 * Returns full level info including percentage progress and XP thresholds.
 * @param {number} xp
 * @param {{ curve: { 1: number, 2: number, 3: number }, rounding: number, maxLevel: number }} settings
 * @returns {{ level: number, xpRequired: number, previousLevel: number, percentage: number }}
 */
export function getLevel(xp, settings) {
	let lvl = 0
	let previousLevel = 0
	let xpRequired = 0
	while (xp >= xpRequired && lvl <= (settings.maxLevel || 100)) {
		lvl++
		previousLevel = xpRequired
		xpRequired = xpForLevel(lvl, settings)
	}
	lvl--
	const percentage = lvl >= (settings.maxLevel || 100)
		? 100
		: (xp - previousLevel) / (xpRequired - previousLevel) * 100
	return { level: lvl, xpRequired, previousLevel, percentage }
}

/**
 * Convert a level to the minimum XP required using the cubic curve.
 * @param {number} level
 * @param {{ curve: { 1: number, 2: number, 3: number }, rounding: number, maxLevel?: number }} settings
 * @returns {number}
 */
export function xpForLevel(level, settings) {
	if (settings.maxLevel && level > settings.maxLevel) level = settings.maxLevel
	const c = settings.curve
	const raw = Object.entries(c).reduce((total, [exp, coef]) => total + coef * level ** Number(exp), 0)
	const r = settings.rounding > 1 ? settings.rounding : 1
	return r > 1 ? r * Math.round(raw / r) : raw
}

/**
 * Format a number with locale separators.
 * @param {number} n
 * @returns {string}
 */
export function commafy(n) {
	if (isNaN(n)) return '0'
	return (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 8 })
}

/**
 * Convert milliseconds to a human-readable duration string.
 * @param {number} ms
 * @returns {string}
 */
export function timeStr(ms) {
	const s = Math.floor(ms / 1000)
	if (s < 60) return `${s}s`
	const m = Math.floor(s / 60)
	if (m < 60) return `${m}m ${s % 60}s`
	const h = Math.floor(m / 60)
	if (h < 24) return `${h}h ${m % 60}m`
	const d = Math.floor(h / 24)
	return `${d}d ${h % 24}h`
}

/**
 * Resolve the effective XP multiplier for a member given their role IDs.
 * Returns { roles: [], boost: number } — boost 0 or negative means XP is blocked.
 * @param {string[]} memberRoleIds
 * @param {object} settings - full settings object
 * @param {Array<{id:string,name:string,color:string}>} roleList - all guild roles in order
 * @returns {{ roles: object[], boost: number }}
 */
export function getMultiplier(memberRoleIds, settings, roleList = []) {
	const roleMults = settings.multipliers?.roles || []
	const priority = settings.multipliers?.rolePriority || 'largest'

	const roleBoosts = roleMults.filter(r => memberRoleIds.includes(r.id))
	if (!roleBoosts.length) return { roles: [], boost: 1 }

	const xpBan = roleBoosts.find(r => r.boost <= 0)
	if (xpBan) return { roles: [xpBan], boost: 0 }

	let foundBoosts
	switch (priority) {
		case 'smallest':
			foundBoosts = [roleBoosts.sort((a, b) => a.boost - b.boost)[0]]
			break
		case 'highest': {
			const topRole = roleList.find(r => roleBoosts.find(b => b.id === r.id))
			foundBoosts = [roleBoosts.find(b => b.id === topRole?.id) || roleBoosts[0]]
			break
		}
		case 'combine':
			foundBoosts = roleBoosts
			break
		case 'add':
			foundBoosts = roleBoosts.filter(r => r.boost !== 1)
			break
		default: // largest
			foundBoosts = [roleBoosts.sort((a, b) => b.boost - a.boost)[0]]
	}

	if (priority === 'combine') {
		const combined = Math.min(foundBoosts.map(r => r.boost).reduce((a, b) => a * b, 1), 1_000_000)
		return { roles: foundBoosts, boost: Number(combined.toFixed(4)) }
	}
	if (priority === 'add') {
		const summed = foundBoosts.length === 1
			? foundBoosts[0].boost
			: foundBoosts.map(r => r.boost).reduce((a, b) => a + (b - 1), 1)
		return { roles: foundBoosts, boost: Math.max(0, Number(Number(summed).toFixed(4))) }
	}
	return { roles: foundBoosts, boost: Number(foundBoosts[0].boost.toFixed(4)) }
}

/**
 * Convert a Discord colour integer or hex string to a CSS hex string.
 * Returns a fallback colour if the value is falsy or pure black (#000000).
 * @param {number|string} color
 * @param {string} [fallback]
 * @returns {string}
 */
export function roleColor(color, fallback = 'white') {
	if (!color) return fallback
	const hex = typeof color === 'number' ? '#' + color.toString(16).padStart(6, '0') : color
	return hex === '#000000' ? fallback : hex
}

