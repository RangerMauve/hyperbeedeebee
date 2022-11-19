const test = require('tape')
const RAM = require('random-access-memory')
const Hypercore = require('hypercore')
const Autobase = require('autobase')
const HyperbeeDeeBee = require('./')
const Autodeebee = require('./autodeebee')
const { DB } = HyperbeeDeeBee

function getBee () {
  const firstUser = new Hypercore(RAM)
  const firstOutput = new Hypercore(RAM)
  const inputs = [firstUser]

  const base1 = new Autobase({
    inputs,
    localOutput: firstOutput,
    localInput: firstUser
  })
  return new Autodeebee(base1)
}
// eslint-disable-next-line no-unused-vars
function getBees () {
  const firstUser = new Hypercore(RAM)
  const firstOutput = new Hypercore(RAM)
  const secondUser = new Hypercore(RAM)
  const secondOutput = new Hypercore(RAM)

  const inputs = [firstUser, secondUser]

  const base1 = new Autobase({
    inputs,
    localOutput: firstOutput,
    localInput: firstUser
  })
  const base2 = new Autobase({
    inputs,
    localOutput: secondOutput,
    localInput: secondUser
  })

  return [new Autodeebee(base1), new Autodeebee(base2)]
}

test('Create a document in a collection', async (t) => {
  const db = new DB(getBee())
  try {
    const collection = db.collection('example')

    t.equal(collection.name, 'example', 'Collection created')

    const doc = await collection.insert({ example: 'Hello World!' })

    t.ok(doc?._id, 'Doc got created along with _id')

    const otherDoc = await collection.findOne({ _id: doc._id })

    t.equal(otherDoc.example, doc.example, 'DB property got loaded')

    t.end()
  } finally {
    await db.close()
  }
})

test('Create documents with sparse props', async (t) => {
  const db = new DB(getBee())
  try {
    const collection = db.collection('example')

    await collection.insert({ example: 'World' })
    await collection.insert({ example: 'Hello', color: 'red' })

    const doc = await collection.findOne({ color: 'red' })

    t.equal(doc.color, 'red')

    t.end()
  } finally {
    await db.close()
  }
})

test('Iterate through all docs in a db', async (t) => {
  const db = new DB(getBee())

  try {
    const doc1 = await db.collection('example').insert({ example: 'Hello' })
    const doc2 = await db.collection('example').insert({ example: 'World' })

    const docs = await db.collection('example').find()

    t.equal(docs.length, 2, 'Found both docs')

    let isFirst = true
    for await (const doc of db.collection('example').find()) {
      if (isFirst) {
        t.ok(doc._id.equals(doc1._id), 'Got same id when iterating (1)')
        isFirst = false
      } else {
        t.ok(doc._id.equals(doc2._id), 'Got same id when iterating (2)')
      }
    }

    t.end()
  } finally {
    await db.close()
  }
})
test('Iterate through different collections', async (t) => {
  const db = new DB(getBee())

  try {
    await db.collection('example').insert({ example: 'Hello' })
    await db.collection('example').insert({ example: 'World' })

    const doc1 = await db.collection('patras').insert({ example: 'Hello' })
    const doc2 = await db.collection('patras').insert({ example: 'World' })

    const docs = await db.collection('patras').find()

    t.equal(docs.length, 2, 'Found both docs')

    let isFirst = true
    for await (const doc of db.collection('patras').find()) {
      if (isFirst) {
        t.ok(doc._id.equals(doc1._id), 'Got same id when iterating (1)')
        isFirst = false
      } else {
        t.ok(doc._id.equals(doc2._id), 'Got same id when iterating (2)')
      }
    }

    t.end()
  } finally {
    await db.close()
  }
})

test('Iterate through different collections of different base', async (t) => {
  const [base1, base2] = getBees()
  const db = new DB(base1)
  const db2 = new DB(base2)

  try {
    const doc1 = await db.collection('patras').insert({ example: 'Hello' })
    const doc2 = await db.collection('patras').insert({ example: 'World' })

    const docs = await db2.collection('patras').find()

    t.equal(docs.length, 2, 'Found both docs')

    let isFirst = true
    for await (const doc of db2.collection('patras').find()) {
      if (isFirst) {
        t.ok(doc._id.equals(doc1._id), 'Got same id when iterating (1)')
        isFirst = false
      } else {
        t.ok(doc._id.equals(doc2._id), 'Got same id when iterating (2)')
      }
    }

    t.end()
  } finally {
    await db.close()
  }
})
test('Limit and Skip', async (t) => {
  const db = new DB(getBee())
  const NUM_TO_MAKE = 30
  let i = NUM_TO_MAKE
  try {
    while (i--) {
      await db.collection('example').insert({ i })
    }

    const found = await db.collection('example').find().skip(10).limit(10)

    t.equal(found.length, 10, 'Got expected number of items')

    const onlyIs = found.map(({ i }) => i)

    const expected = [19, 18, 17, 16, 15, 14, 13, 12, 11, 10]

    t.deepEqual(onlyIs, expected, 'Got expected subset of Ids')

    t.end()
  } finally {
    await db.close()
  }
})

