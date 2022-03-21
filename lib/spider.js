import { open } from './database.js'
import { ratedFetch, millis } from './ratedFetch.js'

/**
 * @param {URL} url
 */
const defaultCanonise = (url) => `${url.pathname}${url.search}`

/**
 * @typedef SpiderStats
 * @prop {number} time
 * @prop {number} queue
 * @prop {number} added
 * @prop {number} addRate
 * @prop {number} completed
 */

/**
 * @typedef SpiderOptions
 * @prop {string} linkSelector selector for links to follow
 * @prop {(url: URL) => string} canonise convert URL to canonical form
 * @prop {(url: URL) => number} priority get priority of URL
 * @prop {number} parallel
 * @prop {number} delay
 */

/**
 * @param {Partial<SpiderOptions>} [options]
 */
export const create = async (options) => {
  let running = false

  const {
    linkSelector = 'a',
    parallel = 4,
    delay = 666,
    ...opts //
  } = options || {}

  const rFetch = ratedFetch(parallel, delay)
  const canonise = opts.canonise || defaultCanonise
  const priority = opts.priority

  const origin = window.origin
  const batchSize = parallel * 2
  const parser = new DOMParser()

  const charsetRegex = /charset=(.+)/
  const textDecoders = new Map()
  const getDecoder = (ctype) => {
    const cs = charsetRegex.exec(ctype)
    if (!cs) return null
    const enc = cs[1].toLowerCase()
    if (enc === 'utf-8') return null
    if (!textDecoders.has(enc)) textDecoders.set(enc, new TextDecoder(enc))
    return (buf) => textDecoders.get(enc).decode(buf)
  }

  const db = await open()

  /**
   * @param {Map<string, number>} links
   * @param {string} referrer
   */
  const queueLinks = async (links, referrer) => {
    for (const [url, q] of links) {
      try {
        await db.add('pages', { url, q, referrer })
      } catch (err) {}
    }
  }

  /**
   * @param {string} url
   * @param {Date} date
   * @param {Document} doc
   */
  const addPage = async (url, date, doc) => {
    if (!url || !doc) return
    /**
     * @type {Map<string, number>}
     */
    const seen = new Map()
    for (const el of doc.querySelectorAll(linkSelector)) {
      if (!el.href || el.href.startsWith('javascript')) continue
      const u = new URL(el.href)
      if (u.origin !== origin) continue
      const canon = canonise(u)
      if (!canon || seen.has(canon)) continue
      seen.set(canon, (priority ? priority(u) : null) || 0)
    }
    const links = [...seen.keys()]
    const head = doc.head.innerHTML.trim()
    const body = doc.body.innerHTML.trim()
    await db.put('pages', { url, date, head, body, links })
    queueLinks(seen, url)
  }

  const statWindow = 5

  /**
   * crawling statistics
   * @type {SpiderStats[]}
   */
  const stats = []

  /**
   * @param {number} time
   */
  const updateStat = async (time) => {
    const tx = db.transaction('pages')
    const queue = await tx.store.index('queue').count()
    const completed = await tx.store.index('updated').count()
    await tx.done

    const added = completed - (stats[stats.length - 1]?.completed || 0)

    const avg = stats.slice(-statWindow)
    const addTotal = avg.reduce((t, s) => t + s.added, 0)

    stats.push({
      time,
      queue,
      added,
      addRate: addTotal / avg.length,
      completed,
    })
  }

  /**
   * run spider
   * @param {number} stat stats update interval (ms) [default: 1000]
   */
  const run = async (stat = 1000) => {
    let exhausted = 0
    const batch = []
    const started = Date.now()

    if (running) return
    running = true

    if (stat) {
      millis(1).then(async () => {
        while (running) {
          const now = Date.now()
          await updateStat((now - started) / 1000)
          await millis(stat + now - Date.now() - 10)
        }
      })
    }

    while (running) {
      const tx = db.transaction('pages', 'readwrite')
      const cur = await tx.store.index('queue').openCursor()
      if (!cur) {
        await tx.done
        if (++exhausted > 10) {
          running = false
        } else {
          await millis(250)
        }
        continue
      }
      const { url, referrer } = cur.value
      await cur.update({ url })
      await tx.done
      const putError = (error) => db.put('pages', { url, referrer, error })
      const fetched = new Date()
      const task = rFetch(url)
        .then(async (r) => {
          if (!r.ok) return putError(r.statusText)
          const ctype = r.headers.get('content-type')
          const isText = ctype.startsWith('text/')
          const redirect = r.redirected ? r.url : null
          if (redirect || !isText) {
            await db.put('pages', {
              url,
              referrer,
              ...(redirect ? { redirect } : null),
              ...(isText ? null : { ctype }),
            })
          }
          if (!isText) return
          if (!ctype.startsWith('text/html')) {
            return
          }
          const decode = getDecoder(ctype)
          const txt = decode ? decode(await r.arrayBuffer()) : (await r.text())
          const doc = parser.parseFromString(txt.replace(/\s\s+/gms, ' '), 'text/html')
          await addPage(redirect ? canonise(new URL(r.url)) : url, fetched, doc)
        })
        .catch((err) => putError(`${err}`))

      batch.push(task)
      while (batch.length > batchSize) {
        await batch.shift()
      }
    }
  }

  /**
   * start crawling
   * @param {string} url start path
   */
  const start = async (url) => {
    try {
      await db.add('pages', { url, q: 0 })
    } catch (err) {}
    return await run()
  }

  /**
   * stop crawling
   */
  const stop = () => {
    running = false
  }

  return {
    stats,
    start,
    stop,
    run,
    db,
  }
}
