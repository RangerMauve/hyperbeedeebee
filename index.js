const BSON = require('bson')
const { ObjectID } = BSON

// Version of the indexing algorithm
// Will be incremented for breaking changes
// In the future we'll want to support multiple versions?
const INDEX_VERSION = '1.0'

const QUERY_TYPES = {
  $gt: compareGt,
  $lt: compareLt,
  $gte: compareGte,
  $lte: compareLte,
  $in: compareIn,
  $all: compareAll,
  $eq: compareEq,
  $exists: compareExists
}

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
    this.docs = bee.sub('doc')
    this.idxs = bee.sub('idxs')
    this.idx = bee.sub('idx')
  }

  // TODO: Add insertMany with batch insert
  async insert (rawDoc) {
    let doc = rawDoc
    if (!doc) throw new TypeError('No Document Supplied')
    if (!doc._id) {
      doc = {
        ...doc,
        _id: new ObjectID()
      }
    }

    // Get _id as buffer
    const key = doc._id.id
    const value = BSON.serialize(doc)

    await this.docs.put(key, value)

    const indexes = await this.listIndexes()

    for (const { fields, name } of indexes) {
      // TODO: Cache index subs
      const bee = this.idx.sub(name)

      await this._indexDocument(bee, fields, doc)
    }

    return doc
  }

  async findOne (query = {}) {
    const results = await (this.find(query).limit(1))

    const [doc] = results

    return doc
  }

  find (query = {}) {
    return new Cursor(query, this)
  }

  async createIndex (fields, { rebuild = false, ...opts } = {}) {
    const name = fields.join(',')
    const exists = await this.indexExists(name)
    // Don't rebuild index if it's already set
    if (exists && !rebuild) {
      return
    }

    const index = {
      version: INDEX_VERSION,
      name,
      fields,
      opts
    }

    await this.idxs.put(name, BSON.serialize(index))

    await this.reIndex(name)

    return name
  }

  async indexExists (name) {
    const exists = await this.idxs.get(name)
    return exists !== null
  }

  async getIndex (name) {
    const data = await this.idxs.get(name)
    if (!data) throw new Error('Invalid index')
    return BSON.deserialize(data.value)
  }

  async reIndex (name) {
    const { fields } = await this.getIndex(name)
    // TODO: Cache index subs
    const bee = this.idx.sub(name)

    for await (const doc of this.find()) {
      await this._indexDocument(bee, fields, doc)
    }
  }

  // This is a private API, don't depend on it
  async _indexDocument (bee, fields, doc) {
    if (!hasFields(doc, fields)) return
    const idxValue = doc._id.id
    // TODO: Batch insert the index keys
    for (const flattened of flattenDocument(doc)) {
      const idxKey = makeIndexKey(flattened, fields)
      await bee.put(idxKey, idxValue)
    }
  }

  // TODO: Cache indexes?
  async listIndexes () {
    const stream = this.idxs.createReadStream()
    const indexes = []

    for await (const { value } of stream) {
      const index = BSON.deserialize(value)
      indexes.push(index)
    }

    return indexes
  }
}

class Cursor {
  constructor (query = {}, collection, opts = {
    limit: Infinity,
    skip: 0,
    sort: null,
    hint: null
  }) {
    this.query = query
    this.collection = collection
    // TODO: Validate opts
    this.opts = opts
  }

  async count () {
    let count = 0
    // Item isn't being used but eslint will complain about it
    for await (const item of this) { // eslint-disable-line
      count++
    }

    return count
  }

  hint (hint) {
    return new Cursor(this.query, this.collection, { ...this.opts, hint })
  }

  limit (limit) {
    return new Cursor(this.query, this.collection, { ...this.opts, limit })
  }

  skip (skip) {
    return new Cursor(this.query, this.collection, { ...this.opts, skip })
  }

  sort (field, direction = 1) {
    return new Cursor(this.query, this.collection, {
      ...this.opts,
      sort: {
        field,
        direction
      }
    })
  }

