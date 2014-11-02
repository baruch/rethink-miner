var db = require('./db'),
    r = require('rethinkdb'),
    Promise = require('bluebird');
//cache = require('memory-cache'),
//var cache_time = 12 * 60 * 60 * 60; // 12 hours in msecs

var Query = {
  name: null,
  query: null,
  fields: null,
  href: null,

  headers: function() {
    if (!this.headers_val) {
      q = eval(this.query);
      q = q
        .groupedMapReduce(function (x) { return x.keys() }, function (x) { return 1 }, function (x,y) { return 1 })
        .map(function (x) { return x('group') })
        .reduce(function(red, i) {return red.union(i)});
      this.headers_val = db.rql(q)
        .then(function (result) {
          this.headers_val = result.getUnique();
          return this.headers_val;
        });
    }
    return this.headers_val;
  },

  distincts: function (params) {
    var qm = eval(this.query);
    qm = queryWithFilters(qm, params.filters);
    qm = queryWithFields(qm, params.fields);
    p = this.headers()
      .map(function (header) {
        q = qm.withFields(header)
          .groupedMapReduce(function (x) { return x }, function (x) { return 1 }, function (x,y) { return 1 })
          .map(function(x) { return x('group')(header) })
          .reduce(function (x,y) {
            return {
              key: header,
              count: x('count').add(1),
              distincts: x('distincts').union([y]).sample(10),
              min: r.branch(x('min'), r.branch(x('min').lt(y), x('min'), y), y),
              max: r.branch(x('max'), r.branch(x('max').gt(y), x('max'), y), y),
            }
          }, {count: 0, distincts: [], min: null, max: null});

        return db.rql(q);
      });
    return p;
  },

  histogram: function (key, params) {
    q = eval(this.query);
    q = queryWithFilters(q, params.filters);
    q = queryWithFields(q, params.fields);
    reql = q.withFields(key).groupBy(key, r.count).map(
          r.row.merge({
            key: r.row('group')(key),
            count: r.row('reduction')
          })
        ).without('group', 'reduction').orderBy('key');

    p = db.rql(reql).then(cursorToArray);
    return p;
  },

  pageData: function(params, callback) {
    p = doQueryPromise(this.name, this.query, this.fields, this.href, params);
    return p.nodeify(callback);
  },

  save: function() {
    q = r.table('queries').insert({name: this.name, query: this.query, fields: this.fields}, {conflict: "update"});
    return db.rql(q);
  },

  deleteQuery: function () {
    q = r.table('queries').get(this.name).delete();
    return db.rql(q);
  }
};

function namedQuery(name) {
  p = db.rql(r.table('queries').get(name))
    .then(function (result) {
      if (result === null) {
        err = new Error('No results found for query name "' + name + '"');
        throw err;
      } else {
        query = Query.objspawn({
          name: name,
          query: result.query,
          fields: result.fields,
          href: '/q/' + name,
        });

        return query;
      }
    });
  return p;
}

function namedQueryNew(name, queryCode, fields) {
  promise = new Promise(function (resolve, reject) {
    if (name && queryCode) {
      query = Query.objspawn({
        name: name,
        query: queryCode,
        fields: fields,
        href: '/q/' + name,
      });

      resolve(query);
    } else {
      err = new Error('query fields failed validation');
      reject(err);
    }
  });
  return promise;
}

function tableQuery(dbName, tableName) {
  query = Query.objspawn({
    name: 'Database "' + dbName + '" table "' + tableName + '"',
    query: 'r.db("' + dbName + '").table("' + tableName + '")',
    fields: null,
    href: '/table/' + dbName + '/' + tableName,
  });
  return Promise.cast(query);
}

function cursorToArray(cursor) {
  if (typeof(cursor) == 'object') {
    toArray = Promise.promisify(cursor.toArray, cursor);
    return toArray();
  } else {
    return cursor;
  }
}

function queriesList() {
  p = db.rql(r.db('rethink_miner').table('queries').orderBy('name'))
    .then(cursorToArray);
  return p;
}

function tableList() {
  p = db.rql(r.dbList())
    .then(function (dbList) {
      return dbList.sort();
    })
    .map(function (dbName) {
      p = db.rql(r.db(dbName).tableList());
      return Promise.props({name: dbName, tables: p});
    })
    .map(function (dbObj) {
      return {name: dbObj.name, tables: dbObj.tables.sort()};
    });
  return p;
}

