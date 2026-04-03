<script>
	// @ts-nocheck
	import { onMount } from 'svelte'
	import { page } from '$app/stores'
	import { apiFetch, loginButton } from '$lib/api.js'
	import { getLevel, xpForLevel, commafy, timeStr, getMultiplier, roleColor } from '$lib/xpMath.js'
	import { Trophy, User, Award, BarChart2, EyeOff } from 'lucide-svelte'

	const guildID = $page.params.id

	// ── state ──────────────────────────────────────────────────────────────────
	let loading = true
	let errorCode = null
	let errorMsg = null
	let data = null          // initial API response
	let activeTab = 'leaderboard'
	let lbRows = []          // rendered leaderboard rows for current page
	let currentPage = 1
	let totalPages = 1
	let pageCache = {}
	let isUpdating = false
	let loadingPage = false

	// XP edit popup
	let popup = null         // 'editxp' | 'confirmhide'
	let popupUser = null
	let editType = 'addxp'
	let editAmount = 0
	let newXP = 0
	let oldXPDisplay = ''
	let newXPDisplay = ''

	// hide popup
	let hideTargetUser = null

	// ── helpers ─────────────────────────────────────────────────────────────────
	function tabs() {
		const base = ['leaderboard', 'rank', 'roles', 'levels']
		return base
	}

	function tabLabel(t) {
		return { leaderboard: 'Leaderboard', rank: 'Your Rank', roles: 'Reward Roles', levels: 'All Levels', hidden: 'Hidden Members' }[t] || t
	}

	function tabIcon(t) {
		return { leaderboard: Trophy, rank: User, roles: Award, levels: BarChart2, hidden: EyeOff }[t] || null
	}

	function showHiddenTab(dat) {
		return dat?.hiddenMembers?.length > 0
	}

	function loggedIn() {
		return data && !data.user?.noLogin
	}

	function roleCol(col, fallback = 'white') {
		return roleColor(col, fallback)
	}

	// ── leveling data ─────────────────────────────────────────────────────────
	let userLevel = null
	let userColor = 'white'
	let userMultiplier = { roles: [], boost: 1 }
	let allLevels = []
	let rewardRows = []
	let hiddenRows = []
	let accountInfo = null

	function buildRewardRows(dat) {
		if (!dat) return []
		return (dat.settings?.rewards || []).sort((a, b) => a.level - b.level).map(r => {
			const role = dat.roles?.find(x => x.id === r.id) || { name: `<@&${r.id}>`, color: 'white' }
			const roleXP = xpForLevel(r.level, dat.settings)
			const progress = (!loggedIn() || !dat.user?.id) ? 0 : Math.min((dat.user.xp / roleXP) * 100, 100)
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
					? `${commafy(roleXP)} XP`
					: reached
						? (hasRole ? 'Obtained!' : 'Reached!')
						: `${+progress.toFixed(2)}% reached (${commafy(dat.user?.xp || 0)} / ${commafy(roleXP)} XP)`
			}
		})
	}

	function buildAllLevels(dat) {
		if (!dat) return []
		const rows = []
		const max = dat.settings?.maxLevel || 100
		for (let i = 1; i <= max; i++) {
			const lvlXP = xpForLevel(i, dat.settings)
			const lvlProgress = (!loggedIn() || !dat.user?.xp) ? 0 : dat.user.xp / lvlXP * 100
			const hue = i * 360 / 100
			const reached = userLevel && userLevel.level >= i
			if (i % 50 === 0 && lvlProgress < 1 && i > 50) break
			rows.push({
				i, lvlXP, lvlProgress: Math.min(lvlProgress, 100),
				hue, reached,
				highlight: userLevel && i === userLevel.level + 1
			})
		}
		return rows
	}

	function buildHiddenRows(dat) {
		if (!dat?.hiddenMembers?.length) return []
		return dat.hiddenMembers.map(x => ({
			id: x.id,
			xp: x.xp,
			levelInfo: getLevel(x.xp, dat.settings)
		}))
	}

	function buildAccountInfo(dat) {
		if (!loggedIn() || !dat.user?.xp) return null
		const ul = userLevel
		const um = userMultiplier
		const uc = roleCol(dat.user.color)

		const obtainedRoles = (dat.settings?.rewards || []).filter(x => x.level <= ul.level).sort((a, b) => b.level - a.level)
		const topRole = obtainedRoles[0] ? dat.roles?.find(x => x.id === obtainedRoles[0].id) : null
		const minXP = Math.round(dat.settings.gain.min * um.boost)
		const maxXP = Math.round(dat.settings.gain.max * um.boost)
		const xpToNext = ul.level >= dat.settings.maxLevel ? null : Math.max(0, ul.xpRequired - dat.user.xp)
		const estMin = xpToNext === null ? 0 : Math.ceil(xpToNext / (dat.settings.gain.max * um.boost))
		const estMax = xpToNext === null ? 0 : Math.ceil(xpToNext / (dat.settings.gain.min * um.boost))
		const estRange = xpToNext === null ? 'N/A'
			: estMax === estMin ? commafy(estMax)
			: `${commafy(estMax)} – ${commafy(estMin)} (avg. ${commafy(Math.round((estMax + estMin) / 2))})`

		let multiplierText = dat.settings.hideMultipliers ? 'Hidden' : 'None (1x XP)'
		let multiplierColor = 'white'
		if (um.roles.length) {
			if (um.roles.length === 1) {
				const r = dat.roles?.find(x => x.id === um.roles[0].id)
				multiplierText = `${r?.name || '?'} (${um.boost}x XP)`
				multiplierColor = roleCol(r?.color)
			} else {
				multiplierText = `${um.roles.length} roles (${um.boost}x XP)`
			}
		}

		return {
			avatar: dat.user.avatar,
			name: dat.user.nickname || dat.user.displayName,
			color: uc,
			level: ul.level, percentage: +ul.percentage.toFixed(2),
			xp: dat.user.xp, xpRequired: ul.xpRequired,
			prevXP: ul.previousLevel,
			sincePrev: dat.user.xp - ul.previousLevel,
			toNext: xpToNext === null ? 'Max level! 🎉' : commafy(xpToNext) + ' XP',
			ranking: dat.user.hidden
				? 'Hidden from server leaderboard. Gain XP to be automatically unhidden!'
				: `Ranked #${dat.user.rank} in ${dat.guild?.name || '?'}`,
			topRole: topRole ? { name: topRole.name, color: roleCol(topRole.color) } : null,
			totalRoles: `${commafy(obtainedRoles.length)} / ${commafy(dat.settings?.rewards?.length || 0)}`,
			xpPerMsg: (minXP === maxXP ? commafy(minXP) : `${commafy(minXP)} – ${commafy(maxXP)}`) + (dat.settings.hideMultipliers ? '?' : ''),
			cooldown: timeStr(dat.settings.gain.time * 1000),
			messages: estRange,
			multiplierText, multiplierColor,
			partial: dat.user.partial
		}
	}

	function buildLeaderboardRows(dat, lb) {
		return lb.map(x => {
			const xpInfo = getLevel(x.xp, dat.settings)
			const mult = getMultiplier(x.roles || [], dat.settings, dat.roles || [])
			const multRole = mult.roles.length === 1 ? dat.roles?.find(r => r.id === mult.roles[0].id) : null
			const multText = mult.roles.length
				? mult.roles.length === 1
					? `${multRole?.name || '?'} – ${mult.boost}x XP`
					: `${mult.roles.length} roles – ${mult.boost}x XP`
				: null
			const multColor = multRole ? roleCol(multRole.color) : 'white'

			return {
				...x,
				xpInfo,
				mult, multText, multColor,
				progressColor: x.missing ? 'rgba(118,126,137,0.5)' : roleCol(x.color || 'white'),
				isSelf: x.id === dat.user?.id,
				rankFontSize: x.rank > 999 ? '18px' : x.rank > 99 ? '20px' : '22px'
			}
		})
	}

	function updateRankedCount(dat) {
		const { members, totalRanked, totalPartial } = dat.guild || {}
		return members !== undefined
			? `${commafy(members)} member${members === 1 ? '' : 's'} \u00a0•\u00a0 ${commafy(totalRanked)}${totalPartial ? '+' : ''} ranked`
			: ''
	}

	let membersText = ''

	// ── page fetch ────────────────────────────────────────────────────────────
	async function setPage(pg, force = false) {
		if (!force && loadingPage) return
		loadingPage = true
		const oldPage = currentPage
		currentPage = Math.max(1, Math.min(pg || 1, totalPages))
		if (!force && currentPage === oldPage) { loadingPage = false; return }

		const res = (!force && pageCache[currentPage]) ? pageCache[currentPage]
			: await apiFetch(`/api/leaderboard/${guildID}?page=${currentPage}`)
		pageCache[res.pageInfo.page] = { leaderboard: res.leaderboard, pageInfo: res.pageInfo, hiddenMembers: res.hiddenMembers, guild: res.guild }
		lbRows = buildLeaderboardRows(data, res.leaderboard)
		if (res.hiddenMembers) { hiddenRows = buildHiddenRows({ ...data, hiddenMembers: res.hiddenMembers }) }
		if (res.guild) membersText = updateRankedCount(res)
		loadingPage = false
	}

	// ── on mount ──────────────────────────────────────────────────────────────
	onMount(async () => {
		const res = await apiFetch(`/api/leaderboard/${guildID}`).catch(e => { errorCode = e.data?.code; errorMsg = e.message; return null })
		if (!res) { loading = false; return }

		data = res
		pageCache[res.pageInfo.page] = { leaderboard: res.leaderboard, pageInfo: res.pageInfo, hiddenMembers: res.hiddenMembers, guild: res.guild }
		totalPages = res.pageInfo.pageCount
		membersText = updateRankedCount(res)

		if (loggedIn()) {
			userLevel = getLevel(res.user?.xp || 0, res.settings)
			userColor = roleCol(res.user?.color)
			userMultiplier = getMultiplier(res.user?.roles || [], res.settings, res.roles || [])
		}

		lbRows = buildLeaderboardRows(res, res.leaderboard)
		rewardRows = buildRewardRows(res)
		allLevels = buildAllLevels(res)
		hiddenRows = buildHiddenRows(res)
		accountInfo = buildAccountInfo(res)

		loading = false
	})

	// ── XP edit popup ─────────────────────────────────────────────────────────
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
			case 'addxp':   newXP = popupUser.xp + amt; break
			case 'setxp':   newXP = amt; break
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
			case 'addxp':   editAmount = defaultAdd; break
			case 'setxp':   editAmount = popupUser.xp; break
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
		if (newXP === popupUser.xp) { popup = null; return }
		isUpdating = true
		try {
			await apiFetch('/api/editXP', { method: 'POST', body: JSON.stringify({ guildID, user: popupUser.id, xp: newXP }) })
			if (popupUser.id === data.user?.id) { window.location.reload(); return }
			pageCache = {}
			await setPage(currentPage, true)
		} catch (e) {
			alert(`Error! ${e.message}`)
		} finally {
			popup = null
			isUpdating = false
		}
	}

	// ── hide / unhide ─────────────────────────────────────────────────────────
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
			await apiFetch('/api/leaderboardHide', { method: 'POST', body: JSON.stringify({ guildID, user: hideTargetUser.id, hide: true }) })
			pageCache = {}
			await setPage(currentPage, true)
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
			await apiFetch('/api/leaderboardHide', { method: 'POST', body: JSON.stringify({ guildID, user: row.id, hide: false }) })
			pageCache = {}
			await setPage(currentPage, true)
		} catch (e) {
			alert(`Error! ${e.message}`)
		} finally {
			isUpdating = false
		}
	}

	// ── keyboard for popups ───────────────────────────────────────────────────
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
	<h2 class="middleflex">Loading...</h2>

