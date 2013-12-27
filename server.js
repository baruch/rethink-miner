#!/usr/bin/node

fs = require('fs');

if (!fs.existsSync('run')) {
  fs.mkdirSync('run');
}

var forever = require('forever'),
  child = new(forever.Monitor)('app.js', {
    'silent': false,
    'pidFile': 'run/app.pid',
    'watch': true,
    'watchDirectory': '.',      // Top-level directory to watch from.
    'watchIgnoreDotFiles': true, // whether to ignore dot files
    'watchIgnorePatterns': [], // array of glob patterns to ignore, merged with contents of watchDirectory + '/.foreverignore' file
    'logFile': 'run/forever.log', // Path to log output from forever process (when daemonized)
    'outFile': 'run/forever.out', // Path to log output from child stdout
    'errFile': 'run/forever.err'
  });
child.start();
forever.startServer(child);
