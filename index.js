const BSON = require('bson')
const { ObjectID } = BSON

const DOC_PREFIX = Buffer.from('doc', 'utf8')
const END = Buffer.from([0xff])

class DB {
  constructor (bee) {
    this.bee = bee
    this.collections = new Map()
  }

  collection (name) {
    if (!this.collections.has(name)) {
      const sub = this.bee.sub(name)
      const collection = new Collection(name, sub)
      this.collections.set(name, collection)
    }

    return this.collections.get(name)
  }

  async close () {
    // TODO: This looks kinda stange. PR a close method on bee?
    return this.bee.feed.close()
  }
}

class Collection {
  constructor (name, bee) {
    this.name = name
    this.bee = bee
  }

  async insert (rawDoc) {
    let doc = rawDoc
    if (!doc) throw new TypeError('No Document Supplied')
    if (!doc._id) {
      doc = {
        ...doc,
        _id: new ObjectID()
      }
    }
    const { sep } = this.bee

    const key = docIdToKey(doc._id, sep)
    const value = BSON.serialize(doc)

    await this.bee.put(key, value)

    return doc
  }

  async findOne (query={}) {
    const results = await (this.find(query).limit(1))

    const [doc] = results

    return doc
  }

  find (query={}) {
    return new Cursor(query, this.bee)
  }
}

class Cursor {
  constructor (query={}, bee, opts = {
    value: true,
    limit: Infinity,
    skip: 0,
    sort: null
  }) {
    this.query = query
    this.bee = bee
    // TODO: Validate opts
    this.opts = opts
  }

  async count () {
    let count = 0
    const cursor = new Cursor(this.query, this.bee, { ...this.opts, value: false })
    for await (const item of cursor) { // eslint-disable-line
      count++
    }

    return count
  }

  limit (limit) {
    return new Cursor(this.query, this.bee, { ...this.opts, limit })
  }

  skip (skip) {
    return new Cursor(this.query, this.bee, { ...this.opts, skip })
  }

  sort (sort) {
    return new Cursor(this.query, this.bee, { ...this.opts, sort })
  }

  async then (resolve, reject) {
    try {
      const results = []
      for await (const item of this) {
        results.push(item)
      }
      resolve(results)
    } catch (e) {
      reject(e)
    }
  }

  async * [Symbol.asyncIterator] () {
    const { sep } = this.bee

    if (this.query._id) {
    // Doc IDs are unique, so we can query against them
    // TODO: Check other criteria in the doc even if we find by ID
      const key = docIdToKey(this.query._id, sep)
      // TODO: Throw on not found?
      const { value: rawDoc } = await this.bee.get(key)
      if (!rawDoc) {
        yield null
        return
      }
      const doc = BSON.deserialize(rawDoc)
      yield doc
    } else {
      const start = Buffer.concat([
        DOC_PREFIX,
        sep
      ])
      const end = Buffer.concat([
        DOC_PREFIX,
        END
      ])

      // TODO: Account for order
      const stream = this.bee.createReadStream({
        gt: start,
        lt: end
      })

      let count = 0
      const {
        limit,
        value: shouldIncludeValue
      } = this.opts
      let { skip = 0 } = this.opts

      for await (const { key, value: rawDoc } of stream) {
        count++

        // TODO: Can we avoid iterating over keys that should be skipped?
        if (skip > 0) {
          skip--
        } else {
          if (!shouldIncludeValue) {
            const _id = docKeyToId(key, sep)
            yield { _id }
          } else {
      const doc = BSON.deserialize(rawDoc)
            yield doc
          }
        }
        if (count >= limit) break
      }
    }
  }
}

function docKeyToId (key, sep) {
  const prefix = Buffer.concat([
    DOC_PREFIX,
    sep
  ])

  const idBuffer = key.slice(prefix.length)

  return new ObjectID(idBuffer)
}

function docIdToKey (objectId, sep) {
  const idBuffer = objectId.id

  const key = Buffer.concat([
    DOC_PREFIX,
    sep,
    idBuffer
  ])
  return key
}

module.exports = {
  DB,
  Collection,
  Cursor,
  BSON
}
