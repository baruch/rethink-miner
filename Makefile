all: test lint

test:
	PATH=node_modules/.bin:${PATH} mocha

lint:
	PATH=node_modules/.bin:${PATH} jshint app.js routes/index.js

run:
	PATH=node_modules/.bin:${PATH} RDB_HOST=localhost nodejs server.js

.PHONY: all test lint run
