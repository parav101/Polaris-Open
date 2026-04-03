<script>
	// @ts-nocheck
	import { onMount } from 'svelte'
	import { apiFetch, loginButton } from '$lib/api.js'

	let loading = true
	let error = null
	let user = null
	let guilds = []
	let botPublic = false

	/** @type {{ guild: object, addBreak: boolean }[]} */
	let rows = []

	onMount(async () => {
		const data = await apiFetch('/api/guilds').catch(e => { error = e; return null })
		if (!data) {
			loading = false
			if (error?.data?.code === 'login') loginButton()
			return
		}

		user = data.user
		botPublic = data.botPublic

		const sorted = [...data.guilds].sort((a, b) =>
			(!!b.inServer - !!a.inServer)
			|| (!!b.permissions?.owner - !!a.permissions?.owner)
			|| (!!b.permissions?.server - !!a.permissions?.server)
			|| (!!b.xp - !!a.xp)
			|| (!!b.leaderboard - !!a.leaderboard)
			|| (!!b.hasData - !!a.hasData)
			|| a.name.localeCompare(b.name)
		)

		const breaks = {}
		for (const g of sorted) {
			// Only include guilds that have something to show
			const showSettings = g.inServer && g.permissions?.server
			const showLeaderboard = g.inServer && g.leaderboard
			const showDownload = !g.inServer && g.permissions?.server && g.hasData
			const showInvite = !g.inServer && g.permissions?.server && botPublic
			if (!showSettings && !showLeaderboard && !showDownload && !showInvite) continue

			let addBreak = false
			if (!breaks.isMod && g.inServer && !g.permissions?.server) { breaks.isMod = true; addBreak = true }
			else if (!breaks.xpEnabled && !g.xp && g.inServer) { breaks.xpEnabled = true; addBreak = true }
			else if (!breaks.inServer && !g.inServer) { breaks.inServer = true; addBreak = true }

			rows.push({ guild: g, addBreak, showSettings, showLeaderboard, showDownload, showInvite })
		}

		loading = false
	})

	function iconUrl(g) {
		return g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : '/assets/avatar.png'
	}

	function statusText(g) {
		if (g.permissions?.owner) return 'Server owner'
		if (g.permissions?.server) return 'Moderator'
		return 'Member'
	}

	function handleCardClick(e, row) {
		if (e.target.closest('a')) return
		const { showSettings, showLeaderboard, showInvite, showDownload, guild } = row
		if (showSettings) window.location.href = `/settings/${guild.id}`
		else if (showLeaderboard) window.location.href = `/leaderboard/${guild.id}`
		else if (showInvite) window.open(`/invite/${guild.id}`, 'popup', 'width=500,height=750')
		else if (showDownload) downloadServerData(guild)
	}

	let downloading = false
	async function downloadServerData(server) {
		if (!server || !confirm(`Would you like to download all Polaris data from ${server.name}? (it can be imported into other bots)`)) return
		if (downloading) return
		downloading = true
		try {
			const res = await fetch(`/api/xp/${server.id}?format=everything`)
			if (!res.ok) {
				const x = await res.json().catch(() => ({}))
				alert(`Error! ${x.message || 'Unknown error'}`)
			} else {
				const blob = await res.blob()
				const a = document.createElement('a')
				a.href = URL.createObjectURL(blob)
				a.download = `${server.name}.json`
				a.style.display = 'none'
				document.body.appendChild(a)
				a.click()
				document.body.removeChild(a)
			}
		} catch (e) {
			alert(`Error! ${e.message}`)
		} finally {
			downloading = false
		}
	}
</script>

<svelte:head>
	<title>Polaris – Servers</title>
</svelte:head>

{#if loading}
	<h2 class="middleflex">Loading...</h2>
{:else if error && error?.data?.code !== 'login'}
	<div class="middleflex" style="flex-direction: column; gap: 12px;">
		<h2>Something went wrong</h2>
		<p>{error.message}</p>
	</div>
{:else if user}
	<div class="centerflex" style="flex-direction: column">
		<h2 style="font-size: 30px">
			Welcome back, <span style="color: {user.color || 'white'}">{user.displayName}</span>
		</h2>
		<p style="font-size: 20px; margin-top: 4px; margin-bottom: 25px">Select a server to manage</p>
	</div>

	<div style="padding-bottom: 20px">
		{#each rows as row}
			{#if row.addBreak}
				<div class="serverBreak"></div>
			{/if}
			<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
			<div class="serverOption canfocus" tabindex="0" on:click={(e) => handleCardClick(e, row)}>
				<div class="middleflex" style="width: 10px; justify-content: flex-start">
					<img src={iconUrl(row.guild)} alt="" />
					<div>
						<p style="font-size: 22px">
							<b title={row.guild.name} style="color: {row.guild.xp ? '#00ff80' : 'white'}">{row.guild.name}</b>
						</p>
						<p>{statusText(row.guild)}</p>
					</div>
				</div>
				<div class="serverIcons" style="display: flex; align-items: center;">
					{#if row.showLeaderboard}
						<a class="canfocus" href="/leaderboard/{row.guild.id}" title="Leaderboard">
							<img src="/assets/icons/podium.svg" alt="Leaderboard" />
						</a>
					{/if}
					{#if row.showSettings}
						<a class="canfocus" href="/settings/{row.guild.id}" title="Settings">
							<img src="/assets/icons/cog.svg" alt="Settings" />
						</a>
					{/if}
					{#if row.showDownload}
						<!-- svelte-ignore a11y-invalid-attribute -->
						<a class="canfocus" href="#" title="Download data" on:click|preventDefault={() => downloadServerData(row.guild)}>
							<img src="/assets/icons/download.svg" alt="Download data" />
						</a>
					{/if}
					{#if row.showInvite}
						<!-- svelte-ignore a11y-invalid-attribute -->
						<a class="canfocus" href="#" title="Invite to server!" on:click|preventDefault={() => window.open(`/invite/${row.guild.id}`, 'popup', 'width=500,height=750')}>
							<img src="/assets/icons/plus.svg" alt="Invite" />
						</a>
					{/if}
				</div>
			</div>
		{/each}
	</div>

	<div class="middleflex" style="padding-bottom: 30px">
		<a tabindex="-1" href="/logout">
			<button class="boringbutton" style="font-size: 22px; text-align: center; text-decoration: underline;">Log out</button>
		</a>
	</div>
{/if}
