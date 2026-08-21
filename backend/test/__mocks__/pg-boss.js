class PgBoss {
  constructor() {
    this.handlers = {};
  }
  on() {}
  async start() { return this; }
  async stop() {}
  async createQueue() {}
  async send(name, data) {
    if (this.handlers[name]) {
      setTimeout(() => {
        this.handlers[name]([{ id: 'job1', data, name }]).catch(console.error);
      }, 50);
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
