var r = require('rethinkdb'),
    debug = require('debug')('rdb'),
    csv = require('express-csv'),
    async = require('async'),
    db = require('../lib/db'),
    queries = require('../lib/query');

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
  queries.queriesList(function (err, results) {
    if (err) {
      res.status(500);
      return res.render('error', {title: 'Failed to list known queries', err: err});
    }
    res.render('index', {title: 'Known Queries', res: results});
  });
}

function queryParams(req) {
  params = {};

  if (req === null) {
    // No user supplied params, just defaults
    params.page_num = 0;
    params.page_size = 100;
    params.is_csv = false;
    params.order_by = null;
  } else {
    // Use user supplied params
    if (req.query.format == 'csv') {
      // Override params for CSV, just get everything out
      params.page_num = 0;
      params.page_size = 1000000;
      params.is_csv = true;
    } else {
      params.page_size = parseInt(req.query.page_size) || 100;
      params.page_num = parseInt(req.query.page_num) || 0;
      params.is_csv = false;
    }
    params.order_by = req.query.order;
  }

  return params;
}

function displayTable(err, q, params, res) {
  if (err) {
    return res.render('error', {title: 'Failed to get query setup', err: err});
  }
  q.pageData(params, function (err, response) {
    if (err) {
      res.status(500);
      return res.render('error', {title: 'Failed to get data to display table', err: err});
    }

    if (params.is_csv) {
      answer = [response.result.headers].concat(response.result.res);
      res.attachment(req.params.name + '.csv');
      res.csv(answer);
    } else {
      res.render('query', response);
    }
  });
}

function callbackDisplayTable(params, res) {
  return function(err, q) {
    displayTable(err, q, params, res);
  }
}

exports.q = function(req, res) {
  params = queryParams(req);
  queries.namedQuery(req.params.name, callbackDisplayTable(params, res));
}

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
    queries.namedQueryNew(name, query, req.body.fields, function(err, q) {
      if (err) {
        return res.render('error', {title: 'Failed creating a new named query', err: err});
      }

      params = queryParams(null);
      q.pageData(params, function(err, result) {
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
    res.render('error', {title: 'Unknown action in add', description: 'got action "' + req.body.action + '"'});
  }
}

exports.tables = function (req, res) {
  db.onConnect(function (err, conn, conncb) {
    r.dbList().run(conn, function(err, result) {
      conncb();
      if (err) {
        return res.render('error', {title: 'Failed to get list of databases', err: err});
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
          return res.render('error', {title: 'Error while listing tables', err: err});
        }
        res.render('tables', {'data': results});
      });
    });
  });
}

exports.table = function (req, res) {
  params = queryParams(req);

  dbName = req.params.db;
  tableName = req.params.table;

  queries.tableQuery(dbName, tableName, callbackDisplayTable(params, res));
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
