import { openDB } from 'idb'

export const VERSION = 1

/**
 * @typedef ScraperPage
 * @prop {string} url canonical URL
 * @prop {number} [q] queue priority
 * @prop {string} [referrer] referrer page
 * @prop {Date} [date] fetched timestamp
 * @prop {string} [head] document.head
 * @prop {string} [body] document.body
 * @prop {string[]} [links] outbound links
 * @prop {string} [redirect] redirects to URL
 * @prop {string} [error] error
 * @prop {string} [ctype] content-type (for invalid url)
 */

/**
 * @typedef ScraperDB
 * @prop {object} pages
 * @prop {string} pages.key
 * @prop {ScraperPage} pages.value
 * @prop {object} pages.indexes
 * @prop {number} pages.indexes.queue
 * @prop {Date} pages.indexes.updated
 */

/**
 * @return {Promise<import('idb').IDBPDatabase<ScraperDB>>}
 */
export const open = () =>
  openDB('scraper', VERSION, {
    upgrade(db) {
      const store = db.createObjectStore('pages', { keyPath: 'url' })
      store.createIndex('updated', 'date')
      store.createIndex('queue', 'q')
    },
  })
