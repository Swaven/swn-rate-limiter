'use strict'

const redis = require('redis'),
      bluebird = require('bluebird'),
      TokenBucket = require('./tokenBucket.js'),

      BASE_RETRY_INTERVAL = 1000, // base interval between retries, in ms
      RATE_REGEX = /^(\d+)\/(\d*)([smhd])$/ // regex to parse rate input

var limiters = {}, // store all limiters
    client = null, // redis client
    // default settings
    defaults = {
      logger: null,
      verbose: false
    }

// promisify redis methods
bluebird.promisifyAll(redis.RedisClient.prototype)
bluebird.promisifyAll(redis.Multi.prototype)

// ensures valid options
function validateOptions(opts){
  if (opts == null)
    throw new Error('Options not provided')

  // TODO: handle direct values (e.g. ip)
  if (typeof opts.key !== 'function')
    throw new Error('Key must be a function')

  // replaces rate expression with limit/window object
  opts.rate = parseRate(opts.rate)

  opts.name = opts.name || randomString(3)
  opts.verbose = opts.verbose != null ? !!opts.verbose : defaults.verbose
  opts.logger = defaults.logger || console
  if (!opts.logger.debug)
    opts.logger.debug = opts.logger.log
}

// parses a rate expression and return a { limit; window; } object
function parseRate(input){
  if (!input)
    throw new Error('Invalid rate value')

  var bits = input.match(RATE_REGEX),
      rate = {expr: input}

  if (bits == null)
    throw new Error('Invalid rate value')

  rate.limit = parseInt(bits[1], 10)

  var windowSize = 1 // default window size if none specified
  if (bits[2])
    windowSize = parseInt(bits[2], 10)

  // compute window, in nanoseconds
  // start with computing for seconds
  rate.window =  windowSize * 1e9

  // apply multiplier for time units other than second
  switch(bits[3]){
    case 'm': // minute
      rate.window *= 60; break;
    case 'h': // hour
      rate.window *= 3600; break;
    case 'd': // day
      rate.window *= 86400; break;
  }

  return rate;
}

// pseudo-random string generator, to name the limiters
function randomString(length) {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var result = '';
  for (var i = length; i > 0; --i)
    result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

// instanciates a new Limiter and returns the appropriate function handler
function createLimit(opts){
  validateOptions(opts)

  const name = opts.name,
        keyFunction = opts.key

  limiters[name] = new TokenBucket(opts, client)
  opts.logger.info(`new limit: ${opts.rate.expr}`)

  // returns middleware function
  return function(req, res, next){
    var limiter = limiters[name]
    const realKey = keyFunction.call(null, req)

    limiter.isAllowed(realKey)
    .then(() => {
      return next()
    })
    .catch(() => {
      res.send(429)
      return next(false)
    })
  }
}

// creates a global redis client
function setup(opts){
  // set global options
  defaults.logger = opts.logger
  defaults.verbose = !!opts.verbose

  client = redis.createClient(opts.redis, {
    prefix: 'swn-rl:',
    enable_offline_queue: false,
    retry_strategy: (e) => {
      // use square law for retry intervals
      return BASE_RETRY_INTERVAL * Math.pow(e.attempt, 2)
    }
  })

  client.on('connect', () => {
    defaults.logger.info('client connected')
  })

  // just having a listener prevents process from crashing
  client.on('error', err => {})
}

module.exports = exports = {
  createLimit: createLimit,
  setup: setup
}
