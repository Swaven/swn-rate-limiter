'use strict'

class Limiter {

  constructor(opts, client){
    this.client = client
    this.name = opts.name
    this.logger = opts.logger
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

    // Stores key/timestamp pairs when rejecting requests, for logging purposes
    this.throttled = {}
  }

  // checks whether a request can be processed or must be rejected
  isAllowed(key){
    // set redis keys
    const valueKey = `${this.name}:${key}`,
          tsKey = `${this.name}:${key}:ts`


    return this.client.multi()
    .setnx(valueKey, 0) // create bucket if does not exist
    .pexpire(valueKey, this.window) // set  bucket TTL
    .execAsync()
    .then(res => {
      // bucket created => allow request
      if (res[0]){
        this.client.psetexAsync(tsKey, this.window, Date.now())
        .catch(err => {
          this.logger.error(err)
        })
        if (this.verbose)
          this.logger.debug(`${showts()} ${this.name} new bucket`)
        return Promise.reject(true) // quick exit
      }

      // get bucket size & last update timestamp
      return this.client.multi()
        .get(valueKey)
        .get(tsKey)
        .execAsync()
    })
    .then(res => {
      const size = parseFloat(res[0], 10), // bucket size
            lastUpdate = parseInt(res[1], 10),
            now = Date.now()

      // computes how many tokens to add since last update.
      // Math.min so as to not add more tokens than the max bucket size
      let tokens = Math.min((now - lastUpdate) * this.limit / this.window, this.limit),
          allow = true

      if (size + tokens >= 1){
        // request can proceed, remove 1 token from bucket
        tokens = -1
      }
      else{
        // request is above limit. Update bucket with token amount
        allow = false
      }

      if (this.verbose)
        this.logger.debug(`${showts()} ${this.name} bucket: ${size.toFixed(3)} - incr ${tokens.toFixed(3)} ${allow}`)

      this.client.multi()
      .incrbyfloat(valueKey, Math.min(tokens, this.limit - size)) // update bucket size
      .pexpire(valueKey, this.window) // update bucket TTL - incr does not change it
      .psetex(tsKey, this.window, now) // set last update timestamp and its TTL
      .execAsync()
      .catch(err => {
        this.logger.error(err)
      })

      return Promise.reject(allow)
    })
    .catch(allow => {
      if (typeof allow === 'object')
        this.logger.error(allow)

      if (allow){
        if (this.throttled[key] != null){
          // allow previously rejected keys: log it
          let duration = Date.now() - this.throttled[key]
          this.logger.info(`key '${valueKey}': throttle lifted after ${duration}ms`)
          delete this.throttled[key] //not needed anymore, remove key
        }
        return Promise.resolve()
      }
      else{
        if (this.throttled[key] == null){
          // log & store timestamp when we start rejecting requests for a given key
          this.throttled[key] = Date.now()
          this.logger.info(`key '${valueKey}' throttled`)
        }
        return Promise.reject()
      }
    })
  }
}

// formats a timestamp
function showts(){
    var t = new Date()
    return `${pad(t.getHours(), 2)}:${pad(t.getMinutes(),2)}:${pad(t.getSeconds(),2)}.${pad(t.getMilliseconds(),3)}`
}

// padding numbers for timestamp
function pad(n, width) {
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join('0') + n;
}

module.exports = exports = Limiter
