import * as DB from './database.js'

const charsetRegex = /charset=([^;]+)/

/** @type {Map<string, TextDecoder>} */
const decoders = new Map()

/** @param {string} ctype */
const getDecoder = (ctype) => {
	const cs = charsetRegex.exec(ctype)
	if (!cs) return null

	const enc = cs[1].toLowerCase()
	if (enc === 'utf-8') return null
	if (!decoders.has(enc)) decoders.set(enc, new TextDecoder(enc))

	/** @param {ArrayBuffer} buf */
	return (buf) => decoders.get(enc).decode(buf)
}

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
 * process Response from fetch
 * @param {Response} r
 * @return {Promise<Partial<import('./schema').WebPage>>}
 */
export const processResponse = async (r, oriURL = '') => {
	if (!r.ok) throw new Error(r.statusText)

	const ct = r.headers.get('content-type')
	const redir = r.redirected ? { oriURL, newURL: r.url } : null

	if (!ct.startsWith('text/')) {
		return {
			...redir,
			ctype: ct,
			body: await r.arrayBuffer(),
		}
	}

	const dc = getDecoder(ct)
	return {
		...redir,
		ctype: ct.split(';')[0],
		body: dc ? dc(await r.arrayBuffer()) : await r.text(),
	}
}

/**
 * run crawler
 */
export async function* runCrawl() {
	const NO_OP = () => {}

	while (true) {
		const item = await DB.popQueue()
		if (!item) {
			yield null
			continue
		}

		let resp = fetch(item.url).catch(NO_OP)

		yield {
			url: item.url,
			/** @param {Promise<Response>} r */
			useFetch: (r) => {
				resp = r
			},
		}

		try {
			const upd = await processResponse(await resp, item.url)
			await DB.put({
				...item,
				...upd,
				status: 2,
				date: new Date(),
			})
		} catch (err) {
			await DB.put({
				...item,
				status: 4,
				body: err.message ?? `${err}`,
				date: new Date(),
			})
		}
	}
}
