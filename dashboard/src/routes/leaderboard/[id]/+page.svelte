<script>
	// @ts-nocheck
	import { onMount } from 'svelte'
	import { page } from '$app/stores'
	import { apiFetch, loginButton } from '$lib/api.js'
	import { getLevel, xpForLevel, commafy, timeStr, getMultiplier, roleColor } from '$lib/xpMath.js'
	import { Trophy, UserRound, Sparkles, Shield, Coins, Activity } from 'lucide-svelte'

	const guildID = $page.params.id
	const CREDIT_LOG_DISPLAY_COUNT = 5

	let loading = true
	let errorCode = null
	let errorMsg = null
	let data = null
	let activeTab = 'leaderboard'
	let lbRows = []
	let rewardRows = []
	let allLevels = []
	let hiddenRows = []
	let memberIntel = null
	let membersText = ''
	let currentPage = 1
	let totalPages = 1
	let pageCache = {}
	let isUpdating = false
	let loadingPage = false

	let popup = null
	let popupUser = null
	let editType = 'addxp'
	let editAmount = 0
	let newXP = 0
	let oldXPDisplay = ''
	let newXPDisplay = ''
	let hideTargetUser = null

	function loggedIn() {
		return data && !data.user?.noLogin
	}

	function roleCol(col, fallback = 'white') {
		return roleColor(col, fallback)
	}

	function tabs() {
		return ['leaderboard', 'intel', 'perks', 'ops']
	}

	function tabLabel(t) {
		return {
			leaderboard: 'Leaderboard',
			intel: 'Member Intel',
			perks: 'Perks',
			ops: 'Ops'
		}[t] || t
	}

	function tabIcon(t) {
		return {
			leaderboard: Trophy,
			intel: UserRound,
			perks: Sparkles,
			ops: Shield
		}[t] || null
	}

	function buildRewardRows(dat) {
		if (!dat) return []
		return (dat.settings?.rewards || []).sort((a, b) => a.level - b.level).map((r) => {
			const role = dat.roles?.find((x) => x.id === r.id) || { name: `<@&${r.id}>`, color: 'white' }
			const roleXP = xpForLevel(r.level, dat.settings)
			const progress = !loggedIn() ? 0 : Math.min(((dat.user?.xp || 0) / roleXP) * 100, 100)
			const reached = progress >= 100
			const hasRole = loggedIn() && dat.user?.roles?.includes(r.id)
			return {
				name: role.name,
				color: roleCol(role.color),
				level: r.level,
				progress,
				reached,
				hasRole,
				statusText: !loggedIn()
					? `${commafy(roleXP)} XP required`
					: reached
						? hasRole ? 'Unlocked and active' : 'Unlocked'
						: `${+progress.toFixed(2)}% (${commafy(dat.user?.xp || 0)} / ${commafy(roleXP)} XP)`
			}
		})
	}

	function buildAllLevels(dat) {
		if (!dat) return []
		const rows = []
		const max = dat.settings?.maxLevel || 100
		const userXP = dat.user?.xp || 0
		const userLevel = getLevel(userXP, dat.settings)
		for (let i = 1; i <= max; i++) {
			const lvlXP = xpForLevel(i, dat.settings)
			const lvlProgress = !loggedIn() ? 0 : (userXP / lvlXP) * 100
			const reached = userLevel.level >= i
			rows.push({
				i,
				lvlXP,
				lvlProgress: Math.min(lvlProgress, 100),
				hue: (i * 360) / 100,
				reached,
				highlight: userLevel.level + 1 === i
			})
			if (i % 50 === 0 && lvlProgress < 1 && i > 50) break
		}
		return rows
	}

	function buildHiddenRows(dat) {
		if (!dat?.hiddenMembers?.length) return []
		return dat.hiddenMembers.map((x) => ({
			id: x.id,
			xp: x.xp,
			levelInfo: getLevel(x.xp, dat.settings)
		}))
	}

	function buildLeaderboardRows(dat, lb) {
		return lb.map((x) => {
			const xpInfo = getLevel(x.xp, dat.settings)
			const mult = getMultiplier(x.roles || [], dat.settings, dat.roles || [])
			const multRole = mult.roles.length === 1 ? dat.roles?.find((r) => r.id === mult.roles[0].id) : null
			return {
				...x,
				xpInfo,
				multText: mult.roles.length
					? mult.roles.length === 1
						? `${multRole?.name || '?'} - ${mult.boost}x XP`
						: `${mult.roles.length} roles - ${mult.boost}x XP`
					: null,
				multColor: multRole ? roleCol(multRole.color) : 'white',
				progressColor: x.missing ? 'rgba(108, 116, 136, 0.55)' : roleCol(x.color || '#6df7ff'),
				isSelf: x.id === dat.user?.id
			}
		})
	}

	function getCreditLabel(type) {
		return {
			streak: 'Daily streak reward',
			transfer_in: 'Received from member',
			transfer_out: 'Sent to member',
			admin: 'Admin adjustment',
			addcredits: 'Admin adjustment',
			giveaway: 'Giveaway win',
			activity: 'Activity reward',
			shop: 'Shop purchase',
			bump: 'Bump reward',
			coinflip: 'Coinflip',
			chests: 'Chest purchase',
			quest: 'Quest reward',
			quest_reroll: 'Quest reroll'
		}[type] || 'Other'
	}

	function formatRelativeTime(ts) {
		if (!ts || !Number.isFinite(ts)) return 'Never'
		const diff = Date.now() - ts
		if (diff < 0) return 'Just now'
		const minute = 60 * 1000
		const hour = 60 * minute
		const day = 24 * hour
		if (diff < minute) return 'Just now'
		if (diff < hour) return `${Math.floor(diff / minute)}m ago`
		if (diff < day) return `${Math.floor(diff / hour)}h ago`
		return `${Math.floor(diff / day)}d ago`
	}

	function buildMemberIntel(dat) {
		if (!loggedIn() || !dat.user?.xp) return null
		const levelInfo = getLevel(dat.user.xp, dat.settings)
		const mult = getMultiplier(dat.user?.roles || [], dat.settings, dat.roles || [])
		const obtainedRoles = (dat.settings?.rewards || []).filter((x) => x.level <= levelInfo.level).sort((a, b) => b.level - a.level)
		const topReward = obtainedRoles[0] ? dat.roles?.find((x) => x.id === obtainedRoles[0].id) : null
		const xpToNext = levelInfo.level >= dat.settings.maxLevel ? 0 : Math.max(0, levelInfo.xpRequired - dat.user.xp)
		const minXP = Math.round(dat.settings.gain.min * mult.boost)
		const maxXP = Math.round(dat.settings.gain.max * mult.boost)
		const estMin = xpToNext === 0 ? 0 : Math.ceil(xpToNext / Math.max(1, maxXP))
		const estMax = xpToNext === 0 ? 0 : Math.ceil(xpToNext / Math.max(1, minXP))
		const details = dat.user.details || {}
		const hasDetails = details.hasData !== false
		const safeCredits = Number.isFinite(details.credits) ? details.credits : null
		const rawDailyXp = Math.max(0, Math.floor(details.activityXpAccumulated || 0))
		const msgXpRaw = Math.floor(details.msgXp || 0)
		const msgXp = rawDailyXp > 0 ? Math.min(msgXpRaw, rawDailyXp) : 0
		const vcXp = Math.max(0, rawDailyXp - msgXp)
		const msgPercent = rawDailyXp > 0 ? (msgXp / rawDailyXp) * 100 : 0
		const vcPercent = rawDailyXp > 0 ? (vcXp / rawDailyXp) * 100 : 0
		const streak = details.streak || { count: 0, highest: 0, lastClaim: 0 }
		const milestones = Array.isArray(dat.settings?.streak?.milestones) ? dat.settings.streak.milestones : []
		const nextMilestone = milestones.filter((m) => m.days > streak.count).sort((a, b) => a.days - b.days)[0]

		return {
			avatar: dat.user.avatar,
			name: dat.user.nickname || dat.user.displayName || dat.user.username,
			color: roleCol(dat.user.color),
			levelInfo,
			xp: dat.user.xp,
			ranking: dat.user.hidden ? 'Hidden from leaderboard (auto-unhides after future XP gains).' : `Rank #${commafy(dat.user.rank)} in ${dat.guild?.name || 'this server'}`,
			progressPercent: +levelInfo.percentage.toFixed(2),
			prevXP: levelInfo.previousLevel,
			sincePrev: dat.user.xp - levelInfo.previousLevel,
			xpToNext,
			messagesToLevel: xpToNext === 0 ? 'Max level reached' : estMax === estMin ? commafy(estMax) : `${commafy(estMax)} - ${commafy(estMin)}`,
			xpPerMessage: minXP === maxXP ? commafy(minXP) : `${commafy(minXP)} - ${commafy(maxXP)}`,
			cooldown: timeStr(dat.settings.gain.time * 1000),
			multiplierText: dat.settings.hideMultipliers ? 'Hidden by server' : `${mult.boost}x XP`,
			topReward: topReward ? { name: topReward.name, color: roleCol(topReward.color) } : null,
			rewardCount: `${commafy(obtainedRoles.length)} / ${commafy(dat.settings?.rewards?.length || 0)}`,
			hasDetails,
			credits: safeCredits,
			creditLogs: (details.creditLogs || []).slice(-CREDIT_LOG_DISPLAY_COUNT).reverse().map((log) => ({
				type: getCreditLabel(log.type),
				amount: `${log.amount >= 0 ? '+' : ''}${commafy(log.amount || 0)}`,
				time: log.ts ? `<t:${Math.floor(log.ts / 1000)}:R>` : 'Unknown',
				note: log.note || ''
			})),
			rawDailyXp,
			msgXp,
			vcXp,
			msgPercent,
			vcPercent,
			lastXpGain: formatRelativeTime(Number(details.lastXpGain)),
			streak,
			nextMilestone,
			hasAnyActivitySignal: rawDailyXp > 0 || Number(details.lastXpGain || 0) > 0 || streak.count > 0
		}
	}

	function updateRankedCount(dat) {
		const { members, totalRanked, totalPartial } = dat.guild || {}
		return members !== undefined
			? `${commafy(members)} members • ${commafy(totalRanked)}${totalPartial ? '+' : ''} ranked`
			: ''
	}

	function hydrate(res) {
		data = res
		totalPages = res.pageInfo.pageCount
		membersText = updateRankedCount(res)
		lbRows = buildLeaderboardRows(res, res.leaderboard)
		rewardRows = buildRewardRows(res)
		allLevels = buildAllLevels(res)
		hiddenRows = buildHiddenRows(res)
		memberIntel = buildMemberIntel(res)
	}

	async function setPage(pg, force = false) {
		if (!force && loadingPage) return
		loadingPage = true
		const targetPage = Math.max(1, Math.min(pg || 1, totalPages))
		if (!force && targetPage === currentPage) {
			loadingPage = false
			return
		}
		currentPage = targetPage
		const res = !force && pageCache[currentPage]
			? pageCache[currentPage]
			: await apiFetch(`/api/leaderboard/${guildID}?page=${currentPage}`)
		pageCache[res.pageInfo.page] = res
		lbRows = buildLeaderboardRows(data, res.leaderboard)
		if (res.hiddenMembers) hiddenRows = buildHiddenRows({ ...data, hiddenMembers: res.hiddenMembers })
		if (res.guild) membersText = updateRankedCount(res)
		loadingPage = false
	}

	onMount(async () => {
		const res = await apiFetch(`/api/leaderboard/${guildID}`).catch((e) => {
			errorCode = e.data?.code
			errorMsg = e.message
			return null
		})
		if (!res) {
			loading = false
			return
		}
		pageCache[res.pageInfo.page] = res
		hydrate(res)
		loading = false
	})

	function openEditPopup(row) {
		if (!data?.moderator || isUpdating) return
		popupUser = row
		const defaultAdd = data.settings.gain.max * 10
		const oldLevel = getLevel(row.xp, data.settings)
		editType = 'addxp'
		editAmount = defaultAdd
		newXP = row.xp + defaultAdd
		oldXPDisplay = `${commafy(row.xp)} (Level ${commafy(oldLevel.level)})`
		updateNewXPDisplay()
		popup = 'editxp'
	}

	function recalcNewXP() {
		if (!popupUser) return
		const amt = +editAmount || 0
		const oldLevel = getLevel(popupUser.xp, data.settings)
		switch (editType) {
			case 'addxp': newXP = popupUser.xp + amt; break
			case 'setxp': newXP = amt; break
			case 'addlevel': newXP = xpForLevel(oldLevel.level + amt, data.settings); break
			case 'setlevel': newXP = xpForLevel(amt, data.settings); break
		}
		newXP = Math.max(0, Math.min(newXP, 1e12 - 1))
		updateNewXPDisplay()
	}

	function resetEditAmount() {
		if (!popupUser) return
		const oldLevel = getLevel(popupUser.xp, data.settings)
		const defaultAdd = data.settings.gain.max * 10
		switch (editType) {
			case 'addxp': editAmount = defaultAdd; break
			case 'setxp': editAmount = popupUser.xp; break
			case 'addlevel': editAmount = 10; break
			case 'setlevel': editAmount = oldLevel.level + 1; break
		}
		recalcNewXP()
	}

	function updateNewXPDisplay() {
		const lvl = getLevel(newXP, data.settings)
		newXPDisplay = `${commafy(newXP)} (Level ${commafy(lvl.level)})`
	}

	async function saveXP() {
		if (isUpdating || !popupUser) return
		if (newXP === popupUser.xp) {
			popup = null
			return
		}
		isUpdating = true
		try {
			await apiFetch('/api/editXP', {
				method: 'POST',
				body: JSON.stringify({ guildID, user: popupUser.id, xp: newXP })
			})
			pageCache = {}
			const refreshed = await apiFetch(`/api/leaderboard/${guildID}?page=${currentPage}`)
			pageCache[refreshed.pageInfo.page] = refreshed
			hydrate(refreshed)
		} catch (e) {
			alert(`Error! ${e.message}`)
		} finally {
			popup = null
			isUpdating = false
		}
	}

	function clickHide(e, row) {
		if (!data?.moderator) return
		e.stopPropagation()
		hideTargetUser = row
		if (e.shiftKey) confirmHide()
		else popup = 'confirmhide'
	}

	async function confirmHide() {
		if (isUpdating || !hideTargetUser) return
		isUpdating = true
		try {
			await apiFetch('/api/leaderboardHide', {
				method: 'POST',
				body: JSON.stringify({ guildID, user: hideTargetUser.id, hide: true })
			})
			pageCache = {}
			const refreshed = await apiFetch(`/api/leaderboard/${guildID}?page=${currentPage}`)
			pageCache[refreshed.pageInfo.page] = refreshed
			hydrate(refreshed)
		} catch (e) {
			alert(`Error! ${e.message}`)
		} finally {
			popup = null
			isUpdating = false
		}
	}

	async function unhide(row) {
		if (!data?.moderator || isUpdating) return
		isUpdating = true
		try {
			await apiFetch('/api/leaderboardHide', {
				method: 'POST',
				body: JSON.stringify({ guildID, user: row.id, hide: false })
			})
			pageCache = {}
			const refreshed = await apiFetch(`/api/leaderboard/${guildID}?page=${currentPage}`)
			pageCache[refreshed.pageInfo.page] = refreshed
			hydrate(refreshed)
		} catch (e) {
			alert(`Error! ${e.message}`)
		} finally {
			isUpdating = false
		}
	}

	function onKeydown(e) {
		if (!isUpdating && e.key === 'Escape') popup = null
	}
