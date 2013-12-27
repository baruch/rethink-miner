all: test lint

test:
	mocha

lint:
	PATH=node_modules/.bin:${PATH} jshint app.js routes/index.js

run:
	PATH=node_modules/.bin:${PATH} RDB_HOST=nas node server.js

.PHONY: all test lint run
