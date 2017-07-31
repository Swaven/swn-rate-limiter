'use strict'

const redis = require('redis'),
      bluebird = require('bluebird'),
      Limiter = require('./limiter.js')

var limiters = {}, // store all limiters
    client = null // redis client

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

  var name = randomString(2)
  limiters[name] = new Limiter(opts, name, client)

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

// TODO: provide global options
// creates a global redis client
function connect(connectionString){
  client = redis.createClient(connectionString, {
    enable_offline_queue: false
  })
}

module.exports = exports = {
  createLimit: createLimit,
  connect: connect
}
