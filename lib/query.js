Object.defineProperty(Object.prototype, "spawn", {value: function (props) {
  var defs = {}, key;
  for (key in props) {
    if (props.hasOwnProperty(key)) {
      defs[key] = {value: props[key], enumerable: true};
    }
  }
  return Object.create(this, defs);
}});

var db = require('./db'),
    r = require('rethinkdb');
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
exports.namedQuery = namedQuery;
