import { getDecoder, processResponse } from './response.js'
import { processQueue } from './spider.js'
import { millis } from './util.js'
import * as STATUS from './status.js'

/** @param {MessageEvent<string>} ev */
const onWorkerMessage = async ({ data: url }) => {
	try {
		self.postMessage(await processResponse(await fetch(url), url))
	} catch (err) {
		self.postMessage({ url, err })
	}
}

const WORKER_SRC = `const decoders=new Map(),getDecoder=${getDecoder},
processResponse=${processResponse};console.log('[W] worker started')
self.addEventListener('message',${onWorkerMessage})`

const workerBlob = new Blob([WORKER_SRC], { type: 'application/javascript' })
const workerURL = URL.createObjectURL(workerBlob)

export const createWorker = (origin = window.origin) => {
	/** @type {Map<string, [unknown, unknown]>} */
	const requests = new Map()

	const worker = new Worker(workerURL, { type: 'module' })
	worker.addEventListener('message', (ev) => {
		const { url, err } = ev.data
		const pr = requests.get(url)
		requests.delete(url)
		return pr ? (err ? pr[0](err) : pr[1](ev.data)) : null
	})

	/**
	 * @param {string} url
	 * @return {Promise<unknown>}
	 */
	const send = (url) => new Promise((rs, rj) => {
		requests.set(url, [rj, rs])
		worker.postMessage(url)
		setTimeout(() => rj('timeout'), 9999)
	})

	return {
		worker,
		requests,
		stop: () => worker.terminate(),
		/** @param {string | URL} url */
		fetch: (url) => send(`${new URL(url, origin)}`),
	}
}

/**
 * @param {Record<string, unknown>} opts
 */
export async function* workerProcessQueue(opts) {
	const delay = parseInt(`${opts?.delay || 666}`)
	const origin = `${opts?.origin || window.origin}`

	const worker = createWorker(origin)
	const originLength = origin.length

	let last = new Date()

	for await (const q of processQueue()) {
		if (!q) {
			await millis(10)
			continue
		}

		const wait = delay + last - new Date()
		if (wait > 0) await millis(wait)

		try {
			/** @type {Partial<import('./schema').WebPage>>} */
			const { url: fullURL, oriURL, ...resp } = await worker.fetch(q.item.url)
			const url = fullURL.slice(originLength)
			last = new Date()
			if (oriURL) {
				const ori = oriURL.slice(originLength)
				q.update({ status: STATUS.REDIRECT, url: ori, newURL: url })
				q.update({ ...q.item, url, oriURL: ori, ...resp })
			} else {
				q.update({ ...q.item, url, ...resp })
			}
			yield url
		} catch (err) {
			last = new Date()
			q.update({ ...q.item, status: STATUS.FETCH_ERROR })
		}
	}
}
