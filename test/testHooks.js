//process.env.NODE_ENV = 'test';
process.env.RDB_HOST = 'nas';
process.env.RDB_PORT = 28015;
process.env.RDB_DB = 'rethink_miner_test_db';


global.rdb = require('rethinkdb');

global.dropDb = function dropDb(done) {
  rdb.connect({host: process.env.RDB_HOST, port: process.env.RDB_PORT}, function(err, connection) {
    if (err) {
      panic('connection failed');
    }
    if (connection === null) {
      panic('connection null');
    }
    rdb.dbDrop(process.env.RDB_DB).run(connection, function() {
      done();
    });
  });
}

global.should = require('should');
global.assert = require('assert');
global.Browser = require('zombie');
global.http = require('http');

