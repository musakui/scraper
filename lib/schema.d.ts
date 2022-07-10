import { DBSchema } from 'idb'

export interface DBItem {
	url: string

	// queue
	q?: number
	referrer?: string

	ctype?: string
	redirect?: string

	// scraped
	date?: Date
	text?: string
	head?: string
	body?: string
	links?: string[]
}

export interface ScraperDB extends DBSchema {
	pages: {
		key: string
		value: DBItem
		indexes: {
			queue: number
			updated: Date
		}
	}
}
