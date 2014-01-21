rethink-miner
=============

A data mining helper for rethinkdb, collect your queries and keep them for reuse.

The main idea being to have a webapp where queries are kept, reused and rerun. Normally that happens by having a text file for them or the history of the query tool (Data Explorer rocks!) but that is insufficient longer term or when the group is > 1.

Currently this is simplistic and not very helpful but it's a good start. You need to save the queries manually in a database 'rethink_miner' in table 'queries' in the form:
{
  'name': 'Query Name',
  'query': "r.db('test').table('test').filter(r.row('age').gt(25))"
}

After you have such a query or two go the index page and you'll be able to choose the query to run and it will be run for you. The table headings will be auto-detected and they even should work for groupBy and groupedMapReduce.

rethink-miner uses nodejs, express and rethinkdb.

INSTALL
-------

* `git clone https://github.com/baruch/rethink-miner.git`
* `cd rethink-miner`
* `npm install`
* `PATH=node_modules/.bin:${PATH} RDB_HOST=MY_RETHINK_DB_HOST node server.js`

Upon first run a database will be created in your RethinkDB called `rethink_miner` and it will be populated with the `queries` table that has a primary key on the `name` field.

CAVEATS
-------

rethink-miner uses eval() internally to run the query, this means that this is a rather insecure webapp which will enable the user to take control over the server. This will be mitigated in the future by parsing the query and making sure nothing dangerous is happening inside it or by it but for now this is a limitation to be aware of.

Do not expose the webapp to possibly malicious users!

Baruch Even <baruch@ev-en.org>
