# swn-rate-limiter
Express/Restify middleware that manages rate limiting &amp; request throttling.

## Usage

Creating a new limit returns a standard `(req, res, next)` function that can easily be plugged into Express or Restify.

````javascript
limiter = require('swn-rate-limiter');

limiter.connect('redis://localhost:6379');

var limit = limiter.createLimit({
  key: (x) => {return 'global'},
  rate: '50/s',
  verbose: true
})

server.use(limit)
````


## API

### Methods

**connect(connection_string)**  
Creates a redis client and connects using provided connection string.

**createLimit(options)**  
Creates a new rate limit. See [Options](#options) for details.



## Options

**key**  
type: function  
Returns the value for request grouping (e.g. IP, endpoint). The provided argument is the request object.  
Return a constant for the limit to apply globally to all requests.

**rate**  
type: string  
The rate to apply. Must be in the form **number of requests** *slash* **unit of time**.  
Accepted time units: 's' (second), 'm' (minute), 'h' (hour), 'd' (day).

**verbose**  
type: boolean  
Enable/disable verbose logging.
