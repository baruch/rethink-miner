describe('index page when empty', function() {

  before(function(done) {
    this.app = require('../app');
    this.server = http.createServer(this.app).listen(3334);
    this.browser = new Browser({site: 'http://localhost:3334' });
    this.app.initDb(done);
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
