'use strict';

/*
  Simple script that sends requests at regular interval.
  Usage: node ./client.js process duration interval
  spawns process that each send a request every [interval] second for [duration] seconds
*/

const http = require('http'),
      chalk = require('chalk'),
      cluster = require('cluster')

var proc_count = parseInt(process.argv[2], 10),
    duration = parseInt(process.argv[3], 10) * 1000,
    interval = parseFloat(process.argv[4], 10) * 1000,
    results = {},
    i = 0

if (!duration || !interval)
  throw new Error('invalid arguments')


if (cluster.isMaster){
  for (let i = 0; i < proc_count; i++){
    let worker = cluster.fork()
  }

  let doneProc = 0
  cluster.on('message', (worker, message) => {
    let keys = Object.keys(message)
    for (let k = 0; k < keys.length; k++){
      let status = keys[k]
      results[status] = results[status] || 0
      results[status] += message[status]
    }
    if (++doneProc === proc_count)
      reportResults()
  })
}
else{
  const start = Date.now()

  launch()

  let itv = setInterval(() => {
    let now = Date.now()
    if (now - start >= duration){
      clearInterval(itv)
      // reportResults()
      process.send(results)
      process.exit()
    }
    launch()
  }, interval)
}

function launch(){
  http.get('http://localhost:8080/hello', (res) => {
    const status = res.statusCode
    results[status] = results[status] ? ++results[status] : 1

    output(status)
    res.on('end', () => {})
  })
}


function output(status){
  let fn
  switch(status){
    case 200:
      fn = chalk.white; break;
    case 429:
      fn = chalk.red; break;
    default:
      fn: chalk.yellow;break;
  }
  let c = proc_count === 1 ? (++i % 10) : '.'
  process.stdout.write(fn(c))
  if (c === 0)
    process.stdout.write(fn(' '))
}

function reportResults(){
  console.log('\n\n------Results------`')
  var keys = Object.keys(results)
  for (let i = 0; i < keys.length; i++){
    let key = keys[i]
    console.log(`${key}: ${results[key]} reqs`)
  }
  let rate = results[200] / duration * 60 * 1000
  console.log(`Rate: ${rate.toFixed(2)} req/minute`)
}
