const test = require('tape')
const RAM = require('random-access-memory')
const Hypercore = require('hypercore')
const Hyperbee = require('hyperbee')
const HyperbeeDeeBee = require('./')
const { DB } = HyperbeeDeeBee

function getBee () {
  return new Hyperbee(new Hypercore(RAM))
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

test('Limit and Skip', async (t) => {
  const db = new DB(getBee())
  const NUM_TO_MAKE = 30
  let i = NUM_TO_MAKE
  try {
    while (i--) {
      await db.collection('example').insert({ i })
    }

    const found = await db
      .collection('example')
      .find()
      .skip(10)
      .limit(10)

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
    const doc2 = await db.collection('example').insert({ example: ['Hello', 'World'] })
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
