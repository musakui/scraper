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

/**
 * create Request processor
 */
export const requestProcessor = (origin = globalThis.origin) => {
	const charsetReg = /charset=([^;]+)/

	/** @type {Map<string, TextDecoder>} */
	const decoders = new Map()

	/** @param {string} ctype */
	const getDecoder = (ctype) => {
		const cs = charsetReg.exec(ctype)
		if (!cs) return null

		const enc = cs[1].toLowerCase()
		if (enc === 'utf-8') return null
		if (!decoders.has(enc)) decoders.set(enc, new TextDecoder(enc))

		/** @param {ArrayBuffer} buf */
		return (buf) => decoders.get(enc).decode(buf)
	}

	const originLength = origin.length

	/**
	 * @param {string} url
	 * @return {Promise<Partial<import('./schema').WebPage>>}
	 */
	return async (url) => {
		const r = await fetch(new URL(url, origin))

		const base = {
			status: r.status,
			url: r.url.slice(originLength),
			ctype: '!',
			body: r.statusText,
		}

		if (!r.ok) {
			try {
				return { ...base, body: await r.text() }
			} catch (err) {
				return base
			}
		}

		const ct = r.headers.get('content-type')
		const redir = r.redirected ? { oriURL: url } : null

		if (!ct.startsWith('text/')) {
			return {
				...base,
				...redir,
				ctype: ct,
				body: await r.arrayBuffer(),
			}
		}

		const dc = getDecoder(ct)
		return {
			...base,
			...redir,
			ctype: ct.split(';')[0],
			body: dc ? dc(await r.arrayBuffer()) : await r.text(),
		}
	}
}
