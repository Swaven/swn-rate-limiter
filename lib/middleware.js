'use strict'

const redis = require('redis'),
      bluebird = require('bluebird'),
      TokenBucket = require('./tokenBucket.js'),

      BASE_RETRY_INTERVAL = 1000, // base interval between retries
      RATE_REGEX = /^\d+\/[smhd]$/ // regex to validate rate & burst input

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

  if (!RATE_REGEX.test(opts.rate))
    throw new Error('Invalid rate value')

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
    return null

  var splits = input.split('/'),
      rate = { expr: input}

  rate.limit = parseInt(splits[0], 10)

  switch(splits[1]){
    case 's':
      rate.window = 1000; break;
    case 'm':
      rate.window = 1000 * 60; break;
    case 'h':
      rate.window = 1000 * 60 * 60; break;
    case 'd':
      rate.window = 1000 * 60 * 60 * 24; break;
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
