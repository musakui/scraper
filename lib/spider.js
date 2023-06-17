import * as DB from './database.js'

export async function* runSpider() {
	let fresh = true
	const NO_OP = () => {}
	const parser = new DOMParser()

	while (true) {
		const page = await DB.popDone()
		if (!page) {
			yield null
			continue
		}

		fresh = true

		/**
		 * @param {Partial<import('./schema').WebPage>} pg
		 * @param {Map<string, Partial<import('./schema').WebPage>>} [queue]
		 */
		const update = async (pg, queue) => {
			fresh = false
			const upd = { ...page, ...pg, status: 0 }
			await DB.put(upd)
			if (queue) {
				const ref = upd.url
				for (const [url, qp] of queue) {
					await DB.add({ url, ref, ...qp }).catch(NO_OP)
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
