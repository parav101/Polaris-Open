<script>
	// @ts-nocheck
	import { onMount } from 'svelte'
	import { apiFetch, loginButton } from '$lib/api.js'

	let loading = true
	let error = null
	let me = null
	let summary = null
	let logs = []
	let tab = "events"
	let refreshMs = 20000
	let timer = null

	let filters = {
		limit: 200,
		level: "",
		category: "",
		command: "",
		shardId: ""
	}

	async function loadAll() {
		error = null
		try {
			me = await apiFetch("/api/admin/whoami")
			summary = await apiFetch("/api/admin/logs/summary")

			const params = new URLSearchParams({
				type: tab,
				limit: String(filters.limit || 200)
			})
			if (filters.level) params.set("level", filters.level)
			if (filters.category) params.set("category", filters.category)
			if (filters.command) params.set("command", filters.command)
			if (filters.shardId) params.set("shardId", filters.shardId)

			const data = await apiFetch(`/api/admin/logs?${params.toString()}`)
			logs = data.logs || []
		} catch (e) {
			error = e
			if (e?.data?.code === "login") loginButton()
		} finally {
			loading = false
		}
	}

	function resetInterval() {
		if (timer) clearInterval(timer)
		timer = setInterval(loadAll, refreshMs)
	}

	function switchTab(nextTab) {
		if (tab === nextTab) return
		tab = nextTab
		loadAll()
	}

	function downloadLogs() {
		const params = new URLSearchParams({
			type: tab,
			limit: String(filters.limit || 2000)
		})
		if (filters.level) params.set("level", filters.level)
		if (filters.category) params.set("category", filters.category)
		if (filters.command) params.set("command", filters.command)
		if (filters.shardId) params.set("shardId", filters.shardId)
		window.location.href = `/api/admin/logs/export?${params.toString()}`
	}

	onMount(async () => {
		await loadAll()
		resetInterval()
		return () => { if (timer) clearInterval(timer) }
	})
</script>

<svelte:head>
	<title>Polaris - Admin Logs</title>
</svelte:head>

