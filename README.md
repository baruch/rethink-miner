rethink-miner
=============

A data mining helper for rethinkdb, it helps you get information from the data by:
* Filtering on the data tables
* Ordering the data by simple selections
* Exporting the data to CSV
* Easy integration with AfterQuery for simple graphing of the data
* Saving repeated queries to simplify future work

The main idea being to have a webapp where queries are kept, reused and rerun. Normally that happens by having a text file for them or the history of the query tool (Data Explorer rocks!) but that is insufficient longer term or when the group is > 1. The ability to filter and look at the data without previously making for a report enables diving into the data to get the needed information.

rethink-miner uses nodejs, express and rethinkdb. It builds upon the composability of ReQL the RethinkDB query language.

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

Credits
-------

* The heavy lifting of the query handling is done by [RethinkDB](http://rethinkdb.com/)
* The filtering of the tables is based on the interface of [TableFilter](http://tablefilter.free.fr/)

Contact
-------

Baruch Even <baruch@ev-en.org>
