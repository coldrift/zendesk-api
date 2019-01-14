
import request from 'request-promise';
import base64 from 'base-64';

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

    this.base_url = options.url

    if(!options.token) {
      throw new Error('You must specify Zendesk access token')
    }

    if(!options.oauth) {
      if(!options.email) {
        throw new Error('You must specify Zendesk email')
      }

      this.authorization = 'Basic ' + base64.encode(
        options.email + '/token:' + options.token)
    }
    else {
      this.authorization = `Bearer ${options.token}`
    }
    
    const accessor = (promise, path) => {
      return promise.then(result => {
        return result[path]
      })
      .catch(err => {
        throw new Error(err.message)
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
    this.organization = createEncapsulator('organizations', {
      tickets: createMethods('ticket', 'tickets')
    })
    this.users = createMethods('user', 'users')('')
    this.user = createEncapsulator('users', {
      tickets: createMethods('ticket', 'tickets')
    })
    this.userFields = createMethods('user_field', 'users_fields')('')
    this.macros = createMethods('macro', 'macros')('')
    this.search = createMethods('search', 'search')('')
  }

  _request(method, path, params) {
    let options = {
        method,
        uri: this.base_url + API_PREFIX + path + (typeof(params) === 'string' ? '?' + params : ''),
        headers: {
          authorization: this.authorization,
          accept: 'application/json;q=0.9,text/plain',
        },
        json: true
    };

    if(method === 'GET') {
      if(typeof(params) === 'object') {
        options.qs = params
      }
    }
    else if(method === 'POST' || method === 'PUT') {
      options.headers['content-type'] = 'application/json'
      options.body = params
    }

    return request(options)
  }

  _list(path, params) {
    return this._request('GET', path, params)
  }

  _show(path, params) {
    return this._request('GET', path, params)
  }

  _create(path, params) {
    return this._request('POST', path, params)
  }

  _update(path, params) {
    return this._request('PUT', path, params)
  }

  _delete(path, object_id) {
    return this._request('DELETE', path, null)
  }
}

module.exports = Zendesk;
