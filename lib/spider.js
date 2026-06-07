import * as DB from './database.js'
import { createWorker } from './worker.js'

/** @import { WebPage } from './types' */
/** @typedef {Partial<WebPage>} PartialPage */
/** @typedef {PartialPage & { queue?: Iterable<PartialPage> }} PageUpdate */
/** @typedef {(doc: Document, pg: WebPage) => PageUpdate} ParsePage */

const parser = new DOMParser()

export let controller = new AbortController()

/**
 * @param {number} ms delay
 * @return {Promise<void>}
 */
export const millis = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * @param {object} opts
 * @param {number} [opts.wait]
 * @param {AbortSignal} [opts.signal]
 * @param {(s: string) => void} [opts.notify]
 * @param {ParsePage} opts.parsePage
 */
export async function runParseQueue(opts) {
	const { parsePage, ...rest } = opts
	for await (const pg of processFetched(rest)) {
		opts.notify?.(pg.url)
		await pg.update(parsePage(pg.parse(), pg.page))
	}
}

/**
 * @param {object} [opts]
 * @param {number} [opts.wait]
 * @param {number} [opts.delay]
 * @param {AbortSignal} [opts.signal]
 * @param {(s: string) => void} [opts.notify]
 */
export async function runFetchQueue(opts) {
	const w = createWorker()
	const wt = opts?.wait ?? 10
	const delay = opts?.delay ?? 666
	const signal = opts?.signal ?? controller.signal

	let last = Date.now()

	try {
		while (!signal.aborted) {
			const item = await DB.popQueue()
			if (!item) {
				await millis(wt)
				continue
			}

			const wait = delay + last - Date.now()
			if (wait > 0) await millis(wait)

			/** @type {PartialPage[]} */
			const upd = []

			try {
				opts?.notify?.(item.url)

				/** @type {PartialPage} */
				const resp = await w.fetch(item.url)
				upd.push({ ...item, ...resp })
				if (resp.oriURL) {
					upd.push({
						url: resp.oriURL,
						newURL: resp.url,
						status: DB.STATUS.REDIRECT,
					})
				}
			} catch (err) {
				upd.push({ ...item, body: `${err}`, status: DB.STATUS.FETCH_ERROR })
			}

			const date = new Date()
			await DB.put(...upd.map((p) => ({ ...p, date })))
			last = Date.now()
		}
	} finally {
		w.worker.terminate()
	}
}

/**
 * get fetched items for parsing
 * @param {object} [opts]
 * @param {number} [opts.wait]
 * @param {string} [opts.ctype]
 * @param {AbortSignal} [opts.signal]
 */
export async function* processFetched(opts) {
	const wait = opts?.wait ?? 10
	const ctype = opts?.ctype ?? 'text/html'
	const signal = opts?.signal ?? controller.signal

	let fresh = true

	while (!signal.aborted) {
		const page = await DB.popFetched(ctype)
		if (!page) {
			await millis(wait)
			continue
		}

		const text = typeof page.body === 'string' ? page.body : null
		if (!text) {
			await DB.put({ ...page, status: DB.STATUS.PARSED })
			continue
		}

		fresh = true

		yield {
			url: page.newURL ?? page.url,
			page,
			text,
			/** @param {DOMParserSupportedType} [t] */
			parse(t = 'text/html') {
				return parser.parseFromString(text, t)
			},
			/** @param {PageUpdate} up */
			async update(up) {
				fresh = false
				const { queue, ...pg } = up
				const upd = { ...page, ...pg, status: DB.STATUS.PARSED }
				await DB.put(upd)
				if (!queue) return
				const ref = upd.url
				for (const qp of queue) {
					await DB.add({ ref, ...qp, status: DB.STATUS.FRESH }).catch(NO_OP)
				}
			},
		}

		if (fresh) {
			await DB.put({ ...page, status: DB.STATUS.PARSED })
		}
	}
}

/** @param {unknown} reason */
export function stop(reason) {
	controller.abort(reason)
	controller = new AbortController()
}

function NO_OP() {}