test('Search by field equal', async (t) => {
  const db = new DB(getBee())

  try {
    const doc1 = await db.collection('example').insert({ example: 'Hello' })
    const doc2 = await db
      .collection('example')
      .insert({ example: ['Hello', 'World'] })
    await db.collection('example').insert({ example: 'World' })

    const found = await db.collection('example').find({ example: 'Hello' })

    t.equal(found.length, 2, 'Found 2 documents')
    t.ok(doc1._id.equals(found[0]._id), 'Got matched field document')
    t.ok(doc2._id.equals(found[1]._id), 'Got matched array field document')

    t.end()
  } finally {
    await db.close()
  }
})

test('Search by number fields', async (t) => {
  const db = new DB(getBee())

  try {
    await db.collection('example').insert({ example: 4 })
    await db.collection('example').insert({ example: 20 })
    await db.collection('example').insert({ example: 666 })
    await db.collection('example').insert({ example: 9001 })

    const found1 = await db.collection('example').find({
      example: {
        $gte: 10,
        $lte: 20
      }
    })

    t.equal(found1.length, 1, 'Found 1 document >= 10 and <= 20')

    const found2 = await db.collection('example').find({
      example: {
        $gt: 9000
      }
    })

    t.equal(found2.length, 1, 'Found 1 document > 9000')

    const found3 = await db.collection('example').find({
      example: {
        $lt: 10
      }
    })

    t.equal(found3.length, 1, 'Found 1 document < 10')

    const found4 = await db.collection('example').find({
      example: {
        $ne: 666
      }
    })

    t.equal(found4.length, 3, 'Found 3 document =! 666')

    t.end()
  } finally {
    await db.close()
  }
})

test('Search by date fields', async (t) => {
  const db = new DB(getBee())

  try {
    await db.collection('example').insert({ example: new Date(2000, 0) })
    await db.collection('example').insert({ example: new Date(2000, 2) })
    await db.collection('example').insert({ example: new Date(2000, 6) })
    await db.collection('example').insert({ example: new Date(2000, 11) })

    const found1 = await db.collection('example').find({
      example: {
        $gte: new Date(2000, 1),
        $lte: new Date(2000, 6)
      }
    })

    t.equal(found1.length, 2, 'Found 2 document >= Feb and <= July')

    t.end()
  } finally {
    await db.close()
  }
})

test('Search using $in and $all', async (t) => {
  const db = new DB(getBee())

  try {
    await db.collection('example').insert({ example: [1, 3, 5, 7, 9] })
    await db.collection('example').insert({ example: [2, 3, 6, 8, 10] })
    await db.collection('example').insert({ example: 1 })
    await db.collection('example').insert({ example: 2 })

    const found1 = await db.collection('example').find({
      example: {
        $in: [1, 3, 8]
      }
    })

    t.equal(found1.length, 3, 'Found 3 matching documents')

    const found2 = await db.collection('example').find({
      example: {
        $all: [2, 6, 8]
      }
    })

    t.equal(found2.length, 1, 'Found 1 matching document')

    t.end()
  } finally {
    await db.close()
  }
})

test('Search using $exists', async (t) => {
  const db = new DB(getBee())

  try {
    await db.collection('example').insert({ example: 'wow' })
    await db.collection('example').insert({ nothing: 'here' })

    const results1 = await db.collection('example').find({
      example: { $exists: true }
    })

    t.equal(results1.length, 1, 'Found document with field')

    const results2 = await db.collection('example').find({
      example: { $exists: false }
    })

    t.equal(results2.length, 1, 'Found document without field')

    t.end()
  } finally {
    await db.close()
  }
})

