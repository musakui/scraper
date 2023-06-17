import type { DBSchema } from 'idb'

export interface WebPage {
	/** page URL */
	url: string

	/** update timestamp */
	date?: Date

	/** response body */
	body?: string | ArrayBuffer

	/** response Content-Type */
	ctype?: string

	/** response original URL (if redirected) */
	oriURL?: string

	/** response final URL (if redirected) */
	newURL?: string

	/** page status */
	status?: number

	/** page referrer */
	ref?: string

	/** page type */
	ptype?: string

	/** download queue priority */
	q?: number
}

export interface ScraperDB extends DBSchema {
	pages: {
		key: string
		value: WebPage
		indexes: {
			type: string
			updated: Date
			queue: number
			status: [number, string]
		}
	}
}
