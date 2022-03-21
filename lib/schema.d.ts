import { DBSchema } from 'idb'

export interface ScraperDB extends DBSchema {
  pages: {
    value: {
      url: string

      // queue
      q?: number
      referrer?: string

      // scraped
      date?: Date
      head?: string
      body?: string
      links?: string[]

      // invalid url
      ctype?: string
      redirect?: string
    }
    key: string
    indexes: {
      queue: number
      updated: Date
    }
  }
}
