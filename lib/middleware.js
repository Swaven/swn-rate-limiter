'use strict'

const redis = require('redis'),
      bluebird = require('bluebird'),
      Limiter = require('./limiter.js')

var limiters = {}, // store all limiters
    client = null, // redis client
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
  client = redis.createClient(opts.redis, {
    enable_offline_queue: false
  })

  // set global options
  defaults.logger = opts.logger
  defaults.verbose = !!opts.verbose
}

module.exports = exports = {
  createLimit: createLimit,
  setup: setup
}
