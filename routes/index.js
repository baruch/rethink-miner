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

function displayTableHtml(res, params, response) {
  res.render('query', response);
}

function displayTableMethod(res, params, response, method, suffix) {
  answer = [response.result.headers].concat(response.result.res);
  res.attachment(params.name + '.' + suffix);
  method.call(res, answer);
}

function displayTableCsv(res, params, response) {
  displayTableMethod(res, params, response, res.csv, 'csv');
}

function displayTableJsonp(res, params, response) {
  displayTableMethod(res, params, response, res.jsonp, 'jsonp');
}

function queryParams(req) {
  params = {};

  if (req === null) {
    // No user supplied params, just defaults
    params.page_num = 0;
    params.page_size = 100;
    params.display = displayTableHtml;
    params.order_by = null;
    params.force_uptodate = false;
    params.name = 'unknown';
  } else {
    // Use user supplied params
    if (req.query.format == 'csv') {
      // Override params for CSV, just get everything out
      params.page_num = 0;
      params.page_size = 1000000;
      params.display = displayTableCsv;
    } else if (req.query.jsonp == 'jsonp') {
      params.page_num = 0;
      params.page_size = 1000000;
      params.display = displayTableJsonp;
    } else {
      params.page_size = parseInt(req.query.page_size) || 100;
      params.page_num = parseInt(req.query.page_num) || 0;
      params.display = displayTableHtml;
    }
    params.order_by = req.query.order;
    params.force_uptodate = req.query.uptodate || false;
    params.name = req.params.name;
  }

  return params;
}

function displayTable(err, q, params, res) {
  if (err) {
    return res.render('error', {title: 'Failed to get query setup', err: err});
  }
  q.pageData(params)
  .done(function (response) {
    params.display(res, params, response);
  }, function(err) {
    res.status(500);
    return res.render('error', {title: 'Failed to get data to display table', err: err});
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
  res.render('add', {result: {name: ''}});
}

function addSave(name, query, fields, res) {
  queries.namedQueryNew(name, query, fields)
  .then(function (q) {
    return Q.ninvoke(q, "save");
  }).done(function(result) {
    msg = 'Saved';
    if (result.inserted == 0) {
      msg = 'Failed to save for:' + result.first_error;
    }

    return res.render('add', {name: name, query: query, fields: fields, msg: msg});
  }, function(err) {
    res.render('add', {name: name, query: query, fields: fields, msg: 'Error while saving:' + err})
  });
}

function addTest(name, query, fields, res) {
  queries(namedQueryNew, name, query, fields)
  .then(function (q) {
    params = queryParams(null);
    return Q.ninvoke(q, 'pageData', params);
  })
  .then(function (result) {
    console.log('pass ok');
    result.name = name;
    result.query = query;
    result.fields = fields;
    return res.render('add', result);
  }, function (err) {
    console.log('pass fail');
    return res.render('add', {name: name, query: query, msg: err.message});
  })
  .fail(function (err) {
    console.log('failed');
    return res.render('error', {title: 'Failed creating a new named query', err: err});
  })
  .done();
}

exports.addSaveOrTest = function (req, res) {
  name = req.body.name;
  query = req.body.query;
  fields = req.body.fields;

  if (req.body.action == 'Save') {
    return addSave(name, query, fields, res);
  } else if (req.body.action == 'Test') {
    return addTest(name, query, fields, res);
  } else {
    res.status(404);
    res.render('error', {title: 'Unknown action in add', description: 'got action "' + req.body.action + '"'});
  }
}

exports.tables = function (req, res) {
  queries.tableList()
  .then(function (results) {
    console.log(results);
    res.render('tables', {'data': results});
  })
  .catch(function (err) {
    res.render('error', {title: 'Error while listing tables', err: err});
  })
  .done();
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
      // Get table headers
      db.onConnect(function (err, conn, conncb) {
        r.db(dbName).table(tableName).map(function(i) { return i.keys()}).distinct().reduce(function(red, i) {return red.union(i)}).
          run(conn, function (err, result) {
            conncb();
            callback(null, result.getUnique());
          });
      });
    },
    function(keys, callback) {
      // Count number of values for each header
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
      // Get a sample of values for each header
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
