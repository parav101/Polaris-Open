<script>
	// @ts-nocheck
	import { onMount } from 'svelte'
	import { apiFetch } from '$lib/api.js'

	let botPublic = false
	let loggedIn = false

	onMount(async () => {
		// Handle OAuth redirect — restore saved URL
		if (window.location.search.includes('authorized')) {
			const saved = localStorage.getItem('polaris_url')
			if (saved && saved.startsWith('/')) window.location.href = saved
			else window.history.pushState('', '', '/')
		}
		localStorage.removeItem('polaris_url')

		const data = await apiFetch('/api/loggedin').catch(() => null)
		loggedIn = !!(data?.login?.id)
		botPublic = !!(data?.botPublic)
	})
</script>

<svelte:head>
	<title>Polaris</title>
	<meta property="og:title" content="Polaris" />
	<meta property="og:description" content="An open-source XP bot" />
	<meta property="og:type" content="website" />
	<meta name="twitter:card" content="summary" />
</svelte:head>

<div class="middleflex" style="flex-direction: column; width: 100%; height: 100%">
	<div class="middleflex" style="margin-bottom: 40px">
		<img style="height: 160px; margin-right: 45px; user-select: none" src="/assets/polaris.svg" alt="Polaris logo" />
		<div>
			<h1 style="color: var(--polarisgreen); font-size: 52px">Polaris Open</h1>
			<p style="font-size: 26px; margin-top: 0; line-height: 45px">A fully customizable, bullshit-free levelling bot.</p>
			<div class="centerflex spacedflex" style="margin-top: 25px; height: 50px">
				{#if botPublic}
					<a href="/invite" tabindex="-1" target="_blank" rel="noreferrer">
						<button class="fancybutton">Add to Discord</button>
					</a>
				{/if}
				<a href="/servers" tabindex="-1">
					<button class="fancybutton">{loggedIn ? 'Manage servers' : 'Log in'}</button>
				</a>
			</div>
		</div>
	</div>

	<div class="bottomBar">
		<div class="centerflex">
			<img src="https://gdcolon.com/assets/tails/fluff.png" style="height: 30px; margin-right: 10px" alt="" />
			<p style="font-size: 20px">
				Originally created by <a target="_blank" class="canfocus" href="https://gdcolon.com" rel="noreferrer">
					<span style="font-weight: 600; color: var(--colon); text-decoration: underline">Colon</span>
				</a> :
			</p>
		</div>
	</div>
</div>

<style>
	:global(body) {
		height: 100%;
	}
</style>

