describe('index page when empty', function() {

  before(function(done) {
    d = done;
    self = this;
    port = 3335;
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
    var self = this;
    db = this.app.get('db');
    rdb.table('queries').delete().run(db, function() {
      self.browser.visit('/', done);
    });
  });

  it('should work', function() {
    this.browser.success.should.be.ok;
  });

  it('should contain an add link', function() {
    assert.ok(this.browser.link('Add'));
  });

  it('When no queries availble it should say so', function() {
    this.browser.text('p').should.contain('No queries setup yet');
  });
});
