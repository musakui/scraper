/**
 * wait
 * @param {number} ms delay
 * @return {Promise<void>}
 */
export const millis = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * create a rate-limited fetch
 * @param {number} parallel maximum concurrent fetches
 * @param {number} delay minimum wait between fetches (ms)
 */
export const ratedFetch = (parallel, delay) => {
	let last = 0
	let active = 0
	const queue = []

	/**
	 * @param {string} url
	 * @param {RequestInit} init
	 */
	return async (url, init) => {
		const wait = delay + last - Date.now()
		if (wait > 0) await millis(wait)
		if (active >= parallel) await new Promise((r) => queue.push(r))
		++active
		last = Date.now()
		try {
			return await fetch(url, init)
		} finally {
			--active
			queue.length && queue.shift()()
		}
	}
}
