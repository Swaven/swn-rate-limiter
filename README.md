# swn-rate-limiter
Nodejs middleware that manages rate limiting &amp; request throttling. Uses the token bucket algorithm.

## Usage

Creating a new limit returns a function handler that can easily be plugged into Restify and other frameworks that support the common `(req, res, next)` middleware signature  format.

Limits can be instance-specific or shared across multiple server. See *name* and *local* options.

````javascript
limiter = require('swn-rate-limiter');

limiter.setup({
  redis: 'redis://localhost:6379',
  appName: 'my-app',
  verbose: true
});

var limit = limiter.createLimit({
  key: (x) => {return 'global'},
  rate: '50/s'
})

server.use(limit)
````


## API

### Methods

**setup(options)**  
Creates a redis client and connects using provided connection string.  
Options:

Name    | Type    | Mandatory | Description
--------|---------|-----------|-------------
redis   | String  | yes       | redis connection string
appName | String  | no       | An identifier for the app using the module. Defaults: ""
logger  | Object  | no        | logger object. Must expose debug/info/error methods. Default: console.
verbose | Boolean | no        | Default: false

*NB*: Not specifying an appName will cause issues if multiple applications have limits with the same name and share the same redis server.

**createLimit(options)**  
Creates a new rate limit. See [Options](#options) for details.



## Options

**key**  
Type: function  
Mandatory: true  
Returns the value for request grouping (e.g. IP, endpoint). The provided argument is the request object.  
Return a constant for a global limit that applies to all requests.

**rate**  
Type: string  
Mandatory: true  
The rate to apply. Must be in the form **number of requests** *slash* **time window**.  Time window can be a single unit, or a number and a unit for more complex rules (see examples below).  
Accepted time units: 's' (second), 'm' (minute), 'h' (hour), 'd' (day).

Examples:  
100/s: 100 requests per second  
300/5min: 300 request every 5 minutes

**name**  
Type: string  
Mandatory: no (default: random string)  
Limit identifier. If multiple limits share the same name, there will be a single bucket for them. So, limits that must apply cross-instances must have an explicit name, otherwise the random names will not match across instances.  
On the other hand, instance-specific limits (e.g. max requests per server) must have a random name or set **local** to true.

**local**  
Type: Boolean  
Mandatory: no (default: false)  
Whether to use a local or remote bucket. A local bucket is stored in-memory, and is not shared across instances. A remote bucket uses Redis as a backend store and can be shared.

**logger**  
Type: object  
Mandatory: no (default: none)  
Overwrites the global logger for this limit only.

**verbose**  
Type: boolean  
Mandatory: no (default: false)  
Enable/disable verbose logging. Overwrites the global setting.
