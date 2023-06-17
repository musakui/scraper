import { openDB } from 'idb/with-async-ittr'

const STORE_NAME = 'pages'
const QUEUE_IDX = 'queue'
const TYPE_IDX = 'type'
const DATE_IDX = 'updated'
const STATUS_IDX = 'status'

const loadedRange = IDBKeyRange.lowerBound(new Date())
const doneRange = IDBKeyRange.bound([0, ''], [0, '\uffff'])

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
			store.createIndex(TYPE_IDX, 'ptype')
			store.createIndex(DATE_IDX, 'date')
			store.createIndex(QUEUE_IDX, 'q')
		},
	})
	return database
}

/**
 * open a readwrite transaction
 */
export const rwtx = async () => {
	const d = await open()
	return d.transaction(STORE_NAME, 'readwrite')
}

/**
 * open a readonly transaction
 */
export const rotx = async () => {
	const d = await open()
	return d.transaction(STORE_NAME, 'readonly')
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
export const init = async (links) => {
	if (!links) return
	const tx = await rwtx()
	await tx.store.clear()
	for (const url of links) {
		await tx.store.add({ url, q: 0 })
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
	await cur.update({ ...item, status: 1, ctype: '?' })
	await tx.done
	return item
}

export const popDone = async (ctype = 'text/html') => {
	const tx = await rwtx()
	const bd = IDBKeyRange.bound([2, ctype], [2, ctype + '\uffff'])
	const cur = await tx.store.index(STATUS_IDX).openCursor(bd)
	if (!cur) {
		await tx.done
		return null
	}
	const item = cur.value
	await cur.update({ ...item, status: 3 })
	await tx.done
	return item
}

/**
 * @param {string[]} ptypes
 */
export const countPageTypes = async (ptypes) => {
	if (!ptypes?.length) return {}
	const tx = await rotx()
	const idx = tx.store.index(TYPE_IDX)
	const counts = await Promise.all(ptypes.map((dt) => idx.count(dt)))
	await tx.done
	return Object.fromEntries(ptypes.map((d, i) => [d, counts[i]]))
}

/**
 * @param {string | IDBKeyRange} ptype
 */
export async function* getPagesOfType(ptype) {
	const tx = await rotx()
	const idx = tx.store.index(TYPE_IDX)
	for await (const cur of idx.iterate(ptype)) {
		yield cur.value
	}
	await tx.done
}

/**
 * @param {string | IDBKeyRange} ptype
 */
export const resetPageType = async (ptype) => {
	const tx = await rwtx()
	const idx = tx.store.index(TYPE_IDX)
	for await (const cur of idx.iterate(ptype)) {
		const { url, ref, ptype } = cur.value
		await cur.update({ url, q: 1, ref, ptype })
	}
	await tx.done
}
