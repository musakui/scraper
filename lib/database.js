import { openDB } from 'idb/with-async-ittr'

export const VERSION = 1

const STORE_NAME = 'pages'
const QUEUE_IDX = 'queue'
const DATE_IDX = 'updated'

/**
 * @typedef DBItem
 * @prop {string} url page pathname
 * @prop {number} [q] queue priority
 * @prop {string} [referrer]
 * @prop {string} [ctype] Content-Type
 * @prop {string} [redirect]
 * @prop {Date} [date]
 * @prop {string} [text]
 * @prop {string} [head]
 * @prop {string} [body]
 * @prop {string[]} [links]
 *
 * @typedef PagesSchema
 * @prop {string} key
 * @prop {DBItem} value
 * @prop {{ [QUEUE_IDX]: number, [DATE_IDX]: Date }} indexes
 *
 * @typedef ScraperDBSchema
 * @prop {PagesSchema} pages
 *
 * @typedef {ReturnType<typeof open>} ScraperDB
 * @typedef {Awaited<ReturnType<ScraperDB['stats']>>} ScraperStats
 */

/**
 * @param {string} name database name
 */
export const open = (name) => {
	if (!name) throw new Error('database name required')

	/** @type {import('idb').IDBPDatabase<ScraperDBSchema>} */
	let database = null

	const db = async () => {
		if (database) return database
		database = await openDB(name, VERSION, {
			upgrade(db) {
				const store = db.createObjectStore(STORE_NAME, { keyPath: 'url' })
				store.createIndex(DATE_IDX, 'date')
				store.createIndex(QUEUE_IDX, 'q')
			},
		})
		return database
	}

	const transaction = async () => (await db()).transaction(STORE_NAME, 'readwrite')

	const stats = async () => {
		const tx = (await db()).transaction(STORE_NAME)
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
		const tx = await transaction()
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
		const idx = (await db()).transaction(STORE_NAME).store.index(DATE_IDX)
		for await (const cur of idx.iterate()) {
			yield cur.value
		}
	}

	return {
		get database () { return database },
		stats,
		transaction,
		completedItems,
		getURLs: async () => (await db()).getAllKeysFromIndex(STORE_NAME, DATE_IDX),
		pop,
		/** @param {DBItem} item */
		put: async (item) => (await db()).put(STORE_NAME, item),
		/** @param {DBItem} item */
		add: async (item) => (await db()).add(STORE_NAME, item),
	}
}