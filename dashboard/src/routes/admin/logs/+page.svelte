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
	<div class="middleflex" style="flex-direction: column;">
		<h2>Unable to load admin logs</h2>
		<p>{error.message}</p>
	</div>
{:else}
	<div style="max-width: 1200px; margin: 0 auto; padding: 16px 20px 36px 20px;">
		<div class="middleflex" style="justify-content: space-between; align-items: center;">
			<div>
				<h1 style="margin-bottom: 2px;">Admin Logs</h1>
				<p style="opacity: 0.8; margin-top: 0;">Signed in as {me?.user?.displayName || me?.user?.username}</p>
			</div>
			<div style="display: flex; gap: 8px;">
				<button class="boringbutton" on:click={loadAll}>Refresh now</button>
				<button class="boringbutton" on:click={downloadLogs}>Download NDJSON</button>
				<a href="/servers"><button class="boringbutton">Back</button></a>
			</div>
		</div>

		<div style="display: grid; grid-template-columns: repeat(4, minmax(150px, 1fr)); gap: 10px; margin: 14px 0;">
			<div class="serverOption" style="padding: 10px;">
				<p style="margin: 0; opacity: 0.8;">Errors (24h)</p>
				<h3 style="margin: 4px 0 0 0;">{summary?.events?.errorCount || 0}</h3>
			</div>
			<div class="serverOption" style="padding: 10px;">
				<p style="margin: 0; opacity: 0.8;">Warnings (24h)</p>
				<h3 style="margin: 4px 0 0 0;">{summary?.events?.warnCount || 0}</h3>
			</div>
			<div class="serverOption" style="padding: 10px;">
				<p style="margin: 0; opacity: 0.8;">Perf samples (24h)</p>
				<h3 style="margin: 4px 0 0 0;">{summary?.perf?.reduce((a, x) => a + x.count, 0) || 0}</h3>
			</div>
			<div class="serverOption" style="padding: 10px;">
				<p style="margin: 0; opacity: 0.8;">Refresh</p>
				<select bind:value={refreshMs} on:change={resetInterval}>
					<option value={10000}>10s</option>
					<option value={20000}>20s</option>
					<option value={30000}>30s</option>
					<option value={60000}>60s</option>
				</select>
			</div>
		</div>

		<div class="serverOption" style="padding: 12px;">
			<div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px;">
				<button class="boringbutton" on:click={() => { tab = "events"; loadAll() }}>Events</button>
				<button class="boringbutton" on:click={() => { tab = "perf"; loadAll() }}>Perf</button>
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

			<p style="opacity: 0.8;">Showing {logs.length} {tab} rows</p>
			<div style="max-height: 560px; overflow: auto; border: 1px solid #2e2e2e; border-radius: 8px; padding: 8px;">
				{#if !logs.length}
					<p>No log entries found for filters.</p>
				{:else}
					{#each logs as row}
						<div style="border-bottom: 1px solid #2d2d2d; padding: 8px 0;">
							<div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
								<code>{new Date(row.ts).toLocaleString()}</code>
								<b>[{row.level}]</b>
								<span>{row.category}</span>
								{#if row.shardId !== null && row.shardId !== undefined}<span>shard:{row.shardId}</span>{/if}
								{#if row.msg}<span>{row.msg}</span>{/if}
							</div>
							{#if row.meta}
								<pre style="white-space: pre-wrap; margin: 6px 0 0 0; opacity: 0.9;">{JSON.stringify(row.meta, null, 2)}</pre>
							{/if}
						</div>
					{/each}
				{/if}
			</div>
		</div>

		<div class="serverOption" style="padding: 12px; margin-top: 12px;">
			<h3 style="margin-top: 0;">P50 / P95 (24h)</h3>
			{#if summary?.perf?.length}
				{#each summary.perf as p}
					<div style="display: flex; gap: 12px; border-bottom: 1px solid #2d2d2d; padding: 6px 0;">
						<b style="min-width: 210px;">{p.command}</b>
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
