import {
	openDB,
	runFn,
	runCursor,
	createStores,
	promisify as _p,
} from '@musakui/ui/idb'

import * as STATUS from './status.js'

/** @import { WebPage } from './types' */

const STATUS_IDX = 'status'
const QUEUE_IDX = 'queue'

const DATE_IDX = 'updated'
const TAG_IDX = 'tag'

const doneRange = statusRange(STATUS.OK)
const loadedRange = IDBKeyRange.lowerBound(new Date())

export { STATUS }

/** @type {IDBDatabase | null} */
export let db = null

export function txn(rw = false) {
	if (!db) throw new Error('not open')
	return db.transaction('pages', rw ? 'readwrite' : 'readonly')
}

/** @param {WebPage[]} items */
export async function add(...items) {
	return await runFn(txn(true), (s) => {
		return Promise.all(items.map((i) => _p(s.add(i))))
	})
}

/** @param {WebPage[]} items */
export async function put(...items) {
	return await runFn(txn(true), (s) => {
		return Promise.all(items.map((i) => _p(s.put(i))))
	})
}

/** @param {WebPage[]} items */
export async function update(...items) {
	return await runFn(txn(true), (s) => {
		const proms = items.map(async (itm) => {
			return await _p(s.put({ ...(await _p(s.get(itm.url))), ...itm }))
		})
		return Promise.all(proms)
	})
}

/**
 * get database stats
 */
export async function getStats() {
	const r = await runFn(txn(), (store) => {
		return Promise.all([
			_p(store.count()),
			_p(store.index(QUEUE_IDX).count()),
			_p(store.index(STATUS_IDX).count(doneRange)),
			_p(store.index(DATE_IDX).count(loadedRange)),
		])
	})
	return {
		total: r[0],
		queue: r[1],
		done: r[2],
		updated: r[3],
	}
}

/**
 * @param {string[]} links
 */
export async function init(links, reset = false) {
	if (!links) return
	await getDb()
	return await runFn(txn(true), async (store) => {
		if (reset) await _p(store.clear())
		for (const url of links) {
			if (await _p(store.get(url))) continue
			await _p(store.add({ url, status: STATUS.FRESH, q: 1 }))
		}
	})
}

export async function popQueue() {
	return await runFn(txn(true), async (store) => {
		const cur = await _p(store.index(QUEUE_IDX).openCursor())
		if (!cur) return null
		delete cur.value.q
		/** @type {WebPage} */
		const item = { ...cur.value, status: STATUS.FETCHING, ctype: '?' }
		await _p(cur.update(item))
		return item
	})
}

export async function popFetched(ctype = 'text/html') {
	const range = statusRange(STATUS.OK, ctype)

	return await runFn(txn(true), async (store) => {
		const cur = await _p(store.index(STATUS_IDX).openCursor(range))
		if (!cur) return null
		/** @type {WebPage} */
		const item = { ...cur.value, status: STATUS.PARSING }
		await _p(cur.update(item))
		return item
	})
}

/**
 * @param {string[]} tags
 */
export async function countTags(tags) {
	if (!tags?.length) return {}
	const counts = await runFn(txn(), (store) => {
		const idx = store.index(TAG_IDX)
		return Promise.all(tags.map((dt) => _p(idx.count(dt))))
	})
	return Object.fromEntries(tags.map((d, i) => [d, counts[i]]))
}

/**
 * @param {string | IDBKeyRange} tag
 */
export async function* iterTag(tag, rw = false) {
	yield* runCursor(txn(rw), (s) => s.index(TAG_IDX).openCursor(tag))
}

/**
 * @param {string | IDBKeyRange} tag
 * @param {number} q
 */
export async function resetTag(tag, q = 1) {
	const rst = { tag, q, status: STATUS.FRESH }
	for await (const cur of iterTag(tag, true)) {
		await _p(cur.update({ url: cur.value.url, ...rst }))
	}
}

export async function getDb() {
	if (db) return db
	db = await openDB('scraper', {
		version: 1,
		upgrade({ db }) {
			createStores(db, {
				pages: {
					keyPath: 'url',
					indexes: [
						{ name: STATUS_IDX, path: ['status', 'ctype'] },
						{ name: QUEUE_IDX, path: 'q' },
						{ name: DATE_IDX, path: 'date' },
						{ name: TAG_IDX, path: 'tag' },
					],
				},
			})
		},
	})
	return db
}

/**
 * @param {number} s status
 * @param {string} c content-type
 */
function statusRange(s, c = '') {
	return IDBKeyRange.bound([s, c], [s, c + '\uffff'])
}
