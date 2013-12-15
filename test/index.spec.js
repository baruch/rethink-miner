describe('index page', function() {

  before(function() {
    this.server = http.createServer(app).listen(3333);
    this.browser = new Browser({site: 'http://localhost:3333' });
  });
  after(function(done) {
    this.browser.close();
    this.server.close(done);
    db = app.get('db');
    if (db) {
      db.close(function(err) {});
    }
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

  it('When no queries availble it should say so');//, function() {
    //assert.ok(this.browser.text('p'), 'No queries setup yet');
  //});
});
