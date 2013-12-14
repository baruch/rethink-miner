//process.env.NODE_ENV = 'test';
process.env.RDB_HOST = 'nas';

global.should = require('should');
global.assert = require('assert');
global.Browser = require('zombie');
global.app = require('../app');
global.http = require('http');

