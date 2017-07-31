'use strict'

const prefix = 'swn-rl'

class Limiter {

  constructor(opts, name, client){
    this.name = name
    this.client = client
    this.verbose = opts.verbose

    // extract limit and window from rate
    var splits = opts.rate.split('/')
    this.limit = parseInt(splits[0], 10)

    switch(splits[1]){
      case 's':
        this.window = 1000; break;
      case 'm':
        this.window = 1000 * 60; break;
      case 'h':
        this.window = 1000 * 60 * 60; break;
      case 'd':
        this.window = 1000 * 60 * 60 * 24; break;
    }
  }

  // checks whether a request can be processed or must be rejected
  isAllowed(key){
    // set redis keys
    const valueKey = `${prefix}:${this.name}:${key}`,
          tsKey = `${prefix}:${this.name}:${key}:ts`


    return this.client.multi()
    .setnx(valueKey, this.limit - 1) // create bucket if does not exist
    .pexpire(valueKey, this.window) // set TTL
    .execAsync()
    .then(res => {
      // bucket created => allow request
      if (res[0]){
        this.client.psetexAsync(tsKey, this.window, Date.now())
        .catch(err => {
          console.log(err)
        })
        if (this.verbose)
          console.log(`${showts()} ${this.name}- new bucket`)
        return Promise.reject(true) // quick exit
      }

      // get bucket size & last update timestamp
      return this.client.multi()
        .get(valueKey)
        .get(tsKey)
        .execAsync()
    })
    .then(res => {
      // computes how many tokens to add since last update
      const size = parseFloat(res[0], 10),
            lastUpdate = res[1],
            now = Date.now(),
            // do not add more tokens than the max bucket size
            tokens = Math.min((now - lastUpdate) * this.limit / this.window, this.limit)

      let increment, allow = true

      if (size + tokens > 1)
        increment = tokens - 1
      else {
        increment = tokens
        allow = false
      }

      if (this.verbose)
        console.log(`${showts()} ${this.name}- bucket: ${size.toFixed(2)} / add ${tokens.toFixed(2)} ${allow}`)

      this.client.multi()
      .incrbyfloat(valueKey, Math.min(increment, this.limit - size))
      .pexpire(valueKey, this.window)
      .psetex(tsKey, this.window, now)
      .execAsync()
      .catch(err => {
        console.log(err)
      })

      return Promise.reject(allow)
    })
    .catch(allow => {
      if (typeof allow === 'object')
        console.error(allow)

      if (allow)
        return Promise.resolve()

      return Promise.reject()
    })
  }
}

function showts(){
    var t = new Date()
    return `${pad(t.getHours(), 2)}:${pad(t.getMinutes(),2)}:${pad(t.getSeconds(),2)}.${pad(t.getMilliseconds(),3)}`
}

function pad(n, width) {
  let z = '0';
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}

module.exports = exports = Limiter
