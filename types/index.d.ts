declare module '@musakui/scraper/db' {
	import type { DBSchema } from 'idb';
	export function getTag(tag: string | IDBKeyRange): AsyncGenerator<WebPage, void, unknown>;
	export const VERSION: 1;
	export let name: string;

	export let database: import('idb').IDBPDatabase<ScraperDB>;
	export function open(): Promise<import("idb").IDBPDatabase<ScraperDB>>;
	export function rwtx(): Promise<import("idb").IDBPTransaction<ScraperDB, ["pages"], "readwrite">>;
	export function rotx(): Promise<import("idb").IDBPTransaction<ScraperDB, ["pages"], "readonly">>;
	export function put(item: WebPage): Promise<string>;
	export function add(item: WebPage): Promise<string>;
	export function stats(): Promise<{
		total: number;
		queue: number;
		done: number;
		updated: number;
	}>;
	export function init(links: string[], reset?: boolean): Promise<void>;
	export function popQueue(): Promise<WebPage | null>;
	export function popFetched(ctype?: string): Promise<WebPage | null>;
	export function countTags(tags: string[]): Promise<{
		[k: string]: number;
	}>;
	export function resetTag(tag: string | IDBKeyRange): Promise<void>;
	interface WebPage {
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
	}

	interface ScraperDB extends DBSchema {
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
}

declare module '@musakui/scraper' {
	import type { DBSchema } from 'idb';
	export function getTag(tag: string | IDBKeyRange): AsyncGenerator<WebPage, void, unknown>;
	export const VERSION: 1;
	export let name: string;

	export let database: import('idb').IDBPDatabase<ScraperDB>;
	export function open(): Promise<import("idb").IDBPDatabase<ScraperDB>>;
	export function rwtx(): Promise<import("idb").IDBPTransaction<ScraperDB, ["pages"], "readwrite">>;
	export function rotx(): Promise<import("idb").IDBPTransaction<ScraperDB, ["pages"], "readonly">>;
	export function put(item: WebPage): Promise<string>;
	export function add(item: WebPage): Promise<string>;
	export function stats(): Promise<{
		total: number;
		queue: number;
		done: number;
		updated: number;
	}>;
	export function init(links: string[], reset?: boolean): Promise<void>;
	export function popQueue(): Promise<WebPage | null>;
	export function popFetched(ctype?: string): Promise<WebPage | null>;
	export function countTags(tags: string[]): Promise<{
		[k: string]: number;
	}>;
	export function resetTag(tag: string | IDBKeyRange): Promise<void>;
	/**
	 * process fetch queue
	 */
	export function processQueue(): AsyncGenerator<{
		item: WebPage;
		update: (u: Partial<WebPage>) => number;
	} | null, void, unknown>;
	/**
	 * process parse queue
	 */
	export function processFetched(): AsyncGenerator<{
		update: (pg: Partial<WebPage>, queue?: LinkQueue | undefined) => Promise<void>;
		url: string;
		doc: Document;
	} | null, void, unknown>;
	export function workerProcessQueue(opts: Record<string, unknown>): AsyncGenerator<string, void, unknown>;
	export function createWorker(origin?: string): {
		worker: Worker;
		requests: Map<string, [unknown, unknown]>;
		stop: () => void;
		fetch: (url: string | URL) => Promise<unknown>;
	};
	interface WebPage {
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
	}

	type LinkQueue = Map<string, Partial<WebPage>>

	interface ScraperDB extends DBSchema {
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
}

//# sourceMappingURL=index.d.ts.map