describe('index page', function() {

  before(function(done) {
    self = this;
    d = done;
    port = 3333;
    process.env.RDB_DB = 'rethink_miner_test_db_' + port;
    dropDb(function () {
      self.app = require('../app');
      self.server = http.createServer(self.app).listen(port);
      self.browser = new Browser({site: 'http://localhost:' + port });
      self.app.initDb(d);
    });
  });
  after(function(done) {
    this.browser.close();
    this.server.close(done);
  });

  beforeEach(function(done) {
    this.browser.visit('/', done);
  });

  it('should work', function() {
    this.browser.success.should.be.ok;
  });

  it('should contain an add link', function() {
    assert.ok(this.browser.link('Add'));
  });

  it('should list available queries', function() {
    assert.ok(this.browser.link('Temperature Average'));
  });

});