test('Create indexes and list them', async (t) => {
  const db = new DB(getBee())
  try {
    await db
      .collection('example')
      .insert({ example: 1, createdAt: new Date() })

    await db.collection('example').createIndex(['createdAt', 'example'])

    const indexes = await db.collection('example').listIndexes()

    t.equal(indexes.length, 1, 'Got one index')
    t.deepEqual(
      indexes[0].fields,
      ['createdAt', 'example'],
      'Index containes expected fields'
    )
    t.equal(
      indexes[0].name,
      ['createdAt', 'example'].join(','),
      'Index generated expected name'
    )

    await db
      .collection('example')
      .insert({ example: 2, createdAt: new Date() })

    t.ok('Able to insert document with index')

    t.end()
  } finally {
    await db.close()
  }
})

test('Sort by index', async (t) => {
  const db = new DB(getBee())
  try {
    await db.collection('example').createIndex(['createdAt'])

    await db
      .collection('example')
      .insert({ example: 1, createdAt: new Date(1000) })
    await db
      .collection('example')
      .insert({ example: 2, createdAt: new Date(2000) })
    await db
      .collection('example')
      .insert({ example: 3, createdAt: new Date(3000) })

    let counter = 3
    for await (const { example, createdAt } of db
      .collection('example')
      .find()
      .sort('createdAt', -1)) {
      t.equal(example, counter, 'Got doc in expected order')
      t.equal(createdAt.getTime(), counter * 1000, 'Got expected timestamp')
      counter--
    }

    t.equal(counter, 0, 'Sorted through all 3 documents')

    t.end()
  } finally {
    await db.close()
  }
})

test('Cannot sort without index', async (t) => {
  const db = new DB(getBee())
  try {
    try {
      await db.collection('example').find().sort('notfound')
    } catch {
      t.pass('Threw error when sorting without index')
    }

    t.end()
  } finally {
    await db.close()
  }
})

test('Limit and skip with index sort', async (t) => {
  const db = new DB(getBee())
  const NUM_TO_MAKE = 30
  let i = NUM_TO_MAKE
  try {
    await db.collection('example').createIndex(['i'])

    while (i--) {
      await db.collection('example').insert({ i })
    }

    const query = db
      .collection('example')
      .find()
      .skip(10)
      .limit(10)
      .sort('i', -1)

    const index = await query.getIndex()

    t.ok(index, 'Using index for search')

    const found = await query

    t.equal(found.length, 10, 'Got expected number of items')

    const onlyIs = found.map(({ i }) => i)

    const expected = [19, 18, 17, 16, 15, 14, 13, 12, 11, 10]

    t.deepEqual(onlyIs, expected, 'Got expected subset of Ids')

    t.end()
  } finally {
    await db.close()
  }
})

test('Use $eq for indexes', async (t) => {
  const db = new DB(getBee())
  try {
    const indexFields = ['color', 'flavor']
    await db.collection('example').createIndex(indexFields)

    await db
      .collection('example')
      .insert({ example: 1, color: 'red', flavor: 'watermelon' })
    await db
      .collection('example')
      .insert({ example: 2, color: 'red', flavor: 'raspberry' })
    await db
      .collection('example')
      .insert({ example: 3, color: 'purple', flavor: 'good' })

    const query = db.collection('example').find({
      color: 'red'
    })

    const index = await query.getIndex()

    t.ok(index, 'Using an index for the query')
    t.deepEqual(index?.index?.fields, indexFields, 'Using the correct index')

    const results = await query

    t.equal(results.length, 2, 'Got expected documents')

    const sortedQuery = query.sort('flavor', -1)

    const sortedIndex = await sortedQuery.getIndex()

    t.ok(sortedIndex, 'Using an index for the sorted query')

    const sorted = await sortedQuery

    t.equal(sorted.length, 2, 'Got expected documents when sorting')
    t.equal(sorted[0]?.flavor, 'watermelon', 'Got expected order for sort')

    t.end()
  } finally {
    await db.close()
  }
})

