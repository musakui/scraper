# scraper
> web scraper using IndexedDB as storage

[![npm](https://img.shields.io/npm/v/@musakui/scraper.svg)](https://www.npmjs.com/package/@musakui/scraper)

## Quickstart

```js
const spider = await import('https://cdn.skypack.dev/@musakui/scraper/spider').then(({ create }) => create())
spider.start('/')
```

## Spider Options

### `canonise`
- **Type:** `(url: URL) => string`

Get the canonical URL for a page. Defaults to `${url.pathname}${url.search}`

### `priority`
- **Type:** `(url: URL) => number`

Get the crawling priority for a page. Defaults to 0

### `linkSelector`
- **Type:** `string`
- **Default:** `'a'`

Selector for links on the page

### `parallel`
- **Type:** `number`
- **Default:** `4`

Max number of concurrent fetches

### `delay`
- **Type:** `number`
- **Default:** `666`

Min delay between fetches (milliseconds)