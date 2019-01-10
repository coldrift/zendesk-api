
'use strict'

const Promise = require('bluebird')
const URL = require('url')
const querystring = require('querystring')
const https = require('https')

const DEFAULT_TIMEOUT = 30 * 1000;
const API_PREFIX = '/api/v2'

class Zendesk {

  constructor(options) {

    if(!options.url) {
      throw new Error('You must specify Zendesk URL')
    }

    this.base_url = URL.parse(options.url)

    if(!options.token) {
      throw new Error('You must specify Zendesk access token')
    }

    if(!options.oauth) {
      if(!options.email) {
        throw new Error('You must specify Zendesk email')
      }

      this.authorization = 'Basic ' + Buffer.from(
        options.email + '/token:' + options.token).toString('base64')
    }
    else {
      this.authorization = `Bearer ${options.token}`
    }
    
    this.agent = new https.Agent({keepAlive: true})

    this.tickets = {
      list: (params) => this._list('tickets', params),
      show: (id, params) => this._show('tickets', id, params)
    }
  }

  _request(method, path, params, cb) {
    let options = {}
    var trace = {};
    var request_body

    Error.captureStackTrace(trace, this._request);

    options.protocol = this.base_url.protocol
    options.host = this.base_url.host
    options.hostname = this.base_url.hostname
    options.port = this.base_url.port

    options.agent = this.agent
    options.path = API_PREFIX + path + ((typeof(params) === 'object') ?
      '?' + querystring.stringify(params) : '');
    options.method = method;
    options.headers = {}

    options.headers['Authorization'] = this.authorization
    options.headers['Accept'] = 'application/json;q=0.9,text/plain'
  
    if(method === 'POST') {
      options.headers['Content-Type'] = 'application/json'
      options.headers['Content-Length'] = Buffer.byteLength(request_body)
    }

    let request = https.request(options)

    var body = null;

    var timer = null;

    request.on('response', response => {

      response.on('data', data => {
        clearTimeout(timer);
        body = body ? Buffer.concat([body, data]) : data;
      });

      response.on('end', () => {
        clearTimeout(timer);

        if(!body) {
          let error = new Error('Empty reply from Zendesk')
          error.stack = trace.stack
          return cb(error);
        }

        if(response.statusCode >= 200 && response.statusCode < 300) {
          try {
            cb(null, JSON.parse(body.toString()))
          }
          catch(err) {
            cb(err)
          }
        }
        else {
          let error = new Error(response.status)
          error.stack = trace.stack
          return cb(error);
        }
      });
    });

    request.on('error', err => {
      clearTimeout(timer);
      let error = err instanceof Error ? err : new Error(error)
      error.stack = trace.stack
      cb(error);
    });

    if(request_body) {
      request.write(new Buffer(request_body));
    }

    request.end();

    var timer = setTimeout(function() {
      request.abort();
      let error = new Error('Timeout')
      error.stack = trace.stack
      cb(error);
    }, options.timeout || DEFAULT_TIMEOUT);
  }

  _request_promisified(method, path, params) {
    return Promise.fromCallback(cb => this._request(method, path, params, cb))
  }

  _parse_params(params) {
    return (typeof(params) === 'string') ?
      querystring.parse(params) : params
  }

  _list(object_type, params) {
    return this._request_promisified('GET', `/${object_type}.json`, this._parse_params(params))
      .then(reply => {
        return reply[object_type]
      })
  }

  _show(object_type, object_id, params) {
    return this._request_promisified('GET', `/${object_type}/${object_id}.json`, params)
  }

  _create(object_type, params) {
    return this._request_promisified('POST', `/${object_type}.json`, params)
  }

  _update(object_type, object_id, params) {
    return this._request_promisified('PUT', `/${object_type}/${object_id}.json`, params)
  }

  _delete(object_type, object_id) {
    return this._request_promisified('DELETE', `/${object_type}/${object_id}.json`, null)
  }
}

module.exports = Zendesk;
