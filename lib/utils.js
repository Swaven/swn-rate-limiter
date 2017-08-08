'use strict'

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

function publishSns(conf, key, start, appName){
  if (!conf)
    return

  var action = start ? 'activated' : 'lifted',
      subject = `Rate Limiter ${action} for ${appName}`,
      body = `Rate Limiter ${action} at ${new Date().toISOString()}.

Application: ${appName}
Key: ${key}`

  conf.service.publish(conf.arn, subject, body)
}

module.exports = exports = {
  showts: showts,
  sns: publishSns
}
