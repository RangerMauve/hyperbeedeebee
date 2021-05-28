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

## TODO:

- [x] Sketch up API
- [x] Insert (with BSON encoding)
- [x] Find all docs
- [x] Find by _id
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
- [ ] Test if iterators clean up properly
- [ ] More efficient support for `$gt`/`$gte`/`$lt`/`$lte` indexes
- [ ] More efficient support for `$all` indexes
- [ ] More efficient support for `$in` indexes
- [ ] Detect when data isn't available from peers and emit an error of some sort instead of waiting indefinately.

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
