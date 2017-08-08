'use strict'

/*
    - Use a single hash key instead of separate (string key for bucket, 1 hash for timestamp),
      as tests show it is a bit faster (~5%).
 */

const utils = require('./utils.js')

class RedisBucket {

  constructor(opts, client, sns){
    this.name = opts.name
    this.limit = opts.rate.limit
    this.window = opts.rate.window
    this.client = client
    this.ttl = opts.rate.window / 1e6 // TTL is in milliseconds whereas window is in nanoseconds
    this.cooldown = {}

    this.logger = opts.logger
    this.verbose = opts.verbose
    this.appName = opts.appName
    this.sns = sns
    this.rate = opts.rate.expr
  }

  // checks whether a request can be processed or must be rejected
  isAllowed(key){
    // set redis key name
    const redisKey = `${this.name}:${key}`

    return this.client.multi()
    .hsetnx(redisKey, 'tokens', this.limit - 1) // create bucket if does not exist
    .pexpire(redisKey, this.ttl) // set  bucket TTL
    .execAsync()
    .then(res => {
      // bucket created => allow request
      if (res[0]){
        // set bucket creation date
        let now = process.hrtime()
        this.client.hmsetAsync(redisKey, 's', now[0], 'ns', now[1])
        .catch(err => {
          this.logger.error(err)
        })

        // remove cooldown for key. since it's a new bucket, obviously it cannot be cooling down
        if (this.cooldown[key]){
          this.logger.info(`${utils.showts()} ${redisKey} cooldown lifted after ${Date.now() - this.cooldown[key]}ms`)
          delete this.cooldown[key]
          utils.sns(this.sns, redisKey, false, this.appName, this.rate)
        }

        if (this.verbose)
          this.logger.debug(`${utils.showts()} ${this.name} new bucket`)
        return Promise.reject(true) // quick exit
      }

      // bucket exists: get its size & last update timestamp
      return this.client.hvalsAsync(redisKey)
    })
    .then(res => {
      const size = parseFloat(res[0], 10), // bucket size
            lastUpdate = [parseInt(res[1], 10), parseInt(res[2], 10)],
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
        this.logger.info(`${utils.showts()} ${redisKey} cooldown started`)
        utils.sns(this.sns, redisKey, true, this.appName, this.rate)
      }
      else if (this.cooldown[key] && size + tokens >= this.limit){
        this.logger.info(`${utils.showts()} ${redisKey} cooldown lifted after ${Date.now() - this.cooldown[key]}ms`)
        delete this.cooldown[key]
        utils.sns(this.sns, redisKey, false, this.appName, this.rate)
      }

      // determine whether request is allowed
      if (!this.cooldown[key] && size + tokens > 0 || isNaN(tokens)){
        // new amount is over limit, request can be allowed but reduce the number of new tokens
        if (tokens >= this.limit)
          tokens -= 1
        //  bucket is near max capacity, set increment so that the new count is round integer
        else if (size + tokens > this.limit)
          // tokens = -size % 1
          tokens = this.limit - 1 - size
        // request accepted, reduce token amount by 1
        else
          tokens = -1
      }
      else{
        allow = false
      }

      if (this.verbose){
        let old_tokens = tokens <= 0 ? ` (${tokens_copy.toFixed(3)})` : ''
        this.logger.debug(`${utils.showts()} ${redisKey} bkt: ${size.toFixed(3)}  incr ${tokens.toFixed(3)}${old_tokens}  ${allow}`)
      }

      let commands = this.client.multi()
      .hincrbyfloat(redisKey,'tokens',  Math.min(tokens, this.limit - size)) // update bucket size
      .pexpire(redisKey, this.ttl) // update bucket TTL - incr does not change it

      // set timestamp, but not when request is accepted as normal,
      // i.e. not when bucket is nearly full and we trim it
      if (tokens != -1)
        commands = commands.hmset(redisKey, 's', now[0], 'ns', now[1])

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

module.exports = exports = RedisBucket
