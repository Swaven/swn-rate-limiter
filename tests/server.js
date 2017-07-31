'use strict'

const restify = require('restify'),
      rateLimiter = require('../lib/middleware.js')

var server = restify.createServer(),
    rate = process.argv[2]

// set up limiter with redis connection
rateLimiter.connect('redis://localhost:6379')

// creates a new limit
var limits = rateLimiter.createLimit({
  key: () => {return 'global'},
  rate: rate,
  verbose: true
})

// use the limit handler
server.use(limits)

server.get('/hello', (req, res, next) => {
  res.send(200, 'hello')
  return next()
})

server.listen(8080, () => {
  console.log('listening...')
})
