var r = require('rethinkdb'),
    debug = require('debug')('rdb')
    self = this;


debug = console.log

/*
 * GET home page.
 */

exports.index = function(req, res){
    r.table('queries').run(self.connection, function(err, cursor) {
        if (err) {
                debug("[ERROR] %s:%s\n%s", err.name, err.msg, err.message);
                res.render('index', {title: 'Error querying db', res:[]})
                return
        }
        cursor.toArray(function(err, results) {
            if(err) {
                debug("[ERROR] %s:%s\n%s", err.name, err.msg, err.message);
                res.render('index', {title: 'No results', res: []});
            }
            else{
                res.render('index', {title: 'Known Queries', res: results});
            }
        });
    });
};

function prepare_table(fields_list, results) {
        headers = []
        fields = []
        if (fields_list == null) {
                fields = Object.keys(results[0])
                headers = Object.keys(results[0])
                if (fields.indexOf('reduction') != -1) {
                        fields.pop() // Assume it is last
                        headers.pop()
                        red = Object.keys(results[0].reduction)
                        red.forEach(function(field) {
                                fields.push(function(f) {
                                        return f['reduction'][field]
                                })
                                headers.push(field)
                        })
                }
        } else {
                fields_list.forEach(function(field) {
                        fields.push(field[0])
                        headers.push(field[1])
                })
        }
        return [headers, fields];
}

exports.q = function(req, res) {
        r.table('queries').get(req.params.name).run(self.connection, function(err, result) {
                if (result == null) {
                        res.redirect('/')
                        return
                }
                query = result.query;
                fields_list = result.fields
                if (1) {
                        
                        try {
                                q = eval(query)
                        
                                q.run(self.connection, function(err, cursor) {
                                        cursor.toArray(function(err, results) {
                                                if (err) {
                                                        debug("[ERROR] %s:%s\n%s", err.name, err.msg, err.message);
                                                        res.render('query', {name: req.params.name, code: query, res: []})
                                                } else {
                                                        d = prepare_table(fields_list, results);
                                                        headers = d[0]
                                                        fields = d[1]
                                                        entries = []
                                                        results.forEach(function(res) {
                                                                entry = []
                                                                fields.forEach(function(field) {
                                                                        if (typeof field == "string") {
                                                                                entry.push(res[field])
                                                                        } else {
                                                                                entry.push(field(res))
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
                                res.render('query', {name: req.params.name, code: query, headers:['Failed to run query'], res: [[e.toString()]]})
                        }
                } else {
                        res.render('query', {name: req.params.name, code: query, res: []});
                }
        });
};
