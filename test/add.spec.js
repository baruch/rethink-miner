describe('add query', function() {

  before(function(done) {
    self = this;
    d = done;
    port = 3336;
    process.env.RDB_DB = 'rethink_miner_test_db_' + port;
    dropDb(function (done) {
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

  describe('show add page', function() {
    beforeEach(function(done) {
      this.browser.visit('/add', done);
    });

    it('should work', function() {
      this.browser.success.should.be.ok;
    });

    it('should contain a save button', function() {
      assert.ok(this.browser.button('Save'));
    });

    it('should list available queries', function() {
      assert.ok(this.browser.button('Test'));
    });
  });

});
