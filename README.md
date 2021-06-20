# hyperbeedeebee
A MongoDB-like database built on top of Hyperbee with support for indexing

**WIP:** There may be breaking changes in the indexing before the v1.0.0 release, don't use this for anything you don't mind migrating in the future.

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
