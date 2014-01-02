var r = require('rethinkdb'),
    debug = require('debug')('rdb'),
    csv = require('express-csv'),
    async = require('async'),
    db = require('../lib/db'),
    self = this;

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

/*
 * GET home page.
 */

exports.index = function(req, res) {
  db.onConnect(function (err, conn, conncb) {
    r.table('queries').orderBy('name').run(conn, function(err, cursor) {
      if (err) {
        conncb();
        debug("[ERROR] %s:%s\n%s", err.name, err.msg, err.message);
        res.status(500);
        res.render('error', {title: 'Error querying db', description:err});
        return;
      }
      cursor.toArray(function(err, results) {
        conncb();
        if(err) {
          debug("[ERROR] %s:%s\n%s", err.name, err.msg, err.message);
          res.status(500);
          res.render('error', {title: 'No results', description: err});
        }
        else{
          res.render('index', {title: 'Known Queries', res: results});
        }
      });
    });
  });
}

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

function query_result_object(cursor, queryName, query, fields_list, order_by, page_num, page_size, last_page, cb) {
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
        'last_page': last_page
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
            if (!page_num) {
              page_num = 0;
            }
            start_index = page_num * page_size;
            console.log({last_page: last_page, page_num: page_num, start_index: start_index, page_size: page_size});
            q = q.skip(start_index).limit(page_size);
          }
          q.run(conn, function(err, cursor) {
            callback(err, cursor);
          });
        }
      ], function (err, cursor) {
        if (err) {
          console.log('error in waterfall');
          return cb(err, null);
        }
        if (typeof(cursor) == 'object') {
          query_result_object(cursor, queryName, query, fields_list, order_by, page_num, page_size, last_page, cb);
        } else {
          cb(null, {'result': {'name': queryName, 'query': query, 'headers':['result'], 'res': [[cursor]], 'order': '', 'page_num': page_num, 'page_size': page_size, 'last_page': last_page}});
        }
      });
    }
    catch (e) {
      return cb(e, {title: 'Failed to run query', description: e.toString()})
    }
}

function doQueryByName(queryName, order_by, page_num, page_size, cb) {
  db.onConnect(function(err, conn, conncb) {
    r.table('queries').get(queryName).run(conn, function(err, result) {
      if (err) {
        console.log('query "' + queryName + '" is missing');
        conncb();
        return cb(err, {title: 'Error querying database', description: err});
      }
      if (result === null) {
        conncb();
        s = 'No results found for query "' + queryName + '"';
        return cb(new Error(s), {title: s});
      }
      query = result.query;
      fields_list = result.fields;

      doQuery(conn, queryName, query, fields_list, order_by, page_num, page_size, function(err, result) {
        cb(err, result);
        conncb();
      });
    });
  });
}

exports.q = function(req, res) {
  page_size = parseInt(req.query.page_size) || 100;
  page_num = parseInt(req.query.page_num);

  if (req.query.format == 'csv') {
    page_num = 0;
    page_size = 1000000;
  }

  doQueryByName(req.params.name, req.query.order, page_num, page_size,
      function(err, response) {
        if (err) {
          res.status(500);
          return res.render('error', response);
        }

        if (req.query.format == 'csv') {
          answer = [response.result.headers].concat(response.result.res);
          res.attachment(req.params.name + '.csv');
          res.csv(answer);
        } else {
          res.render('query', response);
        }
      }
  );
};

exports.addShow = function (req, res) {
  res.render('add', null);
}

function addSave(req, res) {
  name = req.body.name;
  query = req.body.query;
  if (name && query) {
    db.onConnect(function(err, conn, conncb) {
      r.table('queries').insert({name: name, query: query}).run(conn, function(err, result) {
        conncb();
        if (err) {
          return res.render('add', {name: name, query: query, msg: 'Save failed with error: ' + err});
        } else if (result.inserted > 0) {
          return res.render('add', {name: name, query: query, msg: 'Saved'});
        } else {
          return res.render('add', {name: name, query: query, msg: 'Failed to save for: ' + result.first_error});
        }
      });
    });
  } else {
    return res.render('add', {name: name, query: query, msg: 'fields failed validation'});
  }
}