{#if loading}
	<h2 class="middleflex">Loading admin logs...</h2>
{:else if error}
	<div class="middleflex logs-state">
		<h2>Unable to load admin logs</h2>
		<p>{error.message}</p>
	</div>
{:else}
	<div class="logs-page">
		<div class="logs-header">
			<div class="logs-title">
				<h1>Admin Logs</h1>
				<p>Signed in as {me?.user?.displayName || me?.user?.username}</p>
			</div>
			<div class="logs-actions">
				<button class="boringbutton" on:click={loadAll}>Refresh now</button>
				<button class="boringbutton" on:click={downloadLogs}>Download NDJSON</button>
				<a class="boringbutton logs-link-button" href="/servers">Back</a>
			</div>
		</div>

		<div class="logs-stats">
			<div class="logs-stat-card">
				<p class="logs-stat-label">Errors (24h)</p>
				<h3>{summary?.events?.errorCount || 0}</h3>
			</div>
			<div class="logs-stat-card">
				<p class="logs-stat-label">Warnings (24h)</p>
				<h3>{summary?.events?.warnCount || 0}</h3>
			</div>
			<div class="logs-stat-card">
				<p class="logs-stat-label">Perf samples (24h)</p>
				<h3>{summary?.perf?.reduce((a, x) => a + x.count, 0) || 0}</h3>
			</div>
			<div class="logs-stat-card">
				<p class="logs-stat-label">Refresh</p>
				<select bind:value={refreshMs} on:change={resetInterval}>
					<option value={10000}>10s</option>
					<option value={20000}>20s</option>
					<option value={30000}>30s</option>
					<option value={60000}>60s</option>
				</select>
			</div>
		</div>

		<div class="logs-panel">
			<div class="logs-controls">
				<button class="boringbutton {tab === 'events' ? 'is-active' : ''}" on:click={() => switchTab("events")}>Events</button>
				<button class="boringbutton {tab === 'perf' ? 'is-active' : ''}" on:click={() => switchTab("perf")}>Perf</button>
				<input placeholder="category" bind:value={filters.category} />
				<input placeholder="command" bind:value={filters.command} />
				<input placeholder="shardId" bind:value={filters.shardId} />
				<select bind:value={filters.level}>
					<option value="">any level</option>
					<option value="error">error</option>
					<option value="warn">warn</option>
					<option value="info">info</option>
				</select>
				<select bind:value={filters.limit}>
					<option value={100}>100</option>
					<option value={200}>200</option>
					<option value={500}>500</option>
					<option value={1000}>1000</option>
				</select>
				<button class="boringbutton" on:click={loadAll}>Apply</button>
			</div>

			<p class="logs-muted">Showing {logs.length} {tab} rows</p>
			<div class="logs-list">
				{#if !logs.length}
					<p>No log entries found for filters.</p>
				{:else}
					{#each logs as row}
						<div class="logs-row">
							<div class="logs-row-main">
								<code>{new Date(row.ts).toLocaleString()}</code>
								<b>[{row.level}]</b>
								<span>{row.category}</span>
								{#if row.shardId !== null && row.shardId !== undefined}<span>shard:{row.shardId}</span>{/if}
								{#if row.msg}<span>{row.msg}</span>{/if}
							</div>
							{#if row.meta}
								<pre>{JSON.stringify(row.meta, null, 2)}</pre>
							{/if}
						</div>
					{/each}
				{/if}
			</div>
		</div>

		<div class="logs-panel">
			<h3>P50 / P95 (24h)</h3>
			{#if summary?.perf?.length}
				{#each summary.perf as p}
					<div class="logs-perf-row">
						<b>{p.command}</b>
						<span>count: {p.count}</span>
						<span>p50: {p.p50}ms</span>
						<span>p95: {p.p95}ms</span>
						<span>max: {p.max}ms</span>
					</div>
				{/each}
			{:else}
				<p>No perf stats yet.</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	.logs-page {
		max-width: 1200px;
		margin: 0 auto;
		padding: 18px 20px 36px;
	}

	.logs-state {
		flex-direction: column;
	}

	.logs-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 12px;
		flex-wrap: wrap;
		margin-bottom: 14px;
	}

	.logs-title h1 {
		margin: 0;
	}

	.logs-title p {
		margin: 4px 0 0;
		opacity: 0.75;
	}

	.logs-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	.logs-link-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 100px;
		height: 40px;
		padding: 0 15px;
		text-decoration: none;
	}

	.logs-stats {
		display: grid;
		grid-template-columns: repeat(4, minmax(170px, 1fr));
		gap: 10px;
		margin: 10px 0 14px;
	}

	.logs-stat-card,
	.logs-panel {
		background: var(--lighterfg);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 10px;
		padding: 12px;
	}

	.logs-stat-label {
		margin: 0;
		opacity: 0.7;
	}

	.logs-stat-card h3 {
		margin: 6px 0 0;
		font-size: 28px;
	}

	.logs-controls {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		margin-bottom: 10px;
	}

	.logs-controls input,
	.logs-controls select {
		width: 170px;
	}

	.logs-controls .is-active {
		opacity: 1;
		text-decoration: underline;
	}

	.logs-muted {
		opacity: 0.75;
		margin: 4px 0 10px;
	}

	.logs-list {
		max-height: 560px;
		overflow: auto;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		padding: 8px 12px;
		background: rgba(0, 0, 0, 0.16);
	}

	.logs-row {
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		padding: 8px 0;
	}

	.logs-row:last-child {
		border-bottom: none;
	}

	.logs-row-main {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}

	pre {
		white-space: pre-wrap;
		margin: 6px 0 0;
		opacity: 0.9;
		font-size: 13px;
		line-height: 1.4;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 6px;
		padding: 8px;
	}

	.logs-panel h3 {
		margin: 0 0 10px;
	}

	.logs-perf-row {
		display: grid;
		grid-template-columns: minmax(180px, 2fr) repeat(4, minmax(90px, 1fr));
		gap: 10px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		padding: 8px 0;
	}

	.logs-perf-row:last-child {
		border-bottom: none;
	}

	@media (max-width: 920px) {
		.logs-stats {
			grid-template-columns: repeat(2, minmax(170px, 1fr));
		}

		.logs-perf-row {
			grid-template-columns: repeat(2, minmax(140px, 1fr));
		}
	}

	@media (max-width: 620px) {
		.logs-page {
			padding: 14px 10px 24px;
		}

		.logs-stats {
			grid-template-columns: 1fr;
		}

		.logs-controls input,
		.logs-controls select {
			width: 100%;
		}

		.logs-actions {
			width: 100%;
		}
	}
</style>
