import { open } from './database.js'

let db = null

const dbp = open().then((d) => {
  db = d
  return d
})

export const getUrls = async () => {
  return await (await dbp).getAllKeysFromIndex('pages', 'updated')
}

export const getPages = async () => {
  return await (await dbp).getAllFromIndex('pages', 'updated')
}

export const transaction = () => db.transaction('pages')
