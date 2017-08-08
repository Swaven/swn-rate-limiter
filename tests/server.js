'use strict'

/*
    A simple restify server for testing limits.
    Usage: node ./server.js limit_rate
*/

const logConfig = {
  level: 'debug',
  targets: [{type: 'stdout'},
            {type: 'file', path: 'trace.log'}]
}

const restify = require('restify'),
      logger = require('swn-logger').create('server', logConfig),
      rateLimiter = require('../lib/middleware.js')



var server = restify.createServer(),
    rate = process.argv[2],
    // sns mock service
    snsObj = {
      publish: function(arn, subject, message){
        console.log(`SNS ${arn} ${subject} ${message}`)
      }
    }

// set up limiter with redis connection
rateLimiter.setup({
  redis: 'redis://localhost:6379',
  appName: 'demo-server',
  logger: logger,
  verbose: true,
  sns: {
    service: snsObj,
    arn: 'coin'
  }
})

// creates a new limit
var limits = rateLimiter.createLimit({
  key: () => {return 'global'},
  rate: rate,
  name: 'all'
  // local: true
})

// use the limit handler
server.use(limits)

server.get('/hello', (req, res, next) => {
  res.send(200, 'hello')
  return next()
})

server.listen(8080, () => {
  logger.info('listening...')
})