  async getIndex () {
    const { sort, hint } = this.opts
    const query = this.query

    const queryFields = Object.keys(query)
    // Filter out fields with `$exists: false` since we can't index non-existance
    const existingFields = queryFields.filter((field) => {
      return isQueryObject(query[field]) ? query[field].$exists !== false : true
    })
    const eqS = existingFields.filter((name) => {
      const queryValue = query[name]
      if (!isQueryObject(queryValue)) return true
      return ('$eq' in queryValue)
    })

    if (hint) {
      const hintIndex = await this.collection.getIndex(hint)
      const { fields } = hintIndex
      if (sort) {
        const sortIndex = fields.indexOf(sort.field)
        if (sortIndex === -1) throw new Error("Hinted Index doesn't match required sort")
        const consecutive = consecutiveSubset(fields, eqS)
        if (consecutive !== sortIndex) throw new Error("Hinted index doesn't match required sort")
      }

      const prefixFields = fields.slice(0, consecutiveSubset(fields, eqS))

      return {
        index: hintIndex,
        prefixFields,
        eqS
      }
    }

    const allIndexes = await this.collection.listIndexes()
    const matchingIndexes = allIndexes
      .filter(({ fields }) => {
        if (sort) {
          // At the very least we _need_ to have the sort field
          const sortIndex = fields.indexOf(sort.field)
          if (sortIndex === -1) return false
          // All the fields before the sort should be $eq fields
          const consecutive = consecutiveSubset(fields, eqS)
          return consecutive === sortIndex
        } else {
          // Ensure the fields have _some_ of the query fields
          return fields.some((field) => existingFields.includes(field))
        }
      })
      // Sort by most $eq fields at the beginning
      .sort(({ fields: fieldsA }, { fields: fieldsB }) => {
        return consecutiveSubset(fieldsB, eqS) - consecutiveSubset(fieldsA, eqS)
      })

    // The best is the one with the most eqS
    const index = matchingIndexes[0]

    if (!index) {
      return null
    }

    const { fields } = index
    // TODO: Use $gt/$lt fields in the prefix if after $eqs (and doesn't conflict with sort)
    const prefixFields = fields.slice(0, consecutiveSubset(fields, eqS))

    return {
      index,
      eqS,
      prefixFields
    }
  }

  async then (resolve, reject) {
    try {
      const results = []
      for await (const item of this) {
        results.push(item)
      }
      return Promise.resolve(resolve(results))
    } catch (e) {
      reject(e)
    }
  }

  async * [Symbol.asyncIterator] () {
    if (this.query._id && (this.query._id instanceof ObjectID)) {
      // Doc IDs are unique, so we can query against them without doing a search
      const key = this.query._id.id

      const found = await this.collection.docs.get(key)

      if (!found) throw new Error('not found')

      const { value: rawDoc } = found
      if (!rawDoc) {
        throw new Error('not found')
      }
      const doc = BSON.deserialize(rawDoc)
      if (!matchesQuery(doc, this.query)) {
        throw new Error('not found')
      }
      yield doc
    } else {
      const {
        limit = Infinity,
        skip = 0,
        sort
      } = this.opts
      const query = this.query
      const seen = new Set()

      let count = 0
      let skipped = 0
      const toSkip = skip

      const bestIndex = await this.getIndex()

      function processDoc (doc) {
        let shouldYield = null
        let shouldBreak = false

        // If we've seen this document before, ignore it
        if (!seen.has(doc._id.toString())) {
          if (matchesQuery(doc, query)) {
            if (toSkip > skipped) {
              skipped++
            } else {
              seen.add(doc._id.toString())
              count++
              shouldYield = doc
              if (count >= limit) shouldBreak = true
            }
          }
        }

        return {
          shouldBreak,
          shouldYield
        }
      }

      // If there is an index we should use
      if (bestIndex) {
        const { index, prefixFields } = bestIndex
        // TODO: Support $all and $in more efficiently
        // $all can't be used with just the fields in the index
        // We need to fetch the entire document to test this field
        const subQueryFields = index.fields.filter((field) => {
          return isQueryObject(query[field]) ? !('$all' in query[field]) : true
        })
        const subQuery = getSubset(query, subQueryFields)
        const gt = makeIndexKeyFromQuery(query, prefixFields)

        const opts = {
          reverse: (sort?.direction === -1)
        }
        if (gt && gt.length) {
          opts.gt = gt
          // Add a `less than` range to constrain the search
          const lt = Buffer.alloc(gt.length)
          opts.lt = lt
          gt.copy(lt)

          // Set to MAX byte to only use keys with this prefix
          lt[lt.length - 1] = 0xFF
        }

        const stream = this.collection.idx.sub(index.name).createReadStream(opts)

        for await (const { key, value: rawId } of stream) {
          const keyDoc = makeDocFromIndex(key, index.fields)

          // Test the fields agains the index to avoid fetching the doc
          if (!matchesQuery(keyDoc, subQuery)) continue

          const { value: rawDoc } = await this.collection.docs.get(rawId)
          const doc = BSON.deserialize(rawDoc)

          // TODO: Avoid needing to double-process the values
          // TODO: Support "projection" when the fields are all in the index
          const { shouldYield, shouldBreak } = processDoc(doc)
          if (shouldYield) yield shouldYield
          if (shouldBreak) break
        }
      } else if (sort === null) {
        // If we aren't sorting, and don't have an index, iterate over all docs
        const stream = this.collection.docs.createReadStream()

        for await (const { value: rawDoc } of stream) {
          // TODO: Can we avoid iterating over keys that should be skipped?
          const doc = BSON.deserialize(rawDoc)

          const { shouldYield, shouldBreak } = processDoc(doc)
          if (shouldYield) yield shouldYield
          if (shouldBreak) break
        }
      } else {
        throw new Error(`No indexes found to sort for field "${sort.field}"`)
      }
    }
  }
}

