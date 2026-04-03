// @ts-nocheck
/**
 * Fetch wrapper that always requests JSON and throws on non-2xx responses.
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<any>}
 */
export async function apiFetch(url, options = {}) {
	const res = await fetch(url, {
		headers: { 'Content-Type': 'application/json', ...options.headers },
		...options
	})
	const data = await res.json().catch(() => ({}))
	if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, data })
	return data
}

/**
 * Save the current URL to localStorage then redirect to the Discord OAuth login flow.
 */
export function loginButton() {
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem('polaris_url', window.location.pathname + window.location.search)
	}
	window.location.href = '/discord'
}

/** True when the user agent looks like a mobile device. */
export const mobile = typeof navigator !== 'undefined' && /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)

export default apiFetch
