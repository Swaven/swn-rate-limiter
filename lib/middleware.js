'use strict'

const redis = require('redis'),
      bluebird = require('bluebird'),
      Limiter = require('./limiter.js'),

      BASE_RETRY_INTERVAL = 1000 // base interval between retries

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

  if (!/^\d+\/[smhd]$/.test(opts.rate))
    throw new Error('Invalid rate value')

  opts.verbose = opts.verbose != null ? !!opts.verbose : defaults.verbose
  opts.logger = defaults.logger || console
  if (!opts.logger.debug)
    opts.logger.debug = opts.logger.log
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

  var name = randomString(3)
  limiters[name] = new Limiter(opts, name, client)
  opts.logger.info(`new limit: ${opts.rate}`)

  // returns middleware function
  return function(req, res, next){
    var limiter = limiters[name]
    const realKey = opts.key.call(null, req)

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
      return BASE_RETRY_INTERVAL * Math.pow(e.attempt, 2)}
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
