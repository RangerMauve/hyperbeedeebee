# hyperbeedeebee

A MongoDB-like database built on top of Hyperbee with support for indexing

Based on [this design](https://gist.github.com/RangerMauve/ae271204054b62d9a649d70b7d218191)

## Usage

```
npm i --save hyperbeedeebee
```

```JavaScript
const Hyperbee = require('hyperbee')
// This module handles networking and storage of hypercores for you
const SDK = require('hyper-sdk')
const {DB} = require('hyperbeedeebee')

const {Hypercore} = await SDK()

// Initialize a hypercore for loading data
const core = new Hypercore('example')
// Initialize the Hyperbee you want to use for storing data and indexes
const bee = new Hyperbee(core)

// Create a new DB
const db = new DB(bee)

// Open up a collection of documents and insert a new document
const doc = await db.collection('example').insert({
  hello: 'World!'
})

// doc._id gets set to an ObjectId if you don't specify it
console.log(doc)

// Iterate through data as it's loaded (streaming)
// Usually faster and more memory / CPU efficient
for await (let doc of db.collection('example').find({
  clout: {
    $gt: 9000
  },
})) {
  console.log(doc)
}

// Create an index for properties in documents
// This drastically speeds up queries and is necessary for sorting by fields
await db.collection('example').createIndex('createdAt')

// Get all results in an array
// Can skip some results and limit total for pagination
const killbots = await db.collection('example')
  .find({type: 'killbot'})
  .sort('createdAt', -1)
  .skip(30)
  .limit(100)

// Get a single document that matches the query
const eggbert = await db.collection('example').findOne({name: 'Eggbert'})
```

### Usage with Autobase

```JavaScript
  const input = new Hypercore(RAM)
  const output = new Hypercore(RAM)
  const inputs = [input]

  const base = new Autobase({
    inputs,
    localOutput: firstOutput,
    localInput: firstUser
  })
  const autobee = new Autodeebee(base)

  // Create a new DB
  const db = new DB(autobee)
  // You can then use the DB the same way as you did above.
```

You also need to use the [Autodeebee class](./autodeebee.js):
This class redefines the functions of Hyperbee to be compatible with the DB.

## Data Types

HyperbeeDeeBee uses MongoDB's [BSON](https://github.com/mongodb/js-bson) data types for encoding data.
You can import the `bson` library bundled with HyperbeeDeeBee using the following code:

```JavaScript
const { BSON } = require('hyperbeedeebee')
```

From there you can access any of the following data types:

```JavaScript
Binary,
Code,
DBRef,
Decimal128,
Double,
Int32,
Long,
UUID,
Map,
MaxKey,
MinKey,
ObjectId,
BSONRegExp,
BSONSymbol,
Timestamp
```

## Important Differences From MongoDB

- There is a single writer for a hyperbee and multiple readers
- The indexing means that readers only need to download small subsets of the full dataset (if you index intelligently)
- No way to do "projections" so keep in mind you're always downloading the full document to disk
- Subset of `find()` API is implemented, no Map Reduce API, no `$or`/`$and` since it's difficult to optimize
- You can only sort by indexed fields, otherwise there's no difference from loading all the data and sorting in memory
- Fully open source under AGPL-3.0 and with mostly MIT dependencies.

## Indexing considerations:

Indexes are super important to make your applications snappy and to reduce the overall CPU/Bandwidth/Storage usage of queries.

- If you do a search by fields that aren't indexed, you'll end up downloading the full collection (this is potentially really slow)
- The order of fields in the index matters, they're used to create an ordered key based on the values
- If you want to sort by a field, make sure it's the first field in an index
- You can have indexed fields before the sorted field if they are only used for $eq operations, this is due to the database's ability to turn them into a prefix to speed up the search.
- If an index cannot be found to satisfy a `sort` the query will fail.
- If you're using `$gt/$lt/$gte/$lte` in your query, they will perform best if the same considerations as the sort are applied.
- If the fields in the index can be used to rule out a document as matching, then you can avoid loading more documents and doing fewer overall comparisons on data.
- If your field is a unicode string which has `0x00` bytes in it, then the sorting might break due to the way BSON serializes unicode strings. Proceed with caution!

## API

### `const db = new DB(bee)`

Initialize a new `DB` instance using a [hyperbee](https://github.com/hypercore-protocol/hyperbee/).
Note that it's up to you to figure out how to replicate the hyperbee (for added flexibility).
You may want to look into using [hyper-sdk](https://www.npmjs.com/package/hyper-sdk) since it works out of the box in both Node.js and web browsers.

### `const collection = db.collection(name)`

Get a reference to a `Collection` of documents within this hyperbee.
This is where you will store documents as well as perform queries on them.

### `await db.close()`

Close the `hyperbee` and clean up any file descriptors it opened.

### `const collection = new Collection(name, bee)`

Manually creates a Collection from a hyperbee and the collection name.

### `collection.name`

The name of this collection in the hyperbeedeebee.

### `const doc = await collection.insert(doc)`

Inserts a document into the collection.
Documents can contain any [BSON](https://github.com/mongodb/js-bson) data and most JS data types are automatically translated to their coresponding BSON types (e.g. Array and Date).
If the document doesn't have a `_id` field, one will be generated for it.
The `_id` field **must** be an `ObjectID`.
If you want to update a document, do another `insert` over the same `_id` to overwrite the old document.

### `const name = await collection.createIndex(fields, opts={})`

Create an index for a set of fields.
This will go over all the documents in the collection and if they have the apropriate fields, will add them to the index.
Indexing fields is important if you want to sort based on a query, or want to take advantage of sparsely querying the dataset to speed things up.

### `const index = await collection.getIndex(name)`

### `const exists = await collection.indexExists(name)`

### `const indexes = await collection.listIndexes()`

### `const doc = await collection.findOne(query)`

Search for a document that matches a given query.
If you specify a `_id` you can find the document without needing to perform an actual search.

### `const cursor = collection.find(query)`

You can also search through all documents for a particular query using a cursor.
Cursors are like a "query builder" where you can specify additional properties like sorting and skipping.

You can get all matching documents in a cursor with `await cursor`, or you can use `for await(const doc of cursor)` to asynchronously iterate through the documents one at a time.
Using the AsyncIterator feature of cursors is preferred so that you can speed up your searches and avoid loading too much data into memory.

Note that the cursor will attempt to use any indexes that are in your query (or the sort) to speed up performance.

### `const docs = await cursor`

You can treat the cursor as a promise to resolve the set of all documents within it.
Note that every time you await the cursor, you're fetching the documents from the database since it isn't a "real" promise.

### `for await (const doc of cursor)`

You can iterate through documents that match your query one at a time by using the cursor as an AsyncIterable.
Note that every time you use it as an async iterable, you are performing a new search.
This method is important if you're expecting a very large set of results or want to display things to users as data becomes available.

### `const cursor = cursor.skip(number)`

You can skip a number of results for pagination (useful with `cursor.limit`)

### `const cursor = cursor.limit(number)`

You can limit how many documents you wish you fetch from the database.

### `const cursor = cursor.sort(field, direction=1)`

You can sort the documents by a field if there is an index that uses that field available.
The `direction` specifies whether the values should be incrementing (`1`), or decrementing (`-1`).
If you want to sort by a timestamp with the latest first, use `-1`.

### `const cursor = cursor.hint(name)`

Hint at which database index the search should use.

### `const count = await cursor.count()`

Count the number of documents that match this query. Note that this operation _does_ download the documents from peers.

### `const {nMatched,nModified, nUpserted} = await collection.update(query, update, {upsert=false,multi=false,hint=null} = {})`

Update one or more documents in a collection that match a particular `query` (same query format as `.find()`).
You can specify that you want to update all documents that match using `multi: true`.
You can have the DB insert a document if it doesn't exist by specifying `upsert:true`.
You can specify a `hint` for which DB to use when searching for documents.
The `update` can either be a plain JavaScript object that maps which properties should be set, or it can be an `Update` object with properties that are documented below.
Note that order is not guaranteed if you specify several `update` operations that use the same key.
The `update` can also be an Array of `Update` objects in which case the operations will be applied in that order.

The return value contains fields for `nMatched` (number of documents that got matched in the search),
`nModified` (number of documents that got modified), and `nUpserted` (number of documents that got upserted if `upsert: true` was set in the options.

E.g.

```JavaScript
const {nModified} = await collection.update({
  birthday: today
}, {
  $inc: {age: 1}
}, {
  multi: true
})

const {nUpserted} = await collection.update({
  some_impossible_search: Infinity
}, {
  hello: 'World!'
}, {
  upsert: true
})
```

### `query[field] query[field].$eq`

Find fields that are equal to a specific value.

E.g.

```JavaScript
const docs = await collection.find({
  name: 'Bob'
})

// Equivalent to
const docs = await collection.find({
  name: {
    $eq: 'Bob'
  }
})
```

### `query[field].$gt query[field].$lt query[field].$gte query[field].$lte`

You can query by values that are greather than or less than a given value.

E.g.

```JavaScript
const docs = await collection.find({
  createdAt: {
    $lte: new Date(),
    $gt: new Date(2012, 01, 01)
  }
}).sort('createdAt', -1)
```

### `query[field].$in`

Check if a field is equal to one of a set of values in an array.
If the field is an array, it checks that the array contains a subset of the query array.

E.g.

```JavaScript
const docs = await collection.find({
  tags: {
    $in: ['cool', 'cats', 'spaghetti']
  }
})
```

### `query[field].$all`

Check if a field (which is an array) contains all the values within the query array.

E.g.

```JavaScript
const docs = await collection.find({
  permissions: {
    $all: ['read', 'write', 'create']
  }
})
```

### `query[field].$exists`

Check if a field exists in a document.
Note that it's impossible to use indexes for `$exists: false` at the moment.

```JavaScript
const docs = await collection.find({
  secret: {
    $exists: false
  }
})
```

### `update[field] = value`

You can set a field in a document by specifying it.

Note that nested fields with `.` are not yet supported, and fields with `$` at the start may conflict with other query parameters.

Effectively an alias for `update.$set[field]`

```JavaScript
// add the field `hello` to all documents in the collection
await collection.update({}, {
  hello: 'world',
  goodbye: 'space'
}, {multi:true})
```

### `update.$set[field] = value`

You can set a field in the document to a specific value using `$set`.

```JavaScript
// add the field `hello` to all documents in the collection
await collection.update({}, {
  $set: {
    hello: 'world',
    something: 'else'
  }
}, {multi:true})
```

### `update.$unset[field] = ''`

You can delete a field from a document using `$unset`.

The value of the query can be anything.

```JavaScript
await collection.update({}, {
  $unset: {
    honor: ''
  }
}, {multi:true})
```

### `update.$rename[field] = newName`

You can rename fields in a document using `$rename`

Effectively it deletes the existing `field` and sets the `newName` field to the value of the old field.

```JavaScript
await collection.update({}, {
  $rename: {
    oldFieldName: 'newFieldName'
  }
}, {multi:true})
```

### `update.$inc[field] = number`

You can use `$inc` to specify fields that should be incremented.

The `number` is the amount to increment by.

You can set `number` to a negative number to decrement fields.

If the field is not set in the document, the field will be set to `number`.

```JavaScript
await collection.update({}, {
  $inc: {
    points: 1000
  }
}, {multi:true})
```

### `update.$mult[field] = number`

You can use `$mult` to specify fields that should be multiplied.

The `number` is the amount to multiply by.

If the field is not set in the document, the field will be set to `number`.

```JavaScript
await collection.update({}, {
  $mult: {
    hp: 2,
    mp: 0.5
  }
}, {multi:true})
```

### `update.$push[field] = value`

You can append to the end of an array using `$push`

```JavaScript
// Add `adorable` to all objects with `tags` containing `cute`
await collection.update({tags: 'cute'}, {
  $push: {
    tags: 'adorable'
  }
}, {multi:true})
```

### `update.$addToSet[field] = value`

You can append a value to an array if that array doesn't already contain the value.

Useful for avoiding duplication.

If the `field` is not in the document, it will be set to an array with the `value`.

```JavaScript
// Add `adorable` to all objects with `tags` containing `cute`
// Avoids adding it to thing that are already adorable
await collection.update({tags: 'cute'}, {
  $addToSet: {
    tags: 'adorable'
  }
}, {multi:true})
```

You can use `$each` in the `value` to add a set of values.

```JavaScript
await collection.update({tags: 'cute'}, {
  $addToSet: {
    tags: {
      $each: ['adorable', 'fluffy']
    }
  }
}, {multi:true})
```

### `update.$pop[field] = direction`

You can remove an element from the end or start of an array using `$pop`.

The `direction` must be either `1` or `-1` where `1` removes from the end, and `-1` removes from the start.

```JavaScript
await collection.update({}, {
  $pop: {
    fromTheBack: 1,
    fromTheFront: -1
  }
}, {multi: true})
```

### `update.$pull[field] = query`

You can remove all elements that match a given query using `$pull`.

The `query` should match the queries used for field fields in `.find()`.

```JavaScript
// Find everyone that is cool, and remove `uncool` and `boring` from their `qualities` array.
await collection.update({
  isCool: true
}, {
  $pull: {
    qualities: {
      $in: ['uncool', 'boring']
    }
  }
})
```

## TODO:

- [x] Sketch up API
- [x] Insert (with BSON encoding)
- [x] Find all docs
- [x] Find by `_id`
- [x] Find by field eq (no index)
- [x] Find by array field includes
- [x] Find by number field `$gt`/`$gte`/`$lt`/`$lte`
  - [x] Numbers
  - [x] Dates
- [x] Find using `$in` operator
- [x] Find using `$all` operator
- [x] Find using `$exists` operator
- [x] Index fields
- [x] Sort by index (with find)
- [x] Indexed find by field `$eq`
- [x] Flatten array for indexes
- [x] Get field values from index key without getting the doc
- [x] Find on fields that aren't indexed
- [x] Indexed find for `$exists`
- [x] Indexed find by number field
- [x] Indexed find for `$in`
- [x] Indexed find for `$all`
- [x] Hint API (specify index to use)
- [ ] Delete documents (clean up indexed values for them)
- [ ] Test if iterators clean up properly
- [ ] More efficient support for `$gt`/`$gte`/`$lt`/`$lte` indexes
- [ ] More efficient support for `$all` indexes
- [ ] More efficient support for `$in` indexes
- [ ] Detect when data isn't available from peers and emit an error of some sort instead of waiting indefinately.
