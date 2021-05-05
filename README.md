# hyperbeedeebee
A MongoDB-like database built on top of Hyperbee with support for indexing

**WIP**

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
  hello: 'Wrold!'
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

// Get all results in an array
// Can skip some results and limit total for pagination
const killbots = await db.collection('example')
  .find({type: 'killbot'})
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
- [ ] Index fields (must specify BSON type, rebuild?)
- [ ] Flatten array for indexes
- [ ] Sort by index (with find)
- [ ] Indexed find by field (only allow find for indexed fields)
- [ ] Indexed find by number field (only allow find for indexed fields)
- [ ] Get field values from index key without getting the doc
- [ ] Choose best index (hint API?)
- [ ] Find on fields that aren't indexed
- [ ] Test if iterators clean up properly

## Important Differences From MongoDB

- There is a single writer for a hyperbee and multiple readers
- The indexing means that readers only need to download small subsets of the full dataset (if you index intelligently)
- No way to do "projections" so keep in mind you're always downloading the full document to disk
- Subset of `find()` API is implemented, no Map Reduce API, no `$or`/`$and` since it's difficult to optimize
- Fully open source under AGPL-3.0 and with mostly MIT dependencies.