</script>

<svelte:head>
	<title>{data ? `Leaderboard for ${data.guild?.name}` : 'Leaderboard'}</title>
	<meta name="robots" content="noindex" />
</svelte:head>
<svelte:window on:keydown={onKeydown} />

{#if loading}
	<h2 class="middleflex">Loading leaderboard intel...</h2>
{:else if errorCode || !data}
	<div class="uhoh" id="uhoh">
		<h2 id="errorheader">
			{#if errorCode === 'invalidServer'}No leaderboard!
			{:else if errorCode === 'privateLeaderboard'}Private leaderboard!
			{:else if errorCode === 'xpDisabled'}XP disabled!
			{:else if errorCode === 'leaderboardDisabled'}Leaderboard disabled!
			{:else}Something went wrong
			{/if}
		</h2>
		<p id="errorfooter">{errorMsg || 'Unable to load leaderboard.'}</p>
		{#if errorCode === 'privateLeaderboard'}
			<button class="lb-cyber-btn" on:click={loginButton}>Log in</button>
		{/if}
	</div>
{:else}
	<main class="lb-cyber-shell">
		<section class="lb-cyber-hero">
			<h1>Leaderboard for {data.guild?.name}</h1>
			<p>{membersText}</p>
			{#if !loggedIn()}
				<button class="lb-cyber-btn" on:click={loginButton}>Log in for personal details</button>
			{/if}
		</section>

		<nav id="lbButtons" class="lb-cyber-tabs" aria-label="Leaderboard sections">
			{#each tabs() as t}
				<button
					class:selectedlb={activeTab === t}
					disabled={(t === 'intel' || t === 'ops') && !loggedIn() && t !== 'ops'}
					on:click={() => (activeTab = t)}
				>
					<svelte:component this={tabIcon(t)} size={16} />
					<span>{tabLabel(t)}</span>
				</button>
			{/each}
		</nav>

		{#if activeTab === 'leaderboard'}
			<div class="leaderboardBox lb-cyber-box">
				{#if lbRows.length === 0}
					<h2 class="lb-cyber-empty">Nobody is ranked yet.</h2>
				{:else}
					{#each lbRows as row}
						<!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_static_element_interactions -->
						<div
							class="leaderboardSlot lb-cyber-row"
							class:notInServer={row.missing}
							class:canManage={data.moderator}
							class:isSelf={row.isSelf}
							tabindex={data.moderator ? 0 : undefined}
							on:click={() => data.moderator && openEditPopup(row)}
							on:keydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') data.moderator && openEditPopup(row)
							}}
						>
							<div class="mainInfo lb-row-main">
								<h2 class="lb-rank">#{commafy(row.rank)}</h2>
								<div class="lb-avatar-wrap">
									<img src={row.avatar || '/assets/avatar.png'} alt="" />
								</div>
								<div class="generalInfo">
									<p class="lb-name" title={row.missing ? 'Not in server!' : `${row.displayName} (@${row.username})`}>
										{row.nickname || row.displayName || `<@${row.id}>`}
									</p>
									<div class="lb-subline">
										<p>Level {commafy(row.xpInfo.level)}</p>
										{#if row.missing}
											<p class="red">Not in server</p>
										{/if}
										{#if data.moderator && row.missing}
											<button class="red hideFromLeaderboard" on:click={(e) => clickHide(e, row)}>Hide member</button>
										{/if}
									</div>
								</div>
							</div>
							<div class="lb-row-progress">
								<div class="progressBar">
									<div class="progress" style={`background-color: ${row.progressColor}; width: ${row.xpInfo.percentage}%`}></div>
									<div class="xpOverlay">
										<p>{commafy(row.xp)} / {commafy(row.xpInfo.xpRequired)} XP ({+row.xpInfo.percentage.toFixed(2)}%)</p>
										{#if row.multText}<p style={`color: ${row.multColor}`}>{row.multText}</p>{/if}
									</div>
								</div>
							</div>
						</div>
					{/each}
				{/if}
			</div>

			{#if totalPages > 1}
				<div class="middleflex lb-cyber-pagination">
					<button class="lb-cyber-btn" disabled={currentPage <= 1} on:click={() => setPage(currentPage - 1)}>&lt;-</button>
					<p>Page <input type="number" min="1" max={totalPages} value={currentPage} on:change={(e) => setPage(+e.currentTarget.value)} /> of {totalPages}</p>
					<button class="lb-cyber-btn" disabled={currentPage >= totalPages} on:click={() => setPage(currentPage + 1)}>-&gt;</button>
				</div>
			{/if}
		{/if}

		{#if activeTab === 'intel'}
			{#if memberIntel}
				<section class="lb-intel-grid">
					<div class="leaderboardBox lb-cyber-box lb-intel-card lb-intro-card">
						<div class="lb-intro-head">
							<img src={memberIntel.avatar || '/assets/avatar.png'} alt="" />
							<div>
								<h2 style={`color: ${memberIntel.color}`}>{memberIntel.name}</h2>
								<p>{memberIntel.ranking}</p>
							</div>
						</div>
						<div class="progressBar">
							<div class="progress" style={`background-color: ${memberIntel.color}; width: ${memberIntel.progressPercent}%`}></div>
							<div class="xpOverlay">
								<p>{commafy(memberIntel.xp)} / {commafy(memberIntel.levelInfo.xpRequired)} XP</p>
							</div>
						</div>
						<p>Level {commafy(memberIntel.levelInfo.level)} • {memberIntel.progressPercent}%</p>
					</div>

					<div class="leaderboardBox lb-cyber-box lb-intel-card">
						<h2><Activity size={18} /> Progression</h2>
						<p>Previous level: <b>{commafy(memberIntel.prevXP)} XP</b></p>
						<p>Since previous: <b>{commafy(memberIntel.sincePrev)} XP</b></p>
						<p>To next level: <b>{memberIntel.xpToNext === 0 ? 'Max level reached' : `${commafy(memberIntel.xpToNext)} XP`}</b></p>
						<p>Messages to level: <b>{memberIntel.messagesToLevel}</b></p>
						<p>XP per message: <b>{memberIntel.xpPerMessage}</b></p>
						<p>Cooldown: <b>{memberIntel.cooldown}</b></p>
					</div>

					<div class="leaderboardBox lb-cyber-box lb-intel-card">
						<h2><Coins size={18} /> Credits</h2>
						<p class="lb-credit-balance">
							{#if memberIntel.credits === null}
								Unavailable
							{:else}
								{commafy(memberIntel.credits)} credits
							{/if}
						</p>
						{#if !memberIntel.hasDetails}
							<p>Detailed credit data could not be loaded for your profile yet.</p>
						{/if}
						{#if memberIntel.creditLogs.length === 0}
							<p>No credit transactions recorded yet.</p>
						{:else}
							<div class="lb-credit-log-list">
								{#each memberIntel.creditLogs as log}
									<div class="lb-credit-log">
										<p><b>{log.amount}</b> • {log.type}</p>
										<p>{log.time}</p>
										{#if log.note}<p>{log.note}</p>{/if}
									</div>
								{/each}
							</div>
						{/if}
					</div>

					<div class="leaderboardBox lb-cyber-box lb-intel-card">
						<h2><Sparkles size={18} /> Activity and Streak</h2>
						{#if !memberIntel.hasAnyActivitySignal}
							<p>No recent activity tracked yet for this profile.</p>
						{/if}
						<p>Daily boosted XP snapshot: <b>{commafy(memberIntel.rawDailyXp)}</b></p>
						<p>Message XP: <b>{commafy(memberIntel.msgXp)} ({memberIntel.msgPercent.toFixed(1)}%)</b></p>
						<p>Voice XP: <b>{commafy(memberIntel.vcXp)} ({memberIntel.vcPercent.toFixed(1)}%)</b></p>
						<p>Last XP gain: <b>{memberIntel.lastXpGain}</b></p>
						<p>Current streak: <b>{commafy(memberIntel.streak.count)}</b></p>
						<p>Highest streak: <b>{commafy(memberIntel.streak.highest || memberIntel.streak.count)}</b></p>
						{#if memberIntel.nextMilestone}
							<p>Next milestone: <b>{commafy(memberIntel.nextMilestone.days)} days</b></p>
						{/if}
					</div>
				</section>
			{:else}
				<h2 class="lb-cyber-empty">Log in and earn XP to unlock Member Intel.</h2>
			{/if}
		{/if}

		{#if activeTab === 'perks'}
			<div class="leaderboardBox lb-cyber-box">
				{#if data.settings?.leaderboard?.hideRoles && !rewardRows.length}
					<h2 class="lb-cyber-empty">Reward roles are hidden for this server.</h2>
				{:else if !rewardRows.length}
					<h2 class="lb-cyber-empty">No reward roles configured yet.</h2>
				{:else}
					{#each rewardRows as r}
						<div class="leaderboardSlot lb-cyber-row">
							<div class="mainInfo lb-row-main">
								<div class="generalInfo">
									<p class="lb-name" style={`color: ${r.color}`}>{r.name}</p>
									<p>Level {commafy(r.level)} reward</p>
								</div>
							</div>
							<div class="lb-row-progress">
								<div class="progressBar">
									<div class="progress" style={`width: ${r.progress}%; background-color: ${r.color}`}></div>
									<div class="xpOverlay"><p>{r.statusText}</p></div>
								</div>
							</div>
						</div>
					{/each}
				{/if}
			</div>
			<div class="leaderboardBox lb-cyber-box">
				{#each allLevels as lvl}
					<div class="leaderboardSlot lb-cyber-row" class:highlightedSlot={lvl.highlight}>
						<div class="mainInfo lb-row-main">
							<div class="generalInfo">
								<p class="lb-name" style={`color: hsl(${lvl.hue}, ${lvl.reached ? 90 : 70}%, ${lvl.reached ? 70 : 90}%)`}>Level {commafy(lvl.i)}</p>
								<p style={`color: hsl(${lvl.hue}, ${lvl.reached ? 90 : 70}%, ${lvl.reached ? 70 : 90}%)`}>{commafy(lvl.lvlXP)} XP</p>
							</div>
						</div>
						<div class="lb-row-progress">
							<div class="progressBar">
								<div class="progress" style={`background-color: hsl(${lvl.hue}, 100%, 50%); width: ${lvl.lvlProgress}%`}></div>
								<div class="xpOverlay"><p>{+lvl.lvlProgress.toFixed(2)}% reached</p></div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		{#if activeTab === 'ops'}
			{#if data.moderator}
				<div class="leaderboardBox lb-cyber-box">
					<h2>Moderator Operations</h2>
					<p>Click a leaderboard row to edit XP. Missing members can be hidden. Hidden members are listed below for unhide actions.</p>
				</div>
				{#if hiddenRows.length}
					<div class="emptyLbBox middleflex centerflex">
						{#each hiddenRows as h}
							<div class="hiddenMemberSlot">
								<p><b>ID:</b> {h.id}</p>
								<p>Level {commafy(h.levelInfo.level)} • {commafy(h.xp)} XP</p>
								<button on:click={() => unhide(h)} disabled={isUpdating}>Unhide</button>
							</div>
						{/each}
					</div>
				{/if}
			{:else}
				<h2 class="lb-cyber-empty">Ops is available to server moderators only.</h2>
			{/if}
		{/if}
	</main>

	{#if popup}
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="popup" style="display: flex" on:click={() => { if (!isUpdating) popup = null }}>
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<div class="popupbox" on:click|stopPropagation>
				<div class="box lb-cyber-box">
					{#if popup === 'editxp' && popupUser}
						<h2>{popupUser.missing ? 'Missing user' : popupUser.displayName}</h2>
						<p>@{popupUser.username}</p>
						<p>(ID: {popupUser.id})</p>
						<select bind:value={editType} on:change={resetEditAmount}>
							<option value="addxp">Add XP</option>
							<option value="setxp">Set XP to</option>
							<option value="addlevel">Add levels</option>
							<option value="setlevel">Set level to</option>
						</select>
						<input bind:value={editAmount} on:input={recalcNewXP} type="number" class="lineinput lb-edit-input" />
						<div class="middleflex"><p><b>Old XP:</b> {oldXPDisplay}</p></div>
						<div class="middleflex"><p><b>New XP:</b> {newXPDisplay}</p></div>
						<button class="popupConfirm" on:click={() => (popup = null)}>Cancel</button>
						<button class="popupConfirm" on:click={saveXP} disabled={isUpdating}>Save</button>
					{:else if popup === 'confirmhide'}
						<h2>Hide from Leaderboard?</h2>
						<p>This member will be removed from leaderboard ranking visibility until they gain more XP.</p>
						<button class="popupConfirm" on:click={() => (popup = null)}>Cancel</button>
						<button class="popupConfirm" on:click={confirmHide} disabled={isUpdating}>Confirm</button>
					{/if}
				</div>
			</div>
		</div>
	{/if}
{/if}
