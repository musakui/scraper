import * as DB from './database.js'
import * as STATUS from './status.js'

/**
 * process fetch queue
 */
export async function* processQueue() {
	while (true) {
		const item = await DB.popQueue()
		if (!item) {
			yield null
			continue
		}

		/** @type {Array<Promise<Partial<import('./schema').WebPage>>>} */
		const upd = []

		yield {
			item,
			/** @param {Partial<import('./schema').WebPage>} u */
			update: (u) => upd.push(u),
		}

		const date = new Date()

		if (upd.length) {
			for (const u of upd) {
				await DB.put({ ...(await u), date })
			}
		} else {
			await DB.put({ ...item, date, status: STATUS.NO_RESPONSE })
		}
	}
}

/**
 * process parse queue
 */
export async function* processFetched() {
	let fresh = true
	const NO_OP = () => {}
	const parser = new DOMParser()

	while (true) {
		const page = await DB.popFetched()
		if (!page) {
			yield null
			continue
		}

		fresh = true

		/**
		 * @param {Partial<import('./schema').WebPage>} pg
		 * @param {import('./schema').LinkQueue} [queue]
		 */
		const update = async (pg, queue) => {
			fresh = false
			const upd = { ...page, ...pg, status: STATUS.PARSED }
			await DB.put(upd)
			if (queue) {
				const ref = upd.url
				for (const [url, qp] of queue) {
					await DB.add({ url, ref, ...qp, status: STATUS.FRESH }).catch(NO_OP)
				}
			}
		}

		yield {
			update,
			url: page.newURL ?? page.url,
			doc: parser.parseFromString(page.body, 'text/html'),
		}

		if (fresh) {
			await update(null)
		}
	}
}
