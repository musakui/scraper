import * as DB from './database.js'

/** @typedef {Partial<import('./schema').WebPage>} PartialPage */

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

		/** @type {Array<PartialPage | Promise<PartialPage>>} */
		const upd = []

		yield {
			item,
			/** @param {(typeof upd)[number]} u */
			update: (u) => upd.push(u),
		}

		const date = new Date()

		if (upd.length) {
			for (const u of upd) {
				await DB.put({ ...(await u), date })
			}
		} else {
			await DB.put({ ...item, date, status: DB.STATUS.NO_RESPONSE })
		}
	}
}

/**
 * process parse queue
 */
export async function* processFetched() {
	let fresh = true
	const NO_OP = () => {}

	while (true) {
		const page = await DB.popFetched()
		if (!page) {
			yield null
			continue
		}

		fresh = true

		/**
		 * @param {PartialPage} pg
		 * @param {Iterable<PartialPage>} [queue]
		 */
		const update = async (pg, queue) => {
			fresh = false
			const upd = { ...page, ...pg, status: DB.STATUS.PARSED }
			await DB.put(upd)
			if (queue) {
				const ref = upd.url
				for (const qp of queue) {
					await DB.add({ ref, ...qp, status: DB.STATUS.FRESH }).catch(NO_OP)
				}
			}
		}

		yield {
			update,
			url: page.newURL ?? page.url,
			raw: page.body,
			...(typeof page.body === 'string' ? { text: page.body } : null),
		}

		if (fresh) {
			await update(null)
		}
	}
}
