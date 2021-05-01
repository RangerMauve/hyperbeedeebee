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