function matchesQuery (doc, query) {
  for (const key in query) {
    const queryValue = query[key]
    const docValue = doc[key]
    if (!queryCompare(docValue, queryValue)) return false
  }
  return true
}

function queryCompare (docValue, queryValue) {
  if (isQueryObject(queryValue)) {
    for (const queryType of Object.keys(queryValue)) {
      const compare = QUERY_TYPES[queryType]
      // TODO: Validate somewhere else?
      if (!compare) throw new Error('Invalid Query Type ' + queryType)
      if (!compare(docValue, queryValue[queryType])) return false
    }
    return true
  } else return compareEq(docValue, queryValue)
}

function compareAll (docValue, queryValue) {
  // TODO: Add query validator function to detect this early.
  if (!Array.isArray(queryValue)) throw new Error('$all must be set to an array')
  if (Array.isArray(docValue)) {
    return queryValue.every((fromQuery) => docValue.some((fromDoc) => compareEq(fromDoc, fromQuery)))
  } else {
    return false
  }
}

function compareIn (docValue, queryValue) {
  // TODO: Add query validator function to detect this early.
  if (!Array.isArray(queryValue)) throw new Error('$in must be set to an array')
  if (Array.isArray(docValue)) {
    return docValue.some((fromDoc) => queryValue.some((fromQuery) => compareEq(fromDoc, fromQuery)))
  } else {
    return queryValue.some((fromQuery) => compareEq(docValue, fromQuery))
  }
}

function compareGt (docValue, queryValue) {
  return ensureComparable(docValue) > ensureComparable(queryValue)
}

function compareLt (docValue, queryValue) {
  return ensureComparable(docValue) < ensureComparable(queryValue)
}

function compareGte (docValue, queryValue) {
  return ensureComparable(docValue) >= ensureComparable(queryValue)
}

function compareLte (docValue, queryValue) {
  return ensureComparable(docValue) <= ensureComparable(queryValue)
}

function ensureComparable (value) {
  if (value instanceof Date) return value.getTime()
  return value
}

function compareEq (docValue, queryValue) {
  if (Array.isArray(docValue)) {
    return docValue
      .some((item) => compareEq(item, queryValue))
  } else if (typeof docValue.equals === 'function') {
    return docValue.equals(queryValue)
  } else {
    return queryValue === docValue
  }
}

function compareExists (docValue, queryValue) {
  return (docValue !== undefined) === queryValue
}

function hasFields (doc, fields) {
  return fields.every((field) => (field in doc) && (field !== undefined))
}

function makeIndexKey (doc, fields) {
  // TODO: Does BSON array work well for ordering?
  // TODO: Maybe use a custom encoding?
  // Serialize the data into a BSON array
  const buffer = BSON.serialize(
    // Take all the indexed fields
    fields.map((field) => doc[field])
      // Add the document ID
      .concat(doc._id || [])
  )

  // Get rid of the length prefix, we don't need it.
  const noPrefix = buffer.slice(4)

  return noPrefix
}

function makeDocFromIndex (key, fields) {
  const buffer = Buffer.alloc(key.length + 4)
  key.copy(buffer, 4)
  // Write a valid length prefix to the buffer for BSON decoding
  buffer.writeInt32LE(buffer.length)

  // Should be a JSON object with numbered key (a BSON array)
  const parsed = BSON.deserialize(buffer)
  const doc = {}

  for (const index of Object.keys(parsed)) {
    const field = fields[index] || '_id'
    doc[field] = parsed[index]
  }

  return doc
}

function getSubset (doc, fields) {
  return fields.reduce((res, field) => {
    if (field in doc) {
      res[field] = doc[field]
    }
    return res
  }, {})
}

function * flattenDocument (doc) {
  let hadArray = false
  for (const key of Object.keys(doc)) {
    if (Array.isArray(doc[key])) {
      hadArray = true
      const copy = { ...doc }
      const values = doc[key]
      delete copy[key]
      for (const value of values) {
        for (const flattened of flattenDocument(copy)) {
          yield { ...flattened, [key]: value }
        }
      }
    }
  }

  if (!hadArray) yield doc
}

function makeIndexKeyFromQuery (query, fields) {
  // TODO: Account for $eq and $gt fields
  const doc = fields.reduce((res, field) => {
    const value = query[field]

    if (isQueryObject(value) && ('$eq' in value)) {
      res[field] = value.$eq
    } else {
      res[field] = value
    }

    return res
  }, {})

  return makeIndexKey(doc, fields)
}

function isQueryObject (object) {
  return (typeof object === 'object') && has$Keys(object)
}

function has$Keys (object) {
  return Object.keys(object).some((key) => key.startsWith('$'))
}

function consecutiveSubset (origin, values) {
  let counter = 0
  for (const item of origin) {
    if (!values.includes(item)) return counter
    counter++
  }
  return counter
}

module.exports = {
  DB,
  Collection,
  Cursor,
  BSON
}
