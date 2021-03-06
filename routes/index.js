var r = require('rethinkdb'),
    debug = require('debug')('rdb'),
    csv = require('express-csv'),
    async = require('async'),
    db = require('../lib/db'),
    queries = require('../lib/query');

/*
 * GET home page.
 */

exports.index = function(req, res) {
  queries.queriesList()
    .then(function (results) {
      res.render('index', {title: 'Known Queries', res: results});
    })
    .catch(function (err) {
      res.status(500);
      return res.render('error', {title: 'Failed to list known queries', err: err});
    })
    .done();
}

function displayTableHtml(res, params, response) {
  response.query_page = true;
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

function queryParamFilters(req) {
  var queries = Object.keys(req.query);
  var filters = queries
    .filter(function(q) {
      return q.indexOf('filter_') == 0 && req.query[q];
    })
    .reduce(function (acc, q) {
      key = q.replace(/^filter_/, '');
      acc[key] = req.query[q].trim();
      return acc;
    }, {});
  return filters;
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
    params.filters = null;
    params.fields = null;
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
    params.fields = req.query.fields;

    params.filters = queryParamFilters(req);
  }

  return params;
}

function displayTable(query, params, res) {
  query
    .then(function (q) {
      return q.pageData(params);
    })
    .catch(function (err) {
      res.status(500);
      return res.render('error', {title: 'Failed to get query setup', err: err});
    })
    .then(function (response) {
      response.title = 'Results for ' + response.result.name;
      params.display(res, params, response);
    })
    .catch(function (err) {
      res.status(500);
      return res.render('error', {title: 'Failed to get data to display table', err: err});
    })
    .done();
}

exports.q = function(req, res) {
  params = queryParams(req);
  query = queries.namedQuery(req.params.name);
  displayTable(query, params, res);
}

exports.addShow = function (req, res) {
  res.render('add', {title: 'Add Query', query: req.query.q || '', action_target:'/manage/add'});
}

function addSave(name, query, fields, res, action_target) {
  queries.namedQueryNew(name, query, fields)
  .then(function (q) {
    return q.save();
  }).done(function(result) {
    msg = 'Saved';
    if (result.first_error) {
      msg = 'Failed to save for:' + result.first_error;
    }

    return res.render('add', {title: 'Add Query - Saved', name: name, query: query, fields: fields, msg: msg, action_target: action_target});
  }, function(err) {
    res.render('add', {title: 'Add Query', name: name, query: query, fields: fields, msg: 'Error while saving:' + err, action_target: action_target})
  });
}

function addTest(name, query, fields, res, action_target) {
  queries.namedQueryNew(name, query, fields)
  .then(function (q) {
    params = queryParams(null);
    return q.pageData(params);
  })
  .then(function (result) {
    result.name = name;
    result.query = query;
    result.fields = fields;
    result.title = 'Add Query';
    return res.render('add', result);
  }, function (err) {
    return res.render('add', {title: 'Add Query', name: name, query: query, msg: err.message, action_target: action_target});
  })
  .catch(function (err) {
    return res.render('error', {title: 'Failed creating a new named query', err: err});
  })
  .done();
}

exports.addSaveOrTest = function (req, res) {
  saveOrTestQuery(req, res, '/manage/add');
}

exports.manage = function (req, res) {
  queries.queriesList()
    .then(function (results) {
      res.render('manage', {title: 'Manage Queries', res: results});
    })
    .catch(function (err) {
      res.status(500);
      return res.render('error', {title: 'Failed to list known queries', err: err});
    })
    .done();
}

exports.editQuery = function (req, res) {
  query = queries.namedQuery(req.params.name);
  query
    .then(function (q) {
      res.render('add', {title: 'Edit Query ' + q.name, name: q.name, query: q.query, action_target: '/manage/edit/' + q.name});
    })
    .catch(function (err) {
      res.status(500);
      return res.render('error', {title: 'Failed to edit query', err: err});
    })
    .done();
}

function saveOrTestQuery(req, res, action_target) {
  name = req.body.name;
  query = req.body.query;
  fields = req.body.fields;

  if (req.body.action == 'Save') {
    return addSave(name, query, fields, res, action_target);
  } else if (req.body.action == 'Test') {
    return addTest(name, query, fields, res, action_target);
  } else {
    res.status(404);
    res.render('error', {title: 'Unknown action in add', description: 'got action "' + req.body.action + '"'});
  }
}

exports.saveOrTestEditedQuery = function (req, res) {
  saveOrTestQuery(req, res, '/manage/edit/' + req.params.name);
}

exports.deleteQuery = function (req, res) {
  query = queries.namedQuery(req.params.name);
  query.then(function (q) {
    if (req.query.action == 'Delete') {
      q.deleteQuery()
      .then(function (result) {
        res.render('delete_query', {title: 'Deleted Query', name: q.name, query: q.query, msg: 'Query Deleted'});
      })
      .done();
    } else {
      res.render('delete_query', {title: 'Delete Query ' + q.name, name: q.name, query: q.query});
    }
  })
  .catch(function (err) {
    res.render('error', {title: 'Cant delete query ' + req.params.name, err: err});
  })
  .done();
}

exports.tables = function (req, res) {
  queries.tableList()
  .then(function (results) {
    res.render('tables', {title: 'List of Tables', data: results});
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
  query = queries.tableQuery(dbName, tableName);

  displayTable(query, params, res);
}

function distinct(q, res, params) {
  q
    .then(function (query) {
      return query.distincts(params);
    })
    .then(function (result) {
      res.render('distinct', {title: 'Distinct values in ' + q.inspect().value().name, result: result});
    })
    .catch(function (err) {
      res.render('error', {title: 'Error while getting distinct values', err: err});
    })
    .done();
}

function tableQuery(req) {
  dbName = req.params.db;
  tableName = req.params.table;
  q = queries.tableQuery(dbName, tableName);
  return q;
}

function queryQuery(req) {
  return queries.namedQuery(req.params.name);
}

exports.tableDistinct = function (req, res) {
  q = tableQuery(req);
  params = queryParams(req);

  distinct(q, res, params);
}

exports.queryDistinct = function (req, res) {
  query = queryQuery(req);
  params = queryParams(req);
  distinct(query, res, params);
}

function keyHistogram(res, req, query, params) {
  key = req.params.key;
  query.then(function (query) {
      return query.histogram(key, params);
    })
    .then(function (result) {
      res.render('histogram_key', {result: result, key: key});
    })
    .catch(function (err) {
      res.render('error', {title: 'Error while getting histogram for key ' + key, err: err})
    })
    .done();
}

exports.tableHistogram = function(req, res) {
  q = tableQuery(req);
  params = queryParams(req);
  keyHistogram(res, req, q, params);
}

exports.queryHistogram = function (req, res) {
  q = queryQuery(req);
  params = queryParams(req);
  keyHistogram(res, req, q, params);
}
