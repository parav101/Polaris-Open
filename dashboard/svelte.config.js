import adapter from '@sveltejs/adapter-static'

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			fallback: '404.html'
		})
	},
	onwarn: (warning, handler) => {
		// Suppress accessibility warnings — these are cosmetic and don't affect the build
		if (warning.code.startsWith('a11y')) return
		handler(warning)
	}
}

export default config
