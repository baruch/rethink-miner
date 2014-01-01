var r = require('rethinkdb');

var dbConfig;

module.exports.setup = function(dbConf, done) {
  dbConfig = dbConf;

  onConnect(function (err, conn, conncb) {
    setupDB(conn);
    conncb();
    if (done) {
      done();
    }
  });
}

function onConnect(callback) {
  r.connect({host: dbConfig.host, port: dbConfig.port, db: dbConfig.db }, function (err, conn) {
    callback(err, conn, function() {
      conn.close();
    });
  });
}
module.exports.onConnect = onConnect;

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

function setupDB(conn) {
  dbName = dbConfig.db;
  r.dbCreate(dbName).run(conn, function(err, result) {
    r.db(dbName).tableCreate('queries', {primaryKey: 'name'}).run(conn, function(err, result) {
      if (result && result.created === 1) {
        r.db(dbName).tableCreate('test').run(conn, function(err, result) {
          r.db(dbName).table('test').insert(test_data()).run(conn, function(err, result) {
            if (result) {
              debug("Inserted %s sample test entries into table 'test' in db '%s'", result.inserted, dbName);
            }
          });
          r.db(dbName).table('queries').insert(test_queries()).run(conn, function(err, result) {
            if (result) {
              debug("Inserted %s sample queries into table 'queries' in db '%s'", result.inserted, dbName);
            }
          });
        });
      }
    });
  });
};
