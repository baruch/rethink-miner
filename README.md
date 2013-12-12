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

Baruch Even <baruch@ev-en.org>