{:else if errorCode || (!loading && !data)}
	<div class="uhoh" id="uhoh">
		<h2 id="errorheader">
			{#if errorCode === 'invalidServer'}No leaderboard!
			{:else if errorCode === 'privateLeaderboard'}Private leaderboard!
			{:else if errorCode === 'xpDisabled'}XP disabled!
			{:else if errorCode === 'leaderboardDisabled'}Leaderboard disabled!
			{:else}Something went wrong
			{/if}
		</h2>
		<p id="errorfooter">
			{#if errorCode === 'invalidServer'}This server does not have a leaderboard... are you sure it exists?
			{:else if errorCode === 'privateLeaderboard'}This leaderboard is private, and is only viewable to members of the server.
			{:else if errorCode === 'xpDisabled'}This server currently has XP disabled.
			{:else if errorCode === 'leaderboardDisabled'}This server has disabled the leaderboard.
			{:else}{errorMsg || 'Unknown error'}
			{/if}
		</p>
		{#if errorCode === 'privateLeaderboard'}
			<button on:click={loginButton} style="background-color: var(--emojipurple); margin-top: 16px; font-size: 20px; height: 46px; width: 300px">Log in</button>
		{/if}
	</div>

{:else if data}
	<div class="centerflex" style="margin-top: 10px; flex-direction: column;">
		<h1 style="text-align: center">Leaderboard for {data.guild?.name}</h1>
		<p style="margin-top: 2px">{membersText}</p>

		{#if data.moderator && data.settings?.leaderboard?.disabled}
			<h2 style="color: #ff5555; margin: 0 0 15px; text-align: center">
				The leaderboard is currently disabled!<br />
				<span style="font-size: 18px; font-weight: normal">Only moderators can view this page.</span>
			</h2>
		{:else if loggedIn() && data.user?.missing}
			<h2 style="color: #ff5555; margin: 0 0 15px; text-align: center">You're not in this server!</h2>
		{/if}

		{#if !loggedIn()}
			<button on:click={loginButton} style="background-color: var(--emojipurple); width: 350px; margin-bottom: 30px; margin-top: 10px; font-size: 22px; height: 50px">
				Log in to view personal stats!
			</button>
		{/if}

		<!-- Tab buttons -->
		<div id="lbButtons" style="margin-bottom: 20px; margin-top: 2px">
			{#each tabs() as t}
				<button
					class:selectedlb={activeTab === t}
					disabled={t === 'rank' && !loggedIn()}
					on:click={() => (activeTab = t)}
				>
					{#if tabIcon(t)}<svelte:component this={tabIcon(t)} size={16} style="margin-right: 6px; vertical-align: middle" />{/if}{tabLabel(t)}
				</button>
			{/each}
			{#if hiddenRows.length > 0}
				<button class:selectedlb={activeTab === 'hidden'} on:click={() => (activeTab = 'hidden')}>
					<svelte:component this={tabIcon('hidden')} size={16} style="margin-right: 6px; vertical-align: middle" />Hidden Members
				</button>
			{/if}
		</div>
	</div>

	<!-- ── LEADERBOARD TAB ─────────────────────────────────────────────────── -->
	{#if activeTab === 'leaderboard'}
		{#if lbRows.length === 0}
			<h2 style="text-align: center">
				{data.settings?.leaderboard?.minLevel > 0
					? `Nobody in this server is on the leaderboard yet!\n(level ${commafy(data.settings.leaderboard.minLevel)} required)`
					: 'Nobody in this server has any XP yet!'}
			</h2>
		{:else}
			<div class="leaderboardBox">
				{#each lbRows as row}
					<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
					<div
						class="leaderboardSlot"
						class:notInServer={row.missing}
						class:canManage={data.moderator}
						class:isSelf={row.isSelf}
						tabindex={data.moderator ? 0 : undefined}
						on:click={() => data.moderator && openEditPopup(row)}
						on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') data.moderator && openEditPopup(row) }}
					>
						<div class="mainInfo" style="width: 50%">
							<h2 style="font-size: {row.rankFontSize}">#{commafy(row.rank)}</h2>
							<div style="height: 70px; width: 70px; margin: 0 20px 0 10px; border-radius: 420px; background-color: rgba(255,255,255,0.1)">
								<img src={row.avatar || '/assets/avatar.png'} alt="" style="border-radius: 420px; height: 100%" />
							</div>
							<div class="generalInfo">
								<p
									style="font-weight: bold; cursor: help"
									title={row.missing ? 'Not in server!' : `${row.displayName} (@${row.username})`}
								>{row.nickname || row.displayName || `<@${row.id}>`}</p>
								<div style="display: flex">
									<p>Level {commafy(row.xpInfo.level)}</p>
									{#if row.missing}
										<p class="red" style="margin-left: 10px; font-weight: bold">Not in server!</p>
									{/if}
									{#if data.moderator && row.missing}
										<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
										<p class="red hideFromLeaderboard" style="margin-left: 12px; opacity: 80%; text-decoration: underline; cursor: pointer" on:click={(e) => clickHide(e, row)}>Hide member</p>
									{/if}
								</div>
							</div>
						</div>
						<div style="width: 48%; margin-right: 20px">
							<div class="progressBar">
								<div class="progress" style="background-color: {row.progressColor}; width: {row.xpInfo.percentage}%"></div>
								<div class="xpOverlay">
									<p>
										<span>{commafy(row.xp)} / {commafy(row.xpInfo.xpRequired)} XP{data.settings?.rankCard?.relativeLevel ? ` \u00a0•\u00a0 ${commafy(row.xp - row.xpInfo.previousLevel)} / ${commafy(row.xpInfo.xpRequired - row.xpInfo.previousLevel)}` : ''}</span>
										<span style="font-weight: normal; margin-left: 10px; font-size: 16px">({+row.xpInfo.percentage.toFixed(2)}%)</span>
									</p>
									{#if row.multText}
										<p style="color: {row.multColor}">{row.multText}</p>
									{/if}
									{#if data.moderator}
										<img src="/assets/icons/pencil.svg" class="editIcon" alt="Edit" style="display: none" />
									{/if}
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		{#if totalPages > 1}
			<div class="middleflex" style="flex-direction: row; margin-top: 20px">
				<button disabled={currentPage <= 1} style="width: 50px; min-width: 50px; background-color: var(--emojipurple); margin-right: 20px" on:click={() => setPage(currentPage - 1)}>&lt;-</button>
				<p style="font-weight: bold; font-size: 22px">
					Page <input type="number" min="1" max={totalPages} value={currentPage} style="font-size: 22px; margin: 0 5px; font-weight: bold; width: 50px; height: 32px; text-align: center"
						on:change={(e) => setPage(+e.currentTarget.value)} /> of {totalPages}
				</p>
				<button disabled={currentPage >= totalPages} style="width: 50px; min-width: 50px; background-color: var(--emojipurple); margin-left: 20px" on:click={() => setPage(currentPage + 1)}>-&gt;</button>
			</div>
		{/if}
	{/if}

	<!-- ── REWARD ROLES TAB ────────────────────────────────────────────────── -->
	{#if activeTab === 'roles'}
		{#if !loggedIn()}
			<h2 class="lbBox plsLogIn" style="text-align: center">Log in to view your progress towards reward roles!</h2>
		{/if}
		{#if data.settings?.leaderboard?.hideRoles && !rewardRows.length}
			<h2 style="text-align: center">Reward roles are hidden for this server!</h2>
		{:else if !rewardRows.length}
			<h2 style="text-align: center">This server doesn't have any reward roles!</h2>
		{:else}
			<div class="leaderboardBox">
				{#each rewardRows as r}
					<div class="leaderboardSlot">
						<div class="mainInfo" style="width: 54%">
							<div style="margin-left: 10px">
								<p style="font-weight: bold; color: {r.color}">{r.name}</p>
								<p style="color: {r.reached ? r.color : '#bbbbbb'}">Level {commafy(r.level)}</p>
							</div>
						</div>
						<div style="width: 60%; margin-right: 20px">
							<div class="progressBar">
								<div class="progress" style="width: {r.progress}%; background-color: {r.color}"></div>
								<div class="xpOverlay"><p>{r.statusText}</p></div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{/if}

	<!-- ── ALL LEVELS TAB ─────────────────────────────────────────────────── -->
	{#if activeTab === 'levels'}
		{#if !loggedIn()}
			<h2 style="text-align: center">Log in to view your progress towards each level!</h2>
		{/if}
		<div class="leaderboardBox">
			{#each allLevels as lvl}
				<div class="leaderboardSlot" class:highlightedSlot={lvl.highlight}>
					<div class="mainInfo" style="width: 38%">
						<div style="margin-left: 10px">
							<p style="font-weight: bold; color: hsl({lvl.hue}, {lvl.reached ? 90 : 70}%, {lvl.reached ? 70 : 90}%)">Level {commafy(lvl.i)}</p>
							<p style="color: hsl({lvl.hue}, {lvl.reached ? 90 : 70}%, {lvl.reached ? 70 : 90}%)">{commafy(lvl.lvlXP)} XP</p>
						</div>
					</div>
					<div style="width: 60%; margin-right: 20px">
						<div class="progressBar">
							<div class="progress" style="background-color: hsl({lvl.hue}, 100%, 50%); width: {lvl.lvlProgress}%"></div>
							<div class="xpOverlay"><p>{+lvl.lvlProgress.toFixed(2)}% reached{lvl.lvlProgress >= 100.5 ? ` (${commafy(Math.round(lvl.lvlProgress))}%)` : ''}</p></div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- ── YOUR RANK TAB ──────────────────────────────────────────────────── -->
	{#if activeTab === 'rank'}
		{#if loggedIn() && accountInfo}
			<div class="leaderboardBox">
				<div class="accountBox centerflex" style="padding-top: 20px; flex-direction: column; overflow: hidden">
					{#if accountInfo.partial}
						<h2 style="text-align: center; color: rgb(255,85,85); margin-bottom: 0">There was an error fetching your server info!</h2>
						<p style="text-align: center; color: rgb(255,85,85); margin-top: 2px">Information about roles could not be obtained.</p>
					{/if}
					<div class="middleflex" style="margin-bottom: 20px">
						<img src={data.user?.avatar} alt="" />
						<div class="generalInfo">
							<p style="font-weight: bold; font-size: 32px; color: {accountInfo.color}">{accountInfo.name}</p>
							<p style="font-size: 22px; color: {accountInfo.color}">Level {commafy(accountInfo.level)}</p>
						</div>
					</div>
					<div class="progressBar" style="width: 75%; margin: auto">
						<div class="progress" style="background-color: {accountInfo.color}; width: {accountInfo.percentage}%"></div>
					</div>
					<div class="middleflex" style="margin-top: 7px">
						<p style="font-weight: bold; color: {accountInfo.color}">{commafy(accountInfo.xp)} / {commafy(accountInfo.xpRequired)} XP</p>
						<p style="margin-left: 10px; color: {accountInfo.color}">({accountInfo.percentage}%)</p>
					</div>
					<p style="font-size: 20px; margin-top: 0">{accountInfo.ranking}</p>
					<hr noshade style="width: 85%; margin-bottom: 20px" />
					<div style="width: 100%; display: flex; flex-direction: row; flex-wrap: wrap; justify-content: space-around">
						<div class="statBox">
							<p>Previous level:</p><p style="color: lime">{commafy(accountInfo.prevXP)} XP</p>
							<p>XP since previous:</p><p style="color: lime">{commafy(accountInfo.sincePrev)} XP</p>
							<p>XP to level up:</p><p style="color: lime">{accountInfo.toNext}</p>
						</div>
						{#if !accountInfo.partial}
							<div class="statBox">
								<p>Top reward role:</p>
								<p style="color: {accountInfo.topRole?.color || 'white'}">{accountInfo.topRole?.name || '(none)'}</p>
								<p>Reward roles reached:</p>
								<p style="color: {accountInfo.topRole?.color || 'white'}">{accountInfo.totalRoles}</p>
								<p>Multiplier:</p>
								<p style="color: {accountInfo.multiplierColor}">{accountInfo.multiplierText}</p>
							</div>
						{/if}
						<div class="statBox">
							<p>XP per message:</p><p style="color: aqua">{accountInfo.xpPerMsg}</p>
							<p>Cooldown:</p><p style="color: aqua">{accountInfo.cooldown}</p>
							<p>Messages to level up:</p><p style="color: aqua">{accountInfo.messages}</p>
						</div>
					</div>
				</div>
			</div>
		{:else if loggedIn()}
			<h2 style="text-align: center">You don't have any XP yet!</h2>
		{/if}
	{/if}

	<!-- ── HIDDEN MEMBERS TAB ─────────────────────────────────────────────── -->
	{#if activeTab === 'hidden' && data.moderator}
		<div style="margin-bottom: 20px">
			<h2 style="text-align: center">Hidden Members</h2>
			<p style="text-align: center; margin-top: 4px">
				Members listed here are hidden from the leaderboard and skipped over when calculating ranks.<br />
				In most cases, these are members who left the server or are inactive.<br />
				<b>They will be automatically unhidden upon gaining XP.</b>
			</p>
		</div>
		{#if hiddenRows.length}
			<div class="emptyLbBox middleflex centerflex" style="flex-wrap: wrap; gap: 12px; padding: 16px">
				{#each hiddenRows as h}
					<div class="hiddenMemberSlot">
						<p style="font-weight: bold; margin: 0 0 4px">ID: {h.id}</p>
						<p style="margin: 2px 0">Level {commafy(h.levelInfo.level)} &nbsp;•&nbsp; {commafy(h.xp)} XP</p>
						<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
						<button class="unhideBtn" on:click={() => unhide(h)} disabled={isUpdating}>Unhide</button>
					</div>
				{/each}
			</div>
		{/if}
	{/if}

	<div style="height: 40px"></div>

	<!-- ── POPUPS ─────────────────────────────────────────────────────────── -->
	{#if popup}
		<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
		<div class="popup" style="display: flex" on:click={() => { if (!isUpdating) popup = null }}>
			<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
			<div class="popupbox" on:click|stopPropagation>
				<div class="box">
					{#if popup === 'editxp' && popupUser}
						<h2 style="font-size: 36px">{popupUser.missing ? 'Missing user' : popupUser.displayName}</h2>
						<p style="margin: 0">@{popupUser.username}</p>
						<p style="margin: 0">(ID: {popupUser.id})</p>
						<select bind:value={editType} on:change={resetEditAmount}
							style="font-size: 22px; height: 50px; text-align: center; width: 200px; margin-top: 30px">
							<option value="addxp">Add XP</option>
							<option value="setxp">Set XP to</option>
							<option value="addlevel">Add levels</option>
							<option value="setlevel">Set level to</option>
						</select>
						<br />
						<input bind:value={editAmount} on:input={recalcNewXP} type="number"
							class="lineinput" style="margin: 20px 0; font-size: 22px; width: 300px" />
						<div class="middleflex">
							<p style="width: 100px; text-align: right; margin-right: 8px; font-size: 22px"><b>Old XP:</b></p>
							<p style="font-size: 22px">{oldXPDisplay}</p>
						</div>
						<div class="middleflex">
							<p style="color: aqua; width: 100px; text-align: right; margin-right: 8px; font-size: 22px"><b>New XP:</b></p>
							<p style="color: aqua; font-size: 22px">{newXPDisplay}</p>
						</div>
						<button class="popupConfirm" style="background-color: var(--lightestfg)" on:click={() => (popup = null)}>Cancel</button>
						<button class="popupConfirm" on:click={saveXP} disabled={isUpdating}>Save</button>
					{:else if popup === 'confirmhide'}
						<h2 style="font-size: 36px">Hide from Leaderboard?</h2>
						<p style="margin: 10px 0">This member will be removed from the leaderboard, and skipped over when calculating rankings. <b>Their XP will not be reset, and they will be automatically unhidden upon gaining XP.</b></p>
						<p style="opacity: 50%">(hold shift to skip this popup)</p>
						<button class="popupConfirm" style="background-color: var(--lightestfg)" on:click={() => (popup = null)}>Cancel</button>
						<button class="popupConfirm" on:click={confirmHide} disabled={isUpdating}>Confirm</button>
					{/if}
				</div>
			</div>
		</div>
	{/if}
{/if}
