import type { DBSchema } from 'idb'

export interface WebPage {
	/** page URL (db key) */
	url: string

	/** scrape status */
	status?: number

	/** update timestamp */
	date?: Date

	/** user-set tags */
	tag?: string

	/** referrer */
	ref?: string

	/** response body */
	body?: string | ArrayBuffer

	/** response Content-Type */
	ctype?: string

	/** response original URL (if redirected) */
	oriURL?: string

	/** response final URL (if redirected) */
	newURL?: string

	/** scrape queue priority */
	q?: number

	/** local metadata store */
	meta?: Record<string, unknown>
}

export interface ScraperDB extends DBSchema {
	pages: {
		key: string
		value: WebPage
		indexes: {
			tag: string
			queue: number
			updated: Date
			status: [number, string]
		}
	}
}