test('Arrays get flattened for indexes', async (t) => {
  const db = new DB(getBee())

  try {
    await db.collection('example').createIndex(['ingredients', 'name'])

    await db.collection('example').insert({
      name: 'le ghetti du spa',
      ingredients: ['noodles', 'corn', 'sauce']
    })
    await db.collection('example').insert({
      name: 'cheeseland',
      ingredients: ['corn', 'cheese', 'sauce']
    })
    await db.collection('example').insert({
      name: 'literally corn',
      ingredients: ['corn']
    })

    const query = db
      .collection('example')
      .find({
        ingredients: 'sauce'
      })
      .sort('name')

    const index = await query.getIndex()

    t.ok(index, 'Using an index for the query')
    t.deepEqual(
      index?.index?.fields,
      ['ingredients', 'name'],
      'Using the correct index'
    )

    const results = await query

    t.equal(results.length, 2, 'Found two matching documents')
    t.equal(results[0]?.name, 'cheeseland', 'Documents got sorted correctly')

    t.end()
  } finally {
    await db.close()
  }
})

test('Indexed Search using $exists', async (t) => {
  const db = new DB(getBee())

  try {
    await db.collection('example').createIndex(['example'])

    await db.collection('example').insert({ example: 'wow' })
    await db.collection('example').insert({ nothing: 'here' })

    const hasIndex = await db
      .collection('example')
      .find({
        example: { $exists: true }
      })
      .getIndex()

    t.ok(hasIndex, 'Using index for search')

    const results1 = await db.collection('example').find({
      example: { $exists: true }
    })

    t.equal(results1.length, 1, 'Found document with field')

    const results2 = await db.collection('example').find({
      example: { $exists: false }
    })

    t.equal(results2.length, 1, 'Found document without field')

    t.end()
  } finally {
    await db.close()
  }
})

test('Indexed Search by date fields (with sort)', async (t) => {
  const db = new DB(getBee())

  try {
    await db.collection('example').createIndex(['example'])
    await db.collection('example').insert({ example: new Date(2000, 0) })
    await db.collection('example').insert({ example: new Date(2000, 2) })
    await db.collection('example').insert({ example: new Date(2000, 6) })
    await db.collection('example').insert({ example: new Date(2000, 11) })

    const query = db
      .collection('example')
      .find({
        example: {
          $gte: new Date(2000, 1),
          $lte: new Date(2000, 6)
        }
      })
      .sort('example')

    const index = await query.getIndex()

    t.ok(index, 'Using index for date search')

    const found1 = await query

    t.equal(found1.length, 2, 'Found 2 documents >= Feb and <= July')

    t.end()
  } finally {
    await db.close()
  }
})

test('Indexed Search using $in and $all with numbers', async (t) => {
  const db = new DB(getBee())

  try {
    await db.collection('example').createIndex(['example'])

    // Account for array fields that aren't in the index.
    await db
      .collection('example')
      .insert({ example: [1, 3, 5, 7, 9], fake: [] })
    await db
      .collection('example')
      .insert({ example: [2, 3, 6, 8, 10], fake: [] })
    await db.collection('example').insert({ example: 1, fake: [] })
    await db.collection('example').insert({ example: 2, fake: [] })

    const query1 = db.collection('example').find({
      example: {
        $in: [1, 3, 8]
      }
    })

    const index1 = await query1.getIndex()

    t.ok(index1, 'Using index for $in search')

    const found1 = await query1

    t.equal(found1.length, 3, 'Found 3 matching documents')

    const query2 = db.collection('example').find({
      example: {
        $all: [2, 6, 8]
      }
    })

    const index2 = await query2.getIndex()

    t.ok(index2, 'Using index for $all search')

    const found2 = await query2

    t.equal(found2.length, 1, 'Found 1 matching document')

    t.end()
  } finally {
    await db.close()
  }
})

test('Indexed Search using $in and $all with string', async (t) => {
  const db = new DB(getBee())

  try {
    await db.collection('example').createIndex(['example'])

    await db
      .collection('example')
      .insert({ example: ['cats', 'frogs', 'pets', 'spiders', 'furry'] })
    await db
      .collection('example')
      .insert({ example: ['dogs', 'frogs', 'companions', 'bats'] })
    await db.collection('example').insert({ example: 'cats' })
    await db.collection('example').insert({ example: 'dogs' })

    const query1 = db.collection('example').find({
      example: {
        $in: ['cats', 'frogs', 'bats']
      }
    })

    const index1 = await query1.getIndex()

    t.ok(index1, 'Using index for $in search')

    const found1 = await query1

    t.equal(found1.length, 3, 'Found 3 matching documents')

    const query2 = db.collection('example').find({
      example: {
        $all: ['dogs', 'companions', 'bats']
      }
    })

    const index2 = await query2.getIndex()

    t.ok(index2, 'Using index for $all search')

    const found2 = await query2

    t.equal(found2.length, 1, 'Found 1 matching document')

    t.end()
  } finally {
    await db.close()
  }
})