function addTest(req, res) {
  name = req.body.name;
  query = req.body.query;

  if (name && query) {
    db.onConnect(function (err, conn, conncb) {
      doQuery(conn, 'Testing ' + name, query, null, null, 0, 100, function(err, result) {
        if (err) {
          // TODO: Need to output the error here
          res.render('add', {name: name, query: query, msg: err});
        }

        res.render('add', result);
      });
    });
  } else {
    res.render('add', {name: name, query: query, msg: 'Fields failed validation'});
  }
}

exports.addSaveOrTest = function (req, res) {
  if (req.body.action == 'Save') {
    return addSave(req, res);
  } else if (req.body.action == 'Test') {
    return addTest(req, res);
  } else {
    res.status(404);
    res.render('error', {title: 'Unknown action in add'});
  }
}

exports.tables = function (req, res) {
  db.onConnect(function (err, conn, conncb) {
    r.dbList().run(conn, function(err, result) {
      conncb();
      if (err) {
        return res.render('error', {title: 'Failed to get list of databases'});
      }

      async.map(result, function(dbName, cb) {
        db.onConnect(function (err, conn, conncb) {
          r.db(dbName).tableList().run(conn, function(err, result) {
            conncb();
            if (err) {
              return cb(err, null);
            }
            cb(null, {'name': dbName, 'tables': result});
          });
        });
      },
      function (err, results) {
        if (err) {
          return res.render('error', {title: 'Error while listing tables: ' + err});
        }
        res.render('tables', {'data': results});
      });
    });
  });
}

exports.table = function (req, res) {
  page_size = parseInt(req.query.page_size) || 100;
  page_num = parseInt(req.query.page_num) || 0;

  if (req.query.format == 'csv') {
    page_num = 0;
    page_size = 1000000;
  }

  dbName = req.params.db;
  tableName = req.params.table;
  queryName = 'db ' + dbName + ' table ' + tableName;
  query = 'r.db("' + dbName + '").table("' + tableName + '")';

  db.onConnect(function (err, conn, conncb) {
    doQuery(conn, queryName, query, null, req.query.order, page_num, page_size, function(err, response) {
      conncb();
      if (req.query.format == 'csv') {
        answer = [response.result.headers].concat(response.result.res);
        res.attachment(req.params.name + '.csv');
        res.csv(answer);
      } else {
        res.render('query', response);
      }
      res.render('table', response);
    });
  });
}

exports.tableDistinct = function (req, res) {
  page_size = 1000;
  page_num = 0;

  dbName = req.params.db;
  tableName = req.params.table;
  queryName = 'distinct values in db ' + dbName + ' table ' + tableName;

  async.waterfall([
    function(callback) {
      db.onConnect(function (err, conn, conncb) {
        r.db(dbName).table(tableName).map(function(i) { return i.keys()}).distinct().reduce(function(red, i) {return red.union(i)}).
          run(conn, function (err, result) {
            conncb();
            callback(null, result.getUnique());
          });
      });
    },
    function(keys, callback) {
      async.map(keys, function (key, cb) {
        db.onConnect(function (err, conn, conncb) {
          r.db(dbName).table(tableName).withFields(key).distinct().count().run(conn, function (err, result) {
            conncb();
            cb(err, {key: key, count: result});
          });
        });
      }, function (err, results) {
        callback(err, results);
      });
    },
    function(keys, callback) {
      async.map(keys, function(key, cb) {
        db.onConnect(function (err, conn, conncb) {
          r.db(dbName).table(tableName).withFields(key.key).distinct().sample(10).orderBy(key.key).run(conn, function(err, results) {
            async.map(results, function(obj, rescb) {
                rescb(null, obj[key.key]);
              }, function (err, results) {
                key.distincts = results;
                cb(err, key);
            });
            conncb();
          });
        });
      }, function (err, results) {
        callback(err, results);
      });
    }
  ], function (err, result) {
    res.render('distinct', {result: result});
  });
}
