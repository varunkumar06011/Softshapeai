const RUNTIME_STATES = Object.freeze({
  STOPPED: 'stopped',
  STARTING: 'starting',
  READY: 'ready',
  STOPPING: 'stopping',
  ERROR: 'error',
});

function requiredAdapter(name, adapter) {
  if (!adapter || typeof adapter[name] !== 'function') {
    throw new TypeError(`Android Local POS adapter must implement ${name}()`);
  }
}

/**
 * Platform runtime for the Android-only local POS hub.
 *
 * The runtime deliberately depends on injected adapters. This keeps React out
 * of the critical POS path and makes the database, LAN, printer, and sync
 * implementations independently testable without changing desktop behavior.
 */
export class AndroidLocalPosRuntime {
  #state = RUNTIME_STATES.STOPPED;
  #lastError = null;
  #startedAt = null;

  constructor({ database, printer, sync, lan = null, auth = null, orderService = null } = {}) {
    requiredAdapter('open', database);
    requiredAdapter('close', database);
    requiredAdapter('health', database);
    requiredAdapter('print', printer);
    requiredAdapter('health', printer);
    requiredAdapter('start', sync);
    requiredAdapter('stop', sync);
    requiredAdapter('health', sync);

    if (lan !== null) {
      requiredAdapter('start', lan);
      requiredAdapter('stop', lan);
      requiredAdapter('health', lan);
    }

    this.adapters = { database, printer, sync, lan, auth, orderService };
  }

  async start() {
    if (this.#state === RUNTIME_STATES.READY) return this.getStatus();
    if (this.#state === RUNTIME_STATES.STARTING) return this.getStatus();

    this.#state = RUNTIME_STATES.STARTING;
    this.#lastError = null;

    try {
      await this.adapters.database.open();
      if (this.adapters.lan) await this.adapters.lan.start();
      await this.adapters.sync.start();
      this.#state = RUNTIME_STATES.READY;
      this.#startedAt = Date.now();
      return this.getStatus();
    } catch (error) {
      this.#state = RUNTIME_STATES.ERROR;
      this.#lastError = error;
      await this.#stopAfterStartFailure();
      throw error;
    }
  }

  async stop() {
    if (this.#state === RUNTIME_STATES.STOPPED) return this.getStatus();

    this.#state = RUNTIME_STATES.STOPPING;
    try {
      await this.adapters.sync.stop();
      if (this.adapters.lan) await this.adapters.lan.stop();
      await this.adapters.database.close();
      this.#state = RUNTIME_STATES.STOPPED;
      this.#startedAt = null;
      return this.getStatus();
    } catch (error) {
      this.#state = RUNTIME_STATES.ERROR;
      this.#lastError = error;
      throw error;
    }
  }

  getStatus() {
    return {
      state: this.#state,
      ready: this.#state === RUNTIME_STATES.READY,
      startedAt: this.#startedAt,
      lastError: this.#lastError?.message || null,
      database: this.adapters.database.health(),
      printer: this.adapters.printer.health(),
      sync: this.adapters.sync.health(),
      lan: this.adapters.lan?.health?.() || { enabled: false },
    };
  }

  assertReady() {
    if (this.#state !== RUNTIME_STATES.READY) {
      throw new Error(`Android Local POS is not ready (state: ${this.#state})`);
    }
  }

  async print(job) {
    this.assertReady();
    return this.adapters.printer.print(job);
  }

  async #stopAfterStartFailure() {
    try { await this.adapters.sync.stop(); } catch { /* preserve startup error */ }
    try { if (this.adapters.lan) await this.adapters.lan.stop(); } catch { /* preserve startup error */ }
    try { await this.adapters.database.close(); } catch { /* preserve startup error */ }
  }
}

export { RUNTIME_STATES };
