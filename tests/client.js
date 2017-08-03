'use strict';

const http = require('http'),
      chalk = require('chalk')

var duration = parseInt(process.argv[2], 10) * 1000,
    interval = parseFloat(process.argv[3], 10) * 1000,
    results = {},
    i = 0

if (!duration || !interval)
  throw new Error('invalid arguments')

const start = Date.now()

launch()

let itv = setInterval(() => {
  let now = Date.now()
  if (now - start >= duration){
    clearInterval(itv)
    reportResults()
    return
  }
  launch()
}, interval)


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
  let c = ++i % 10
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
