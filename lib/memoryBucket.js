'use strict'

const showts = require('./utils.js').showts

class MemoryBucket {

  constructor(opts){
    this.name = opts.name
    this.limit = opts.rate.limit
    this.window = opts.rate.window
    this.ttl = opts.rate.window
    this.cooldown = {}

    this.logger = opts.logger
    this.verbose = opts.verbose

    this.buckets = {}
  }

  // whether the bucket's time since last update is longer than its TTL
  _isOverTTL(ts){
    const diff = process.hrtime(ts)
    return (diff[0] * 1e9 + diff[1]) > this.ttl
  }

  // checks whether a request can be processed or must be rejected
  isAllowed(key){
    // bucket does not exist, create it
    if (!this.buckets[key] || this._isOverTTL(this.buckets[key].ts)){
      this.buckets[key] = {
        tokens: this.limit - 1,
        ts: process.hrtime()
      }

      // remove cooldown for key. since it's a new bucket, obviously it cannot be cooling down
      if (this.cooldown[key])
        delete this.cooldown[key]

      if (this.verbose)
        this.logger.debug(`${showts()} ${this.name}:${key} new bucket`)

      return Promise.resolve()
    }

    // Bucket exists: check
    const size = this.buckets[key].tokens, // bucket size
          lastUpdate = this.buckets[key].ts,
          diff = process.hrtime(lastUpdate),
          // computes current time from last update & duration
          now = [lastUpdate[0] + diff[0], lastUpdate[1] + diff[1]]

    // computes how many tokens to add since last update.
    let tokens = (diff[0] * 1e9 + diff[1]) * this.limit / this.window,
        allow = true

    // variable only used in verbose logs
    if (this.verbose)
      var tokens_copy = tokens

    // DEBUG: sometimes tokens is NaN. Log all variables used to compute the value
    // if (isNaN(tokens))
    //   this.logger.debug(`now:${now} lstUpdt:${lastUpdate}/${res[1]} lmt:${this.limit} wndw:${this.window}`)

    // toggle cooldown if necessary
    if (!this.cooldown[key] && size <= 0 && size + tokens < this.limit){
      this.cooldown[key] = Date.now()
      this.logger.info(`${showts()} ${this.name}:${key} cooldown started`)
    }
    else if (this.cooldown[key] && size + tokens >= this.limit){
      this.logger.info(`${showts()} ${this.name}:${key} cooldown lifted after ${Date.now() - this.cooldown[key]}ms`)
      delete this.cooldown[key]
    }

    // determine whether request is allowed
    if (!this.cooldown[key] && size + tokens > 0 || isNaN(tokens)){
      if (tokens >= this.limit)
        // new amount is over limit, request can be allowed but reduce the number of new tokens
        tokens -= 1
      else if (size + tokens > this.limit)
        //  bucket is near max capacity, set increment so that the new count is round integer
        tokens = this.limit - 1 - size
      else // request accepted, reduce token amount by 1
        tokens = -1
    }
    else{
      allow = false
    }

    if (this.verbose){
      let old_tokens = tokens <= 0 ? ` (${tokens_copy.toFixed(3)})` : ''
      this.logger.debug(`${showts()} ${this.name}:${key} bkt: ${size.toFixed(3)}  incr ${tokens.toFixed(3)}${old_tokens}  ${allow}`)
    }

    this.buckets[key].tokens += Math.min(tokens, this.limit - size)

    // set timestamp, but not when request is accepted as normal,
    // i.e. not when bucket is nearly full and we trim it
    if (tokens != -1)
      this.buckets[key].ts = now

    return allow ? Promise.resolve() : Promise.reject()
  }
}

module.exports = exports = MemoryBucket
