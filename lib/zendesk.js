
'use strict'

const Promise = require('bluebird')
const URL = require('url')
const querystring = require('querystring')
const https = require('https')

const DEFAULT_TIMEOUT = 30 * 1000;
const API_PREFIX = '/api/v2'

function assign(object, from) {
  var r = {}

  for(let key in object) {
    r[key] = object[key]
  }

  for(let key in from) {
    r[key] = from[key]
  }

  return r;
}

function stringifyArray(a) {
  return Array.isArray(a) ? a.join(',') : a;
}

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

    const accessor = (promise, path) => {
      return promise.then(result => {
        return result[path]
      })
      .catch(err => {
        return Promise.reject(new Error(err.message))
      })
    }

    const createMethods = (singular, plural) => {
      return prefix => {
        return {
          list: (params) => accessor(this._list(`${prefix}/${plural}.json`, params), plural),
          show: (id, params) => accessor(this._show(`${prefix}/${plural}/${id}.json`, params), singular),
          showMany: (ids, params) => accessor(this._list(`${prefix}/${plural}/show_many.json`,
            assign(params, {ids: stringifyArray(ids)})), plural),
          create: (params) => accessor(this._create(`${prefix}/${plural}.json`, {[singular]: params}), singular),
          update: (id, params) => accessor(this._update(`${prefix}/${plural}/${id}.json`, {[singular]: params}), singular),
          delete: (id) => this._delete(`${prefix}/${plural}/${id}.json`, id),
        }
      };
    }

    const createEncapsulator = (plural, objects) => {
      return parent_id => {
        let v = {}

        for(let key in objects) {
          v[key] = objects[key](`/${plural}/${parent_id}`)
        }

        return v;
      };
    }

    this.tickets = createMethods('ticket', 'tickets')('')
    this.ticket = createEncapsulator('tickets', {
      comments: createMethods('comment', 'comments')
    })
    this.ticketFields = createMethods('ticket_field', 'ticket_fields')('')
    this.organizations = createMethods('organization', 'organizations')('')
    this.users = createMethods('user', 'users')('')
    this.userFields = createMethods('user_field', 'users_fields')('')
    this.macros = createMethods('macro', 'macros')('')
    this.search = createMethods('search', 'search')('')
  }

  _request(method, path, params, cb) {
    let options = {}
    var trace = {};
    var request_body

    options.protocol = this.base_url.protocol
    options.host = this.base_url.host
    options.hostname = this.base_url.hostname
    options.port = this.base_url.port

    options.agent = this.agent
    options.path = API_PREFIX + path + (method === 'GET' && (typeof(params) === 'object') ?
      '?' + querystring.stringify(params) : '');
    options.method = method;
    options.headers = {}

    options.headers['Authorization'] = this.authorization
    options.headers['Accept'] = 'application/json;q=0.9,text/plain'

    if(method === 'POST' || method === 'PUT') {
      request_body = Buffer.from(JSON.stringify(params || {}))
      options.headers['Content-Type'] = 'application/json'
      options.headers['Content-Length'] = request_body.length
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
          return cb(new Error('Empty reply from Zendesk'));
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
          return cb(new Error(response.statusMessage));
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
      request.write(request_body);
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

  _list(path, params) {
    return this._request_promisified('GET', path,
      this._parse_params(params))
  }

  _show(path, params) {
    return this._request_promisified('GET', path, params)
  }

  _create(path, params) {
    return this._request_promisified('POST', path, params)
  }

  _update(path, params) {
    return this._request_promisified('PUT', path, params)
  }

  _delete(path, object_id) {
    return this._request_promisified('DELETE', path, null)
  }
}

module.exports = Zendesk;
