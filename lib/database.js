import { openDB } from 'idb/with-async-ittr'
import * as STATUS from './status.js'

const STORE_NAME = 'pages'

const STATUS_IDX = 'status'
const QUEUE_IDX = 'queue'

const DATE_IDX = 'updated'
const TAG_IDX = 'tag'

/**
 * @param {string} s status
 * @param {string} c content-type
 */
const statusRange = (s, c = '') => IDBKeyRange.bound([s, c], [s, c + '\uffff'])

const doneRange = statusRange(STATUS.OK)
const loadedRange = IDBKeyRange.lowerBound(new Date())

export { STATUS }

export const VERSION = 1

export let name = 'scraper'

/** @type {import('idb').IDBPDatabase<import('./schema').ScraperDB>} */
export let database = null

export const open = async () => {
	if (database) return database
	database = await openDB(name, VERSION, {
		upgrade(db) {
			const store = db.createObjectStore(STORE_NAME, { keyPath: 'url' })
			store.createIndex(STATUS_IDX, ['status', 'ctype'])
			store.createIndex(QUEUE_IDX, 'q')
			store.createIndex(DATE_IDX, 'date')
			store.createIndex(TAG_IDX, 'tag')
		},
	})
	return database
}

/**
 * open a readwrite transaction
 */
export const rwtx = async () => {
	const db = await open()
	return db.transaction(STORE_NAME, 'readwrite')
}

/**
 * open a readonly transaction
 */
export const rotx = async () => {
	const db = await open()
	return db.transaction(STORE_NAME, 'readonly')
}

/** @param {import('./schema').WebPage} item */
export const put = async (item) => (await open()).put(STORE_NAME, item)

/** @param {import('./schema').WebPage} item */
export const add = async (item) => (await open()).add(STORE_NAME, item)

/**
 * get database stats
 */
export const stats = async () => {
	const tx = await rotx()
	const total = await tx.store.count()
	const queue = await tx.store.index(QUEUE_IDX).count()
	const updated = await tx.store.index(DATE_IDX).count(loadedRange)
	const done = await tx.store.index(STATUS_IDX).count(doneRange)
	await tx.done

	return {
		total,
		queue,
		done,
		updated,
	}
}

/**
 * @param {string[]} links
 */
export const init = async (links, reset = false) => {
	if (!links) return
	const tx = await rwtx()
	if (reset) {
		await tx.store.clear()
	}
	for (const url of links) {
		await tx.store.add({ url, status: STATUS.FRESH, q: 1 })
	}
	await tx.done
}

export const popQueue = async () => {
	const tx = await rwtx()
	const cur = await tx.store.index(QUEUE_IDX).openCursor()
	if (!cur) {
		await tx.done
		return null
	}
	const item = cur.value
	delete item.q
	await cur.update({ ...item, status: STATUS.FETCHING, ctype: '?' })
	await tx.done
	return item
}

export const popFetched = async (ctype = 'text/html') => {
	const tx = await rwtx()
	const cur = await tx.store.index(STATUS_IDX).openCursor(statusRange(STATUS.OK, ctype))
	if (!cur) {
		await tx.done
		return null
	}
	const item = cur.value
	await cur.update({ ...item, status: STATUS.PARSING })
	await tx.done
	return item
}

/**
 * @param {string[]} tags
 */
export const countTags = async (tags) => {
	if (!tags?.length) return {}
	const tx = await rotx()
	const idx = tx.store.index(TAG_IDX)
	const counts = await Promise.all(tags.map((dt) => idx.count(dt)))
	await tx.done
	return Object.fromEntries(tags.map((d, i) => [d, counts[i]]))
}

/**
 * @param {string | IDBKeyRange} tag
 */
export async function* getTag(tag) {
	const tx = await rotx()
	const idx = tx.store.index(TAG_IDX)
	for await (const cur of idx.iterate(tag)) {
		yield cur.value
	}
	await tx.done
}

/**
 * @param {string | IDBKeyRange} tag
 */
export const resetTag = async (tag) => {
	const tx = await rwtx()
	const idx = tx.store.index(TAG_IDX)
	for await (const cur of idx.iterate(tag)) {
		const { url, ref, tag } = cur.value
		await cur.update({ url, ref, tag, status: STATUS.FRESH, q: 1 })
	}
	await tx.done
}
