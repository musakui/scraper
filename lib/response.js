/** @type {Map<string, TextDecoder>} */
const decoders = new Map()

/** @param {string} ctype */
export const getDecoder = (ctype) => {
	const cs = /charset=([^;]+)/.exec(ctype)
	if (!cs) return null

	const enc = cs[1].toLowerCase()
	if (enc === 'utf-8') return null
	if (!decoders.has(enc)) decoders.set(enc, new TextDecoder(enc))

	/** @param {ArrayBuffer} buf */
	return (buf) => decoders.get(enc).decode(buf)
}

/**
 * process Response from fetch
 * @param {Response} r
 * @return {Promise<Partial<import('./schema').WebPage> & { redirected?: boolean }>}
 */
export const processResponse = async (r, oriURL = '') => {
	const base = { url: r.url, status: r.status }

	if (!r.ok) return { ...base, body: r.statusText }

	const ct = r.headers.get('content-type')
	const redir = r.redirected ? { oriURL } : null

	if (!ct.startsWith('text/')) {
		return {
			...base,
			...redir,
			ctype: ct,
			body: await r.arrayBuffer(),
		}
	}

	const dc = getDecoder(ct)
	return {
		...base,
		...redir,
		ctype: ct.split(';')[0],
		body: dc ? dc(await r.arrayBuffer()) : await r.text(),
	}
}