test('Indexed text search using sort and $all', async (t) => {
  const db = new DB(getBee())

  try {
    await db.collection('example').createIndex(['index', 'example'])

    await db
      .collection('example')
      .insert({ index: 1, example: ['hello', 'world'] })
    await db
      .collection('example')
      .insert({ index: 2, example: ['goodbye', 'world'] })

    const results1 = await db.collection('example').find({
      example: {
        $all: ['world']
      }
    })

    t.equal(results1.length, 2, 'Matched two documents for $all')
    t.end()
  } finally {
    await db.close()
  }
})

test('Use hint API to specify the index to use', async (t) => {
  const db = new DB(getBee())

  try {
    await db.collection('example').createIndex(['example'])
    await db.collection('example').createIndex(['createdAt'])

    await db
      .collection('example')
      .insert({ example: 'wow', createdAt: new Date() })
    await db
      .collection('example')
      .insert({ example: 'here', createdAt: new Date() })

    const chosen1 = await db
      .collection('example')
      .find({})
      .hint('example')
      .getIndex()

    t.equal(chosen1?.index?.name, 'example', 'Hinted index got used')

    const chosen2 = await db
      .collection('example')
      .find({})
      .sort('createdAt')
      .hint('createdAt')
      .getIndex()

    t.equal(chosen2?.index?.name, 'createdAt', 'Hinted index got used')

    t.end()
  } finally {
    await db.close()
  }
})

test('Inserting over a document is an error', async (t) => {
  const db = new DB(getBee())

  try {
    const doc = await db.collection('example').insert({ _hello: 'world' })

    try {
      await db.collection('example').insert(doc)
      t.fail('Did not throw an error')
    } catch (e) {
      t.pass('Inserting threw an error')
    }
  } finally {
    await db.close()
  }
})

test('.delete a document', async (t) => {
  const db = new DB(getBee())

  try {
    const collection = db.collection('example')

    const doc = await collection.insert({
      foo: 'bar',
      goodbye: 'world',
      something: 'something'
    })

    const {
      nDeleted
    } = await collection.delete({ foo: 'bar' })

    t.equal(nDeleted, 1, 'One match')

    try {
      await collection.findOne({ _id: doc._id })
      t.fail('Did not throw an error')
    } catch (e) {
      t.pass('Retrieving deleted doc threw an error')
    }
  } finally {
    await db.close()
  }
})

test('Upsert a document', async (t) => {
  const db = new DB(getBee())

  try {
    const { nUpserted, nModified, nMatched } = await db
      .collection('example')
      .update(
        {},
        {
          hello: 'world'
        },
        { upsert: true }
      )

    t.equal(nUpserted, 1, 'Upserted a doc')
    t.equal(nMatched, 0, 'No existing docs matched')
    t.equal(nModified, 0, 'No existing docs modified')

    const doc = await db.collection('example').findOne({ hello: 'world' })

    t.ok(doc, 'Found doc')
    t.equal(doc?.hello, 'world', 'Field got set')
  } finally {
    await db.close()
  }
})

test('.update with $set, $unset, $rename', async (t) => {
  const db = new DB(getBee())

  try {
    const collection = db.collection('example')

    const doc = await collection.insert({
      foo: 'bar',
      goodbye: 'world',
      something: 'something'
    })

    const { nUpserted, nModified, nMatched } = await collection.update(
      {},
      {
        $set: {
          foo: 'bazz',
          fizz: 'buzz'
        },
        // Set with raw fields
        hello: 'world',
        $unset: {
          goodbye: ''
        },
        $rename: {
          something: 'whatever'
        }
      }
    )

    t.equal(nUpserted, 0, 'No upserts')
    t.equal(nMatched, 1, 'One match')
    t.equal(nModified, 1, 'One change')

    const updatedDoc = await collection.findOne({ _id: doc._id })

    t.ok(updatedDoc, 'Found after updating')

    t.equal(updatedDoc.foo, 'bazz', 'Existing field got updated')
    t.equal(updatedDoc.fizz, 'buzz', 'New field got set')
    t.equal(updatedDoc.hello, 'world', 'Raw field got set')
    t.notOk('goodbye' in updatedDoc, 'Field got unset')
    t.notOk('something' in updatedDoc, 'Renamed field got removed')
    t.equal(updatedDoc.whatever, 'something', 'Field got renamed')
  } finally {
    await db.close()
  }
})

