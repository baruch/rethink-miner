var db = require('./db'),
    r = require('rethinkdb'),
    async = require('async');
//cache = require('memory-cache'),
//var cache_time = 12 * 60 * 60 * 60; // 12 hours in msecs

var Query = {
  name: null,
  query: null,
  fields: null,

  headers: function(callback) {
    db.onConnect(function (err, conn, conncb) {
      if (err) {
        return callback(err, null);
      }

      q = eval(this.query);
      q.map(function(i) { return i.keys()} ).distinct().reduce(function(red, i) {return red.union(i)}).run(conn, function (err, result) {
        this.headers_val = result.getUnique();
        conncb();
        callback(null, this.headers_val);
      });
    });
  },

  pageData: function(page_num, page_size, order_by, callback) {
    db.onConnect(function (err, conn, conncb)  {
      if (err) {
        return callback(err, null);
      }

      doQuery(conn, query.name, query.query, query.fields, order_by, page_num, page_size, function(err, result) {
        callback(err, result);
        conncb();
      });
    });
  }
};

function namedQuery(name, callback) {
  db.onConnect(function (err, conn, conncb) {
    if (err) {
      return callback(err, null);
    }

    r.table('queries').get(name).run(conn, function(err, result) {
      conncb();

      if (err) {
        return callback(err, null);
      }

      if (result === null) {
        s = 'No resulsts found for query name "' + name + '"';
        err = new Error(s);
        return callback(err, null);
      }

      query = Query.spawn({
        name: name,
        query: result.query,
        fields: result.fields,
      });
      
      callback(null, query);
    });
  });
}

function namedQueryNew(name, queryCode, fields, callback) {
  // FIXME: Verify that name doesn't exist already
  query = Query.spawn({
    name: name,
    query: queryCode,
    fields: fields,
  });

  callback(null, query);
}

function tableQuery(dbName, tableName, callback) {
  query = Query.spawn({
    name: 'Database "' + dbName + '" table "' + tableName + '"',
    query: 'r.db("' + dbName + '").table("' + tableName + '")',
    fields: null,
  });

  callback(null, query);
}

exports.namedQuery = namedQuery;
exports.namedQueryNew = namedQueryNew;
exports.tableQuery = tableQuery;


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
  if (!fields_list) {
    result0 = results[0]
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

function query_result_object(cursor, queryName, query, fields_list, order_by, page_num, page_size, last_page, count, cb) {
  cursor.toArray(function(err, results) {
    if (err) {
      debug("[ERROR] %s:%s\n%s", err.name, err.msg, err.message);
      return cb(err, {title: 'Failed to convert query to array', description:err});
    } else {
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
      cb(null, {'result': {
        'name': queryName,
        'query': query,
        'headers':headers,
        'res': entries,
        'order': order_by,
        'page_num': page_num,
        'page_size': page_size,
        'last_page': last_page,
        'count': count
      }});
    }
  });
}

function doQuery(conn, queryName, query, fields_list, order_by, page_num, page_size, cb) {
    try {
      if (order_by && query) {
        query += ".orderBy('" + order_by + "')"
      }

      q = eval(query);

      if (!page_num) {
        page_num = 0;
      }

      async.waterfall([
        // Count entries in table
        function (callback) {
          q.count().run(conn, function(err, count) {
            if (err) { console.log('error in counting'); }
            callback(err, count);
          });
        },
        // Get the actual entries
        function (count, callback) {
          last_page = 0;
          console.log({page_size: page_size, count: count});
          if (count > page_size) {
            last_page = Math.floor((count + page_size - 1)  / page_size) - 1;
            start_index = page_num * page_size;
            console.log({last_page: last_page, page_num: page_num, start_index: start_index, page_size: page_size});
            q = q.skip(start_index).limit(page_size);
          }
          q.run(conn, function(err, cursor) {
            callback(err, last_page, count, cursor);
          });
        }
      ], function (err, last_page, count, cursor) {
        if (err) {
          console.log('error in waterfall');
          return cb(err, null);
        }
        if (typeof(cursor) == 'object') {
          query_result_object(cursor, queryName, query, fields_list, order_by, page_num, page_size, last_page, count, cb);
        } else {
          cb(null, {'result': {'name': queryName, 'query': query, 'headers':['result'], 'res': [[cursor]], 'order': '', 'page_num': page_num, 'page_size': page_size, 'last_page': last_page, 'count': 1}});
        }
      });
    }
    catch (e) {
      return cb(e, {title: 'Failed to run query', description: e.toString()})
    }
}

Object.defineProperty(Object.prototype, "spawn", {value: function (props) {
  var defs = {}, key;
  for (key in props) {
    if (props.hasOwnProperty(key)) {
      defs[key] = {value: props[key], enumerable: true};
    }
  }
  return Object.create(this, defs);
}});
