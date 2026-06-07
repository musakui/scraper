const WORKER_SRC = `(${initWorker})('${window.origin}')`
const WORKER_BLOB = new Blob([WORKER_SRC], { type: 'application/javascript' })

/** @typedef {PromiseWithResolvers<unknown>} UnknownResolver */

export function createWorker() {
	/** @type {Map<string, UnknownResolver>} */
	const requests = new Map()

	const workerURL = URL.createObjectURL(WORKER_BLOB)
	const worker = new Worker(workerURL, { type: 'module' })

	worker.addEventListener('message', (evt) => {
		const { url, err } = evt.data
		const pr = requests.get(url)
		requests.delete(url)
		if (!pr) return
		err ? pr.reject(err) : pr.resolve(evt.data)
	})

	URL.revokeObjectURL(workerURL)

	return {
		worker,
		/** @param {string} url */
		fetch(url) {
			/** @type {UnknownResolver} */
			const rez = Promise.withResolvers?.() ?? withResolvers()
			requests.set(url, rez)
			worker.postMessage(url)
			setTimeout(() => rez.reject('timeout'), 9999)
			return rez.promise
		},
	}
}

/** @param {string} origin */
function initWorker(origin) {
	const oriLen = origin.length

	self.addEventListener('message', async ({ data }) => {
		try {
			self.postMessage(await workerFetch(data))
		} catch (err) {
			self.postMessage({ url: data, err })
		}
	})

	console.log('[W] worker started')

	async function workerFetch(url) {
		const r = await fetch(new URL(url, origin))

		const base = {
			status: r.status,
			url: r.url.slice(oriLen),
			ctype: '!',
			body: r.statusText,
			...(r.redirected ? { oriURL: url } : null),
		}

		if (!r.ok) {
			try {
				return { ...base, body: await r.text() }
			} catch (err) {
				return base
			}
		}

		const ct = r.headers.get('content-type')
		if (!ct.startsWith('text/')) {
			return { ...base, ctype: ct, body: await r.arrayBuffer() }
		}

		return { ...base, ctype: ct.split(';')[0], body: await r.text() }
	}
}

function withResolvers() {
	/** @type {UnknownResolver} */
	const out = {}
	out.promise = new Promise((rs, rj) => {
		out.resolve = rs
		out.reject = rj
	})
	return out
}