exports.queriesList = queriesList;
exports.namedQuery = namedQuery;
exports.namedQueryNew = namedQueryNew;
exports.tableQuery = tableQuery;
exports.tableList = tableList;

// Utilities
//
//

function unpack_object(result, headers, fields, unpack_field) {
  red = Object.keys(result[unpack_field]);
  red.forEach(function(field) {
    fields.push(function(f) {
      return f[unpack_field][field];
    });
    headers.push(field);
  });
  return [headers, fields];
}

function prepare_table(fields_list, results) {
  headers = [];
  fields = [];
  if (results.length == 0) {
    return [headers, fields];
  }
  if (!fields_list) {
    result0 = results[0];
    fields = Object.keys(result0);
    headers = Object.keys(result0);
    if (fields.indexOf('reduction') != -1) {
      if (typeof(result0['reduction']) == 'object') {
        // This is a groupedMapReduce
        reduction_field = fields.indexOf('reduction');
        reduced_field = fields.splice(reduction_field, 1);
        reduced_header = headers.splice(reduction_field, 1);

        d = unpack_object(result0, headers, fields, 'reduction');
        headers = d[0];
        fields = d[1];
      } else if (typeof(result0['group']) == 'object') {
        // This is a groupBy
        group_field = fields.indexOf('group');
        grouped_field = fields.splice(group_field, 1);
        grouped_header = headers.splice(group_field, 1);

        d = unpack_object(result0, headers, fields, 'group');
        headers = d[0];
        fields = d[1];

        // Put the reduction at the end
        reduction_field = fields.indexOf('reduction');
        reduced_field = fields.splice(reduction_field, 1);
        reduced_header = headers.splice(reduction_field, 1);

        fields.push(reduced_field[0]);
        headers.push(reduced_header[0]);
      }

    }
  } else {
    fields_list.forEach(function(field) {
      fields.push(field[0]);
      headers.push(field[1]);
    });
  }
  return [headers, fields];
}

var re_gt = /^ *> *(-?[0-9]+)/;
var re_lt = /^ *< *(-?[0-9]+)/;
var re_ge = /^ *>= *(-?[0-9]+)/;
var re_le = /^ *<= *(-?[0-9]+)/;
var re_str_eq = /^ *= *([^ ]+)/;
var re_str_neq = /^ *! *([^ ]+)/;
var re_str_prefix = /^ *{ *([^ ]+)/;
var re_str_suffix = /^ *} *([^ ]+)/;
var re_str_regex = /^ *regex:([^ ]+)/;

function filterMatched(data, rgx, cb) {
  var match = rgx.exec(data.filter);

  if (match) {
    data.q = cb(data.q, data.field, match[1]);
    data.filter = data.filter.replace(rgx, '');
    data.changed = true;
  } else {
    data.changed = false;
  }

  return data;
}

function filterStart(q, field, filter) {
  return {'q': q, 'field': field, 'filter': filter};
}
function filterDone(data) {
  return data.q;
}

function filterGT(data) {
  return filterMatched(data, re_gt, function (q, field, val) {
    return q.filter(r.row(field).gt(parseInt(val)));
  });
}

function filterGE(data) {
  return filterMatched(data, re_ge, function (q, field, val) {
    return q.filter(r.row(field).ge(parseInt(val)));
  });
}

function filterLT(data) {
  return filterMatched(data, re_lt, function (q, field, val) {
    return q.filter(r.row(field).lt(parseInt(val)));
  });
}

function filterLE(data) {
  return filterMatched(data, re_le, function (q, field, val) {
    return q.filter(r.row(field).le(parseInt(val)));
  });
}

function filterStrEq(data) {
  return filterMatched(data, re_str_eq, function (q, field, val) {
    return q.filter(r.row(field).eq(val));
  });
}

function filterStrNeq(data) {
  return filterMatched(data, re_str_neq, function (q, field, val) {
    return q.filter(r.row(field).ne(val));
  });
}

function filterStrPrefix(data) {
  return filterMatched(data, re_str_prefix, function (q, field, val) {
    return q.filter(r.row(field).match('^' + val));
  });
}