test('.update with $inc, $mult', async (t) => {
  const db = new DB(getBee())

  try {
    const collection = db.collection('example')

    const doc = await collection.insert({
      incValue: 4,
      multValue: 4
    })

    const { nUpserted, nModified, nMatched } = await collection.update(
      {},
      {
        $inc: {
          incValue: 20,
          incSet: 666
        },
        $mul: {
          multValue: 20,
          multSet: 666
        }
      }
    )

    t.equal(nUpserted, 0, 'No upserts')
    t.equal(nMatched, 1, 'One match')
    t.equal(nModified, 1, 'One change')

    const updatedDoc = await collection.findOne({ _id: doc._id })

    t.ok(updatedDoc, 'Found after updating')
    t.equal(updatedDoc?.incValue, 4 + 20, 'Value got incremented')
    t.equal(updatedDoc?.incSet, 666, 'Unset field got set')

    t.equal(updatedDoc?.multValue, 4 * 20, 'Value got multiplied')
    t.equal(updatedDoc?.multSet, 0, 'Unset field got set to 0')
  } finally {
    await db.close()
  }
})

test('.update with $push, $addToSet', async (t) => {
  const db = new DB(getBee())

  try {
    const collection = db.collection('example')

    const doc = await collection.insert({
      existingSet: ['a', 'b'],
      duplicateSet: ['a', 'b'],
      eachSet: ['a', 'b'],
      existingPush: ['a', 'b'],
      duplicatePush: ['a', 'b'],
      eachPush: ['a', 'b']
    })

    const { nUpserted, nModified, nMatched } = await collection.update(
      {},
      {
        $addToSet: {
          existingSet: 'c',
          duplicateSet: 'a',
          eachSet: { $each: ['b', 'c'] }
        },
        $push: {
          existingPush: 'c',
          duplicatePush: 'a',
          eachPush: { $each: ['b', 'c'] }
        }
      }
    )

    t.equal(nUpserted, 0, 'No upserts')
    t.equal(nMatched, 1, 'One match')
    t.equal(nModified, 1, 'One change')

    const updatedDoc = await collection.findOne({ _id: doc._id })

    t.ok(updatedDoc, 'Found after updating')

    t.deepEqual(updatedDoc.existingSet, ['a', 'b', 'c'])
    t.deepEqual(updatedDoc.duplicateSet, ['a', 'b'])
    t.deepEqual(updatedDoc.eachSet, ['a', 'b', 'c'])

    t.deepEqual(updatedDoc.existingPush, ['a', 'b', 'c'])
    t.deepEqual(updatedDoc.duplicatePush, ['a', 'b', 'a'])
    t.deepEqual(updatedDoc.eachPush, ['a', 'b', 'b', 'c'])
  } finally {
    await db.close()
  }
})

test('.update multiple documents', async (t) => {
  const db = new DB(getBee())

  t.plan(4 + 3)

  try {
    const collection = db.collection('example')

    await collection.insert({ value: 0 })
    await collection.insert({ value: 0 })
    await collection.insert({ value: 0 })
    await collection.insert({ value: 0 })

    const { nUpserted, nModified, nMatched } = await collection.update(
      {},
      {
        $inc: {
          value: 1
        }
      },
      { multi: true }
    )

    t.equal(nUpserted, 0, 'No upserts')
    t.equal(nMatched, 4, '4 matches')
    t.equal(nModified, 4, '4 changes')

    for await (const doc of collection.find()) {
      t.equal(doc.value, 1, 'Doc got updated')
    }
  } finally {
    await db.close()
  }
})

test('.update with array of updates', async (t) => {
  const db = new DB(getBee())

  try {
    const collection = db.collection('example')

    await collection.insert({ value: 0 })

    const { nUpserted, nModified, nMatched } = await collection.update({}, [
      { $inc: { value: 1 } },
      { $rename: { value: 'something' } }
    ])

    t.equal(nUpserted, 0, 'No upserts')
    t.equal(nMatched, 1, 'One match')
    t.equal(nModified, 1, 'One change')

    const doc = await collection.findOne()

    t.equal(doc?.something, 1, 'field got incremented and renamed')
  } finally {
    await db.close()
  }
})

/* Test template

test('', async (t) => {
  const db = new DB(getBee())

  try {
    const collection = db.collection('example')

  } finally {
    await db.close()
  }
})
*/
