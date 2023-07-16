import { millis, requestProcessor } from './util.js'
import { processQueue } from './spider.js'
import * as STATUS from './status.js'

/** @param {MessageEvent<string>} ev */
const onWorkerMessage = async ({ data }) => {
	try {
		self.postMessage(await self.proc(data))
	} catch (err) {
		self.postMessage({ url: data, err })
	}
}

const WORKER_SRC = `self.proc=(${requestProcessor})('${window.origin}')
console.log('[W] worker started')
self.addEventListener('message',${onWorkerMessage})`

const workerBlob = new Blob([WORKER_SRC], { type: 'application/javascript' })
const workerURL = URL.createObjectURL(workerBlob)

export const createWorker = () => {
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
		fetch: send,
	}
}

/**
 * @param {Record<string, unknown>} opts
 */
export async function* workerProcessQueue(opts) {
	const delay = parseInt(`${opts?.delay || 666}`)

	const worker = createWorker()

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
			const resp = await worker.fetch(q.item.url)
			last = new Date()
			q.update({ ...q.item, ...resp })
			if (resp.oriURL) {
				q.update({
					url: resp.oriURL,
					newURL: resp.url,
					status: STATUS.REDIRECT,
				})
			}
			yield url
		} catch (err) {
			last = new Date()
			q.update({ ...q.item, status: STATUS.FETCH_ERROR })
		}
	}
}
