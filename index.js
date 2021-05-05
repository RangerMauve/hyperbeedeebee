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

  async findOne (query = {}) {
    const results = await (this.find(query).limit(1))

    const [doc] = results

    return doc
  }

  find (query = {}) {
    return new Cursor(query, this.bee)
  }
}

class Cursor {
  constructor (query = {}, bee, opts = {
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
    const cursor = new Cursor(this.query, this.bee, { ...this.opts })
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
        limit
      } = this.opts
      let { skip = 0 } = this.opts

      const checkKeys = Object.keys(this.query)

      for await (const { value: rawDoc } of stream) {
        // TODO: Can we avoid iterating over keys that should be skipped?
        if (skip > 0) {
          skip--
        } else {
          count++
          const doc = BSON.deserialize(rawDoc)

          if (checkKeys.every((key) => {
            const queryValue = this.query[key]
            const docValue = doc[key]
            return queryCompare(docValue, queryValue)
          })) {
            yield doc
          }
        }
        if (count >= limit) break
      }
    }
  }
}

function queryCompare (docValue, queryValue) {
  if (typeof queryValue === 'object' && hasNumberCompare(queryValue)) {
    return numberCompare(docValue, queryValue)
  } else return isEqual(docValue, queryValue)
}

function hasNumberCompare (queryValue) {
  return ('$gt' in queryValue) || ('$gte' in queryValue) || ('$lt' in queryValue) || ('$lte' in queryValue)
}

function numberCompare (docValue, queryValue) {
  let matches = true
  // If it's a date, get it's millisecond value for comparison
  const compareValue = ensureComparable(docValue)
  if ('$gt' in queryValue) {
    if (!(compareValue > ensureComparable(queryValue.$gt))) matches = false
  }
  if ('$gte' in ensureComparable(queryValue)) {
    if (!(compareValue >= ensureComparable(queryValue.$gte))) matches = false
  }
  if ('$lt' in queryValue) {
    if (!(compareValue < ensureComparable(queryValue.$lt))) matches = false
  }
  if ('$lte' in queryValue) {
    if (!(compareValue <= queryValue.$lte)) matches = false
  }
  return matches
}

function ensureComparable (value) {
  if (value instanceof Date) return value.getTime()
  return value
}

function isEqual (docValue, queryValue) {
  if (Array.isArray(docValue)) {
    return docValue
      .some((item) => isEqual(item, queryValue))
  } else if (typeof docValue.equals === 'function') {
    return docValue.equals(queryValue)
  } else {
    return queryValue === docValue
  }
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
