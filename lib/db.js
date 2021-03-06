var r = require('rethinkdb'),
    reql = require('reql-then'),
    Promise = require('bluebird');

var dbConfig;
var rql;

module.exports.setup = function(dbConf) {
  dbConfig = dbConf;
  rql = reql(dbConfig);
  return setupDB();
}

function performQuery(query) {
  return rql(query);
}
module.exports.rql = performQuery;

function test_data() {
  return [
  {
    'serial': 'DISK1',
    'temperature': 28,
    'reallocations': 0
  },
  {
    'serial': 'DISK2',
    'temperature': 38,
    'reallocations': 20
  },
  {
    'serial': 'DISK3',
    'temperature': 25,
    'reallocations': 120
  },
  {
    'serial': 'DISK4',
    'temperature': 25,
    'reallocations': 72
  },
  {
    'serial': 'DISK5',
    'temperature': 28,
    'reallocations': 4096
  },
  {
    'serial': 'DISK6',
    'temperature': 42,
    'reallocations': 1
  },
  {
    'serial': 'DISK7',
    'temperature': 27,
    'reallocations': 1025
  },
  {
    'serial': 'DISK8',
    'temperature': 14,
    'reallocations': 2
  },
  {
    'serial': 'DISK9',
    'temperature': 33,
    'reallocations': 190
  }
  ];
}

function test_queries() {
  return [
  {
    'name': 'Temperature Average',
    'query': "r.db('rethink_miner').table('test').pluck('temperature').avg()"
  },
  ];
}

function create_table(tableName, data_func) {
  return performQuery(r.db(dbConfig.db).tableCreate(tableName)).then(function (result) {
    if (result.created === 1) {
      return performQuery(r.db(dbConfig.db).table(tableName).insert(data_func()));
    }
    return null;
  });
}

function afterDbCreated(result) {
  if (result.created === 1) {
    table_queries = create_table('queries', test_queries);
    table_test = create_table('test', test_data);
    return Promise.all([table_queries, table_test]);
  }
  return null;
}

function setupDB() {
  dbName = dbConfig.db;
  return performQuery(r.dbCreate(dbName))
    .then(afterDbCreated)
    .catch(function (e) { if (e.name == 'RqlRuntimeError') { return null; } else { throw e; }});
};
