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
  db.onConnect(function (err, conn, conncb) {
    r.table('queries').orderBy('name').run(conn, function(err, cursor) {
      if (err) {
        conncb();
        debug("[ERROR] %s:%s\n%s", err.name, err.msg, err.message);
        res.status(500);
        res.render('error', {title: 'Error querying db', err: err});
        return;
      }
      cursor.toArray(function(err, results) {
        conncb();
        if(err) {
          debug("[ERROR] %s:%s\n%s", err.name, err.msg, err.message);
          res.status(500);
          res.render('error', {title: 'No results', err: err});
        }
        else{
          res.render('index', {title: 'Known Queries', res: results});
        }
      });
    });
  });
}

function doQueryByName(queryName, order_by, page_num, page_size, cb) {
  queries.namedQuery(queryName, function (err, q) {
    if (err) {
      return cb(err, null);
    }

    q.pageData(page_num, page_size, order_by, cb);
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
          return res.render('error', {title: 'Failed to perform get by named query', err: err});
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
    queries.namedQueryNew(name, query, req.body.fields, function(err, q) {
      if (err) {
        return res.render('error', {title: 'Failed creating a new named query', err: err});
      }
      q.pageData(0, 100, null, function(err, result) {
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
  page_size = parseInt(req.query.page_size) || 100;
  page_num = parseInt(req.query.page_num) || 0;

  if (req.query.format == 'csv') {
    page_num = 0;
    page_size = 1000000;
  }

  dbName = req.params.db;
  tableName = req.params.table;

  queries.tableQuery(dbName, tableName, function (err, q) {
    if (err) {
      return res.render('error', {title: 'Error in table query', err: err});
    }

    query.pageData(page_num, page_size, req.query.order, function(err, response) {
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
