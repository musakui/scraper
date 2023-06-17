import { millis, runCrawl } from './crawl.js'

let res = null
let run = true
let origin = ''
let delay = 666

self.onmessage = (m) => {
	const d = JSON.parse(m.data)
	if (d.origin) {
		origin = d.origin
	}
	switch (d.action) {
		case 'start':
			res()
			break
		case 'stop':
			run = false
			break
		default:
			break
	}
}

await new Promise((resolve) => {
	res = resolve
})

let last = new Date()

for await (const c of runCrawl()) {
	if (!c) {
		if (!run) break
		await millis(10)
		continue
	}

	const wait = delay + last - new Date()
	if (wait > 0) {
		await millis(wait)
	}

	c.useFetch(fetch(new URL(c.url, origin)))

	if (!run) break

	last = new Date()
}
