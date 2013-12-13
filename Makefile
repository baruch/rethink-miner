all: npmtest lint

npmtest:
	npm test

lint:
	PATH=node_modules/.bin:${PATH} jshint app.js routes/index.js

run:
	PATH=node_modules/.bin:${PATH} RDB_HOST=nas nodemon app.js

.PHONY: all lint
