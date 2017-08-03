'use strict'

class TokenBucket {

  constructor(opts, client){
    this.name = opts.name
    this.limit = opts.rate.limit
    this.window = opts.rate.window
    this.client = client
    this.ttl = opts.rate.window / 1e6 // TTL is in milliseconds whereas window is in nanoseconds
    this.cooldown = {}

    this.logger = opts.logger
    this.verbose = opts.verbose
  }

  // checks whether a request can be processed or must be rejected
  isAllowed(key){
    // set redis keys names
    const valueKey = `${this.name}:${key}`,
          tsKey = `${this.name}:${key}:ts`

    return this.client.multi()
    .setnx(valueKey, this.limit - 1) // create bucket if does not exist
    .pexpire(valueKey, this.ttl) // set  bucket TTL
    .execAsync()
    .then(res => {
      // bucket created => allow request
      if (res[0]){
        // set bucket creation date on timestamp key and set its TTL
        let now = process.hrtime()
        this.client.multi()
        .hmset(tsKey, 's', now[0], 'ns', now[1])
        .pexpire(tsKey, this.ttl)
        .execAsync()
        .catch(err => {
          this.logger.error(err)
        })

        // remove cooldown for key. since it's a new bucket, obviously it cannot be cooling down
        if (this.cooldown[key])
          delete this.cooldown[key]
        if (this.verbose)
          this.logger.debug(`${showts()} ${this.name} new bucket`)
        return Promise.reject(true) // quick exit
      }

      // get bucket size & last update timestamp
      return this.client.multi()
      .get(valueKey)
      .hvals(tsKey)
      .execAsync()
    })
    .then(res => {
      const size = parseFloat(res[0], 10), // bucket size
            lastUpdate = [parseInt(res[1][0], 10), parseInt(res[1][1], 10)],
            diff = process.hrtime(lastUpdate),
            // computes current time from last update & duration
            now = [lastUpdate[0] + diff[0], lastUpdate[1] + diff[1]]

      // computes how many tokens to add since last update.
      let tokens = (diff[0] * 1e9 + diff[1]) * this.limit / this.window,
          allow = true

      // variable only used in verbose logs
      if (this.verbose)
        var tokens_copy = tokens

      // sometimes tokens is NaN. Log all variables used to compute the value
      if (isNaN(tokens))
        this.logger.debug(`now:${now} lstUpdt:${lastUpdate}/${res[1]} lmt:${this.limit} wndw:${this.window}`)

      // toggle cooldown if necessary
      if (!this.cooldown[key] && size <= 0 && size + tokens < this.limit){
        this.cooldown[key] = Date.now()
        this.logger.info(`${showts()} ${valueKey} cooldown started`)
      }
      else if (this.cooldown[key] && size + tokens >= this.limit){
        this.logger.info(`${showts()} ${valueKey} cooldown lifted after ${Date.now - this.cooldown[key]}ms`)
        delete this.cooldown[key]
      }

      // determine whether request is allowed
      if (!this.cooldown[key] && size + tokens > 0 || isNaN(tokens)){
        if (tokens >= this.limit)
          tokens -= 1
        else if (size + tokens > this.limit)
          tokens = -size % 1
        else
          tokens = -1
      }
      else{
        allow = false
      }

      if (this.verbose){
        let old_tokens = tokens <= 0 ? ` (${tokens_copy.toFixed(3)})` : ''
        this.logger.debug(`${showts()} ${valueKey} bkt: ${size.toFixed(3)}  incr ${tokens.toFixed(3)}${old_tokens}  ${allow}`)
      }

      let commands = this.client.multi()
      .incrbyfloat(valueKey, Math.min(tokens, this.limit - size)) // update bucket size
      .pexpire(valueKey, this.ttl) // update bucket TTL - incr does not change it
      .pexpire(tsKey, this.ttl)

      if (tokens != -1)
        commands = commands.hmset(tsKey, 's', now[0], 'ns', now[1]) // set last update timestamp

      commands.execAsync()
      .catch(err => {
        this.logger.error(err)
      })

      return Promise.reject(allow)
    })
    .catch(allow => {
      if (typeof allow === 'object')
        this.logger.error(allow)

      return allow ? Promise.resolve() : Promise.reject()
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

module.exports = exports = TokenBucket