function filterStrSuffix(data) {
  return filterMatched(data, re_str_prefix, function (q, field, val) {
    return q.filter(r.row(field).match(val + '$'));
  });
}

function filterStrRegex(data) {
  return filterMatched(data, re_str_regex, function (q, field, val) {
    return q.filter(r.row(field).match(val));
  });
}

function applyFilter(q, field, filter) {
  var data = filterStart(q, field, filter);
  var changed = true;

  while (changed) {
    changed = false;
    [filterGE, filterGT, filterLE, filterLT, filterStrEq, filterStrNeq, filterStrPrefix, filterStrSuffix, filterStrRegex].forEach(function (f) {
      data = f(data);
      if (data.changed) {
        changed = true;
      }
    });
  }

  return filterDone(data);
}

function ensure_array(value) {
  if (typeof(value) != 'object') {
    return [value];
  } else {
    return value;
  }
}

function queryWithFilters(q, filters) {
  filters = filters || null;
  for (var filter in filters) {
    var val = filters[filter].trim();
    q = applyFilter(q, filter, val);
  }
  return q;
}

function queryWithFields(q, fields) {
  fields = fields || null;
  if (params.fields) {
    var fields = ensure_array(params.fields);
    if (fields.indexOf('multiselect-all') == -1) {
      q = q.pluck.apply(q, fields);
    }
  }
  return q;
}

function queryWithOrder(q, order_by) {
  if (order_by) {
    // Convert string to array of a single string to have single handling later
    order_by = ensure_array(order_by);

    var new_order = [];
    order_by.forEach(function (order) {
      if (order[0] == '-') {
        order = r.desc(order.substring(1));
      }
      new_order.push(order);
    });
    q = q.orderBy.apply(q, new_order);
  }
  return q;
}

function doQueryPromise(queryName, query, fields_list, href, params) {
  page_size = params.page_size || 100;
  page_num = params.page_num || 0;
  useOutdated = !params.force_uptodate;
  //TODO: make useOutdated work again: run_opts = {connection:conn, useOutdated:useOutdated};

  q = eval(query);
  q = queryWithFilters(q, params.filters);
  q = queryWithFields(q, params.fields);
  q = queryWithOrder(q, params.order_by);

  start_index = page_num * page_size;

  var start_time = new Date();
  var end_time = start_time;

  promise_count = db.rql(q.count());
  promise_page = db.rql(q.skip(start_index).limit(page_size))
    .then(cursorToArray);

  p = Promise.all([promise_count, promise_page])
    .then(function(results) {
      end_time = new Date();

      count = results[0];
      results = results[1];
      last_page = 0;
      if (count > page_size) {
        last_page = Math.floor((count + page_size - 1)  / page_size) - 1;
      }
      if (typeof(results) == 'object') {
        d = prepare_table(fields_list, results);
        headers = d[0];
        fields = d[1];
        entries = [];
        results.forEach(function(res) {
          entry = [];
          fields.forEach(function(field) {
            if (typeof field == "string") {
              entry.push(res[field]);
            } else {
              entry.push(field(res));
            }
          });
          entries.push(entry);
        });
      } else {
        headers = ['result'];
        entries = [[results]];
        count = 1;
      }
      return {
        'result': {
          'name': queryName,
          'query': q.toString(),
          'headers':headers,
          'res': entries,
          'page_num': page_num,
          'page_size': page_size,
          'last_page': last_page,
          'count': count,
          'querybase': href,
          'time': end_time - start_time,
        },
        'order': params.order_by || null,
        'filters': params.filters || null,
        'fields': params.fields || null,
      };
    });
  return p;
}

Object.defineProperty(Object.prototype, "objspawn", {value: function (props) {
  var defs = {}, key;
  for (key in props) {
    if (props.hasOwnProperty(key)) {
      defs[key] = {value: props[key], enumerable: true};
    }
  }
  return Object.create(this, defs);
}});

Array.prototype.getUnique = function() {
  var u = {}, a = [];
  for(var i = 0, l = this.length; i < l; ++i){
    if(u.hasOwnProperty(this[i])) {
      continue;
    }
    a.push(this[i]);
    u[this[i]] = 1;
  }
  return a;
}
