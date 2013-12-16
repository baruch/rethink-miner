describe('index page', function() {

  before(function(done) {
    this.app = require('../app');
    this.server = http.createServer(this.app).listen(3335);
    this.browser = new Browser({site: 'http://localhost:3335' });
    this.app.initDb(done);
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
