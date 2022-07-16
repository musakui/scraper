import { open } from './database.js'
import { ratedFetch, millis } from './ratedFetch.js'

/**
 * @param {URL} url
 */
const defaultCanonise = (url) => `${url.pathname}${url.search}`

/**
 * @typedef SpiderOptions
 * @prop {string} linkSelector selector for links to follow
 * @prop {(url: URL) => string} canonise convert URL to canonical form
 * @prop {(url: URL) => number} priority get priority of URL
 * @prop {number} parallel
 * @prop {number} delay
 *
 * @typedef {ReturnType<typeof create>} Spider
 */

/**
 * @param {string} name IndexedDB database name
 * @param {Partial<SpiderOptions>} [options]
 */
export const create = (name, options) => {
	let go = false
	let running = false

	const {
		linkSelector = 'a',
		parallel = 4,
		delay = 666,
		...opts //
	} = options || {}

	const db = open(name)
	const rFetch = ratedFetch(parallel, delay)
	const canonise = opts.canonise || defaultCanonise
	const priority = opts.priority
	const defaultBatchSize = parallel * 2

	const origin = window.origin
	const parser = new DOMParser()
	const charsetRegex = /charset=(.+)/

	/** @type {Map<string, TextDecoder>} */
	const textDecoders = new Map()

	/**
	 * @param {string} ctype
	 */
	const getDecoder = (ctype) => {
		const cs = charsetRegex.exec(ctype)
		if (!cs) return null
		const enc = cs[1].toLowerCase()
		if (enc === 'utf-8') return null
		if (!textDecoders.has(enc)) textDecoders.set(enc, new TextDecoder(enc))
		/**
		 * @param {ArrayBuffer} buf
		 */
		return (buf) => textDecoders.get(enc).decode(buf)
	}

	/**
	 * @param {Map<string, number>} links
	 * @param {string} referrer
	 */
	const queueLinks = async (links, referrer) => {
		for (const [url, q] of links) {
			await db.add({ url, q, referrer }).catch(() => {})
		}
	}

	/**
	 * @param {string} url
	 * @param {Date} date
	 * @param {string} text
	 * @param {boolean} isDoc
	 */
	const addPage = async (url, date, text, isDoc) => {
		if (!url || !text) return
		if (!isDoc) {
			await db.put({ url, date, text })
			return
		}
		const doc = parser.parseFromString(text, 'text/html')
		if (!doc) return

		/** @type {Map<string, number>} */
		const seen = new Map()
		for (const el of doc.querySelectorAll(linkSelector)) {
			if (!el.href || el.href.startsWith('javascript')) continue
			const u = new URL(el.href)
			if (u.origin !== origin) continue
			const canon = canonise(u)
			if (!canon || seen.has(canon)) continue
			seen.set(canon, (priority ? priority(u) : null) || 0)
		}
		const links = [...seen.keys()]
		const head = doc.head.innerHTML.trim()
		const body = doc.body.innerHTML.trim()
		await db.put({ url, date, head, body, links })
		queueLinks(seen, url)
	}

	/**
	 * @param {number} batchSize maximum concurrent tasks
	 */
	const run = async (batchSize = defaultBatchSize) => {
		if (running) return
		running = true
		go = true

		let exhausted = 0
		const batch = []

		while (go) {
			const item = await db.pop()
			if (item === null) {
				if (++exhausted > 10) {
					go = false
				} else {
					await millis(250)
				}
				continue
			}
			delete item.q
			const putError = (error) => db.put({ ...item, error })
			const fetched = new Date()
			const task = rFetch(item.url).then(async (r) => {
				if (!r.ok) return putError(r.statusText)
				const ctype = r.headers.get('content-type')
				const ntext = !ctype.startsWith('text/')
				const redirect = r.redirected ? r.url : null
				if (redirect || ntext) {
					await db.put({
						...item,
						...(redirect ? { redirect } : null),
						...(ntext ? { ctype } : null),
					})
				}
				if (ntext) return
				const dc = getDecoder(ctype)
				const txt = dc ? dc(await r.arrayBuffer()) : (await r.text())
				const url = redirect ? canonise(new URL(r.url)) : item.url
				await addPage(url, fetched, txt, ctype.startsWith('text/html'))
			}).catch((err) => putError(err.message || `${err}`))

			batch.push(task)
			while (batch.length > batchSize) {
				await batch.shift()
			}
		}

		await Promise.all(batch)
		running = false
	}

	/**
	 * @param {string} url start path
	 */
	const start = async (url) => {
		const tx = db.transaction()
		if (await tx.store.get(url)) {
			for await (const cur of tx.store) {
				const { url, q, date, referrer } = cur.value
				if (q === undefined && !date && !referrer) {
					await cur.update({ url, q: 0 })
				}
			}
		} else {
			await tx.store.add({ url, q: 0 })
		}
		await tx.done
		run()
		return db.stats()
	}

	const stop = async () => {
		go = false
		while (running) {
			await millis(100)
		}
		return db.stats()
	}

	return {
		start,
		stop,
		run,
		getStats: () => db.stats(),
		get active () { return running },
	}
}
