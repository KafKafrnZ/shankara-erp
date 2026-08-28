class PgBoss {
  constructor() {
    this.handlers = {};
    // send() used to fire its handler via a bare setTimeout with nothing
    // tracking it — if a test's app.close() (and the DB connection it tears
    // down) ran before the 50ms timer fired, the handler hit the DB after
    // it was gone ("Driver not Connected"), logged past test teardown, and
    // Jest flagged it as "Cannot log after tests are done." stop() now
    // awaits every outstanding job first, same as the effect a real
    // graceful shutdown has when it drains in-flight work.
    this.pending = new Set();
  }
  on() {}
  async start() { return this; }
  async stop() {
    await Promise.allSettled([...this.pending]);
  }
  async createQueue() {}
  async send(name, data) {
    if (this.handlers[name]) {
      const p = new Promise((resolve) => {
        setTimeout(() => {
          this.handlers[name]([{ id: 'job1', data, name }])
            .catch(console.error)
            .finally(() => {
              this.pending.delete(p);
              resolve();
            });
        }, 50);
      });
      this.pending.add(p);
    }
    return 'job1';
  }
  async work(name, opts, handler) {
    if (!handler && typeof opts === 'function') {
      handler = opts;
    }
    this.handlers[name] = async (jobs) => {
        for (const job of jobs) {
            await handler(job);
        }
    };
  }
}
module.exports = { PgBoss };
