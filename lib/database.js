import { openDB } from 'idb/with-async-ittr'

export const VERSION = 1

const STORE_NAME = 'pages'
const QUEUE_IDX = 'queue'
const DATE_IDX = 'updated'

/** @typedef {import('./schema.d').DBItem} DBItem */

/**
 * @param {string} name database name
 */
export const open = async (name) => {
	if (!name) throw new Error('database name required')

	/** @type {import('idb').IDBPDatabase<import('./schema.d').ScraperDB}>} */
	const db = await openDB(name, VERSION, {
		upgrade(db) {
			const store = db.createObjectStore(STORE_NAME, { keyPath: 'url' })
			store.createIndex(DATE_IDX, 'date')
			store.createIndex(QUEUE_IDX, 'q')
		},
	})

	const stats = async () => {
		const tx = db.transaction(STORE_NAME)
		const total = await tx.store.count()
		const queue = await tx.store.index(QUEUE_IDX).count()
		const done = tx.store.index(DATE_IDX)
		const complete = await done.count()
		const latest = complete ? (await done.openCursor(null, 'prev')).value.url : null
		await tx.done
		return {
			total,
			queue,
			complete,
			latest,
		}
	}

	const pop = async () => {
		const tx = db.transaction(STORE_NAME, 'readwrite')
		const cur = await tx.store.index(QUEUE_IDX).openCursor()
		if (!cur) {
			await tx.done
			return null
		}
		const item = cur.value
		await cur.update({ url: item.url })
		await tx.done
		return item
	}

	async function * completedItems () {
		const idx = db.transaction(STORE_NAME).store.index(DATE_IDX)
		for await (const cur of idx.iterate()) {
			yield cur.value
		}
	}

	return {
		database: db,
		stats,
		completedItems,
		getURLs: () => db.getAllKeysFromIndex(STORE_NAME, DATE_IDX),
		transaction: () => db.transaction(STORE_NAME, 'readwrite'),
		pop,
		/** @param {DBItem} item */
		put: (item) => db.put(STORE_NAME, item),
		/** @param {DBItem} item */
		add: (item) => db.add(STORE_NAME, item),
	}
}