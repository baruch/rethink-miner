var r = require('rethinkdb'),
    debug = require('debug')('rdb'),
    self = this;


/*
 * GET home page.
 */

exports.index = function(req, res){
  r.table('queries').run(self.connection, function(err, cursor) {
    if (err) {
      debug("[ERROR] %s:%s\n%s", err.name, err.msg, err.message);
      res.render('error', {title: 'Error querying db', description:err});
      return;
    }
    cursor.toArray(function(err, results) {
      if(err) {
        debug("[ERROR] %s:%s\n%s", err.name, err.msg, err.message);
        res.render('error', {title: 'No results', description: err});
      }
      else{
        res.render('index', {title: 'Known Queries', res: results});
      }
    });
  });
};

function prepare_table(fields_list, results) {
  headers = [];
  fields = [];
  if (fields_list === null) {
    fields = Object.keys(results[0]);
    headers = Object.keys(results[0]);
    if (fields.indexOf('reduction') != -1) {
      fields.pop(); // Assume it is last
      headers.pop();
      red = Object.keys(results[0].reduction);
      red.forEach(function(field) {
        fields.push(function(f) {
          return f.reduction[field];
        });
        headers.push(field);
      });
    }
  } else {
    fields_list.forEach(function(field) {
      fields.push(field[0]);
      headers.push(field[1]);
    });
  }
  return [headers, fields];
}

exports.q = function(req, res) {
  r.table('queries').get(req.params.name).run(self.connection, function(err, result) {
    if (err) {
      return res.render('error', {title: 'Error querying database', description: err});
    }
    if (result === null) {
      return res.render('error', {title: 'No results found for query "' + req.params.name + '"'});
    }
    query = result.query;
    fields_list = result.fields;
    if (1) {

      try {
        q = eval(query);

        q.run(self.connection, function(err, cursor) {
          cursor.toArray(function(err, results) {
            if (err) {
              debug("[ERROR] %s:%s\n%s", err.name, err.msg, err.message);
              res.render('error', {title: 'Failed to convert query to array', description:err});
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
              res.render('query', {name: req.params.name, code: query, headers:headers, res: entries});
            }
          });
        });
      }
      catch (e) {
        res.render('query', {name: req.params.name, code: query, headers:['Failed to run query'], res: [[e.toString()]]});
      }
    } else {
      res.render('query', {name: req.params.name, code: query, res: []});
    }
  });
};

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

exports.setupDB = function (conn, dbName) {
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
