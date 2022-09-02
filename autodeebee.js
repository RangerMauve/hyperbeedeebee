const Hyperbee = require('hyperbee')
const b4a = require('b4a')

module.exports = class Autodeebee {
  constructor (autobase, opts) {
    this.autobase = autobase
    this.opts = opts
    if (!opts?.sub) {
      this.autobase.start({
        unwrap: true,
        apply: applyAutobeeBatch,
        view: (core) =>
          new Hyperbee(core.unwrap(), {
            ...this.opts,
            extension: false
          })
      })
      this.bee = this.autobase.view
    }
  }

  ready () {
    return this.autobase.ready()
  }

  feed () {
    return this.bee.feed
  }

  close () {
    return this.bee.close()
  }

  sub (name) {
    const opts = this.opts ?? {}
    opts.sub = true
    const auto = new Autodeebee(this.autobase, opts)
    auto.bee = this.bee.sub(name)
    return auto
  }

  batch () {
    return this
  }

  flush () { }

  async put (key, value, opts = {}) {
    const op = b4a.from(
      JSON.stringify({ type: 'put', key, value, prefix: this.bee.prefix })
    )
    return await this.autobase.append(op)
  }

  async del (key, opts = {}) {
    const op = b4a.from(
      JSON.stringify({ type: 'del', key, prefix: this.bee.prefix })
    )
    return await this.autobase.append(op)
  }

  async get (key) {
    return await this.bee.get(key)
  }

  createReadStream (opts) {
    return this.bee.createReadStream(opts)
  }
}

function getKeyBufferWithPrefix (key, prefix) {
  return prefix ? b4a.concat([b4a.from(prefix), b4a.from(key)]) : b4a.from(key)
}
// A real apply function would need to handle conflicts, beyond last-one-wins.
async function applyAutobeeBatch (bee, batch) {
  const b = bee.batch({ update: false })
  for (const node of batch) {
    const op = JSON.parse(node.value.toString())
    const bufKey = getKeyBufferWithPrefix(op.key, op.prefix)
    if (op.type === 'put') {
      await b.put(bufKey, b4a.from(op.value))
    }
    if (op.type === 'del') await b.del(bufKey)
  }
  await b.flush()
}
