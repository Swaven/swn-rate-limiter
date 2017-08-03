'use strict'

class TokenBucket {

  constructor(name, rate, client, logger, verbose){
    this.name = name
    this.limit = rate.limit
    this.window = rate.window
    this.client = client
    this.logger = logger
    this.verbose = verbose
    this.ttl = this.window
    this.cooldown = {}
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
        this.client.psetexAsync(tsKey, this.ttl, Date.now())
        .catch(err => {
          this.logger.error(err)
        })
        if (this.cooldown[key])
          delete this.cooldown[key]
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
      let tokens = (now - lastUpdate) * this.limit / this.window,
          allow = true,
          t = tokens

      if (isNaN(tokens))
        this.logger.debug(`now:${now} lstUpdt:${lastUpdate}/${res[1]} lmt:${this.limit} wndw:${this.window}`)

      // toggle cooldown if necessary
      if (!this.cooldown[key] && size <= 0 && size + tokens < this.limit){
        this.cooldown[key] = true
        if (this.verbose)
          this.logger.info(`${showts()} ${valueKey} cooldown started`)
      }
      else if (this.cooldown[key] && size + tokens >= this.limit){
        delete this.cooldown[key]
        if (this.verbose)
          this.logger.info(`${showts()} ${valueKey} cooldown lifted`)
      }

      if (!this.cooldown[key] && size + tokens > 0 || isNaN(tokens)){
        if (tokens >= this.limit)
          tokens -= 1
        else
          tokens = -1
      }
      else{
        allow = false
      }

      if (this.verbose){
        let incr = tokens === -1 ? `${tokens} (${t.toFixed(3)})` : tokens.toFixed(3)
        this.logger.debug(`${showts()} ${valueKey} bkt: ${size.toFixed(3)}  incr ${incr} ${allow}`)
      }

      let commands = this.client.multi()
        .incrbyfloat(valueKey, Math.min(tokens, this.limit - size)) // update bucket size
        .pexpire(valueKey, this.ttl) // update bucket TTL - incr does not change it
        .pexpire(tsKey, this.ttl)

      if (tokens != -1)
        commands = commands.set(tsKey, now) // set last update timestamp and its TTL

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

  removeToken(key, count){
    const redisKey = `${this.name}:${key}`,
          tsKey = `${this.name}:${key}:ts`

    this.client.multi()
      .incrbyfloat(redisKey, -count)
      .pexpire(redisKey, this.ttl)
      .psetex(tsKey, this.ttl, Date.now())
      .execAsync()
    .catch(err => {
      this.logger.error(err)
    })
    return
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
