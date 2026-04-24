<script>
	// @ts-nocheck
	/**
	 * EmojiPicker — text input with inline preview and searchable picker dropdown.
	 *
	 * Props:
	 *   value     — bound string value (two-way)
	 *   emojis    — array of { id, name, animated, source } from /api/emojis/:guildId
	 *   mode      — 'string' (inserts <:name:id>) | 'id' (inserts raw ID only)
	 *   placeholder — input placeholder
	 *   width     — CSS width of the text input
	 */
	export let value = ''
	export let emojis = []
	export let mode = 'string'
	export let placeholder = '🎉'
	export let width = '120px'

	let showPicker = false
	let search = ''
	let rootEl

	// Parse a discord emoji string to get id/name/animated
	function parseEmoji(str) {
		if (!str) return null
		const m = (str || '').match(/^<(a)?:(\w+):(\d+)>$/)
		if (m) return { animated: !!m[1], name: m[2], id: m[3] }
		if (/^\d{17,20}$/.test((str || '').trim())) {
			const found = emojis.find(e => e.id === str.trim())
			return { id: str.trim(), name: found?.name || '', animated: found?.animated || false }
		}
		return null
	}

	function emojiUrl(id, animated) {
		return `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}?size=32`
	}

	function selectEmoji(emoji) {
		value = mode === 'id' ? emoji.id : `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`
		showPicker = false
		search = ''
	}

	function handleWindowClick(e) {
		if (rootEl && !rootEl.contains(e.target)) showPicker = false
	}

	function handleKeydown(e) {
		if (e.key === 'Escape') showPicker = false
	}

	$: parsed = parseEmoji(value)
	$: appEmojis  = emojis.filter(e => e.source === 'app'  && (!search || e.name.toLowerCase().includes(search.toLowerCase())))
	$: guildEmojis = emojis.filter(e => e.source === 'guild' && (!search || e.name.toLowerCase().includes(search.toLowerCase())))
</script>

<svelte:window on:click={handleWindowClick} on:keydown={handleKeydown} />

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="epRoot" bind:this={rootEl}>
	<div class="epRow">
		<input type="text" bind:value {placeholder} style="width: {width}" />

		{#if parsed}
			<img
				class="epPreview"
				src={emojiUrl(parsed.id, parsed.animated)}
				alt={parsed.name || value}
				title={parsed.name ? `:${parsed.name}:` : parsed.id}
				on:error={(e) => e.currentTarget.style.display = 'none'}
			/>
		{/if}

		{#if emojis.length > 0}
			<!-- svelte-ignore a11y-click-events-have-key-events -->
			<button
				type="button"
				class="epToggle"
				title={showPicker ? 'Close picker' : 'Pick emoji'}
				on:click|stopPropagation={() => { showPicker = !showPicker; search = '' }}
			>{showPicker ? '✕' : '😀'}</button>
		{/if}
	</div>

	{#if showPicker}
		<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
		<div class="epDropdown" on:click|stopPropagation>
			<input
				type="text"
				bind:value={search}
				placeholder="Search emojis…"
				class="epSearch"
				style="width: calc(100% - 10px); height: 32px; font-size: 14px"
			/>

			<div class="epGrid">
				{#if appEmojis.length}
					<p class="epGroupLabel">App emojis ({appEmojis.length})</p>
					{#each appEmojis as e (e.id)}
						<button type="button" class="epEmoji" title={e.name} on:click={() => selectEmoji(e)}>
							<img src={emojiUrl(e.id, e.animated)} alt={e.name} loading="lazy" />
						</button>
					{/each}
				{/if}

				{#if guildEmojis.length}
					<p class="epGroupLabel">Server emojis ({guildEmojis.length})</p>
					{#each guildEmojis as e (e.id)}
						<button type="button" class="epEmoji" title={e.name} on:click={() => selectEmoji(e)}>
							<img src={emojiUrl(e.id, e.animated)} alt={e.name} loading="lazy" />
						</button>
					{/each}
				{/if}

				{#if !appEmojis.length && !guildEmojis.length}
					<p style="opacity: 0.5; font-size: 14px; padding: 8px 0; width: 100%">No emojis found</p>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.epRoot {
		position: relative;
		display: inline-block;
	}

	.epRow {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.epPreview {
		width: 30px;
		height: 30px;
		flex-shrink: 0;
		border-radius: 4px;
	}

	.epToggle {
		min-width: 34px;
		width: 34px;
		height: 34px;
		padding: 0;
		font-size: 17px;
		background-color: var(--lighterfg);
		border: 1px solid rgba(255,255,255,0.1);
		border-radius: 6px;
		flex-shrink: 0;
		line-height: 1;
	}

	.epDropdown {
		position: absolute;
		top: calc(100% + 5px);
		left: 0;
		z-index: 100;
		background-color: var(--fg);
		border: 1px solid rgba(255,255,255,0.15);
		border-radius: 10px;
		padding: 10px;
		width: 320px;
		max-height: 280px;
		overflow-y: auto;
		box-shadow: 0 10px 30px rgba(0,0,0,0.55);
	}

	.epSearch {
		margin-bottom: 8px;
	}

	.epGrid {
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
	}

	.epGroupLabel {
		width: 100%;
		font-size: 12px;
		opacity: 0.55;
		margin: 6px 0 3px 0;
	}

	.epEmoji {
		min-width: 36px;
		width: 36px;
		height: 36px;
		padding: 3px;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 6px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.epEmoji img {
		width: 26px;
		height: 26px;
	}

	.epEmoji:hover {
		background-color: var(--lighterfg);
		border-color: rgba(255,255,255,0.2);
	}
</style>
