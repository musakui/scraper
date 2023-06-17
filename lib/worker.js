const WORKER_SRC = `self.addEventListener('message',e=>import(e.data),{once:!0})`
const workerBlob = new Blob([WORKER_SRC], { type: 'application/javascript' })
const workerURL = URL.createObjectURL(workerBlob)

/** @param {string} script */
export const createWorker = (script) => {
	const worker = new Worker(workerURL, { type: 'module' })
	worker.postMessage(script)
	return worker
}

export const createWorkerCrawler = (count = 1) => {
	const src = import.meta.resolve('./workerCrawler.js')
	const workers = Array.from({ length: count || 1 }, (_, i) => {
		const w = createWorker(src)
		return w
	})

	/** @param {unknown} data */
	const send = (data) => {
		for (const w of workers) w.postMessage(JSON.stringify(data))
	}

	const stop = () => {
		send({ action: 'stop' })
		setTimeout(() => {
			for (const w of workers) w.terminate()
		}, 999)
	}

	return {
		workers,
		send,
		stop,
		/** @param {Record<string, unknown>} data */
		start: (data) => send({ action: 'start', ...data }),
	}
}
