export class RegexWorkerTimeoutError extends Error {
  constructor(timeoutMs) {
    super(`Regex evaluation exceeded the ${timeoutMs} ms worker deadline.`);
    this.name = "RegexWorkerTimeoutError";
    this.code = "REGEX_TIMEOUT";
    this.timeoutMs = timeoutMs;
  }
}

export class RegexWorkerEvaluator {
  #workerFactory;
  #worker = null;
  #sequence = 0;
  #pending = new Map();

  constructor({ workerFactory } = {}) {
    this.#workerFactory =
      workerFactory ??
      (() =>
        new Worker(new URL("../workers/regex-evaluator.worker.mjs", import.meta.url), {
          type: "module",
          name: "material-office-regex-evaluator",
        }));
  }

  #ensureWorker() {
    if (this.#worker) return this.#worker;
    const worker = this.#workerFactory();
    worker.addEventListener("message", (event) => this.#handleMessage(event.data));
    worker.addEventListener("error", (event) => {
      this.#failAll(event.error ?? new Error(event.message || "Regex worker failed."));
      this.#discardWorker();
    });
    this.#worker = worker;
    return worker;
  }

  #handleMessage(message) {
    if (!message || typeof message !== "object" || typeof message.id !== "string") return;
    const pending = this.#pending.get(message.id);
    if (!pending) return;
    if (message.type === "started") return;
    clearTimeout(pending.timer);
    this.#pending.delete(message.id);
    if (message.type === "result") {
      pending.resolve(message.result);
      return;
    }
    const error = new Error(message.error?.message ?? "Regex worker evaluation failed.");
    error.name = message.error?.name ?? "RegexWorkerError";
    error.code = message.error?.code ?? "REGEX_WORKER_ERROR";
    error.details = message.error?.details;
    pending.reject(error);
  }

  #failAll(error) {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
  }

  #discardWorker() {
    this.#worker?.terminate();
    this.#worker = null;
  }

  evaluate(payload, { timeoutMs = 250 } = {}) {
    if (!Number.isFinite(timeoutMs) || timeoutMs < 10 || timeoutMs > 5_000) {
      return Promise.reject(new RangeError("Worker timeout must be between 10 and 5000 ms."));
    }
    const worker = this.#ensureWorker();
    const id = `regex-${Date.now().toString(36)}-${(++this.#sequence).toString(36)}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#failAll(new RegexWorkerTimeoutError(timeoutMs));
        this.#discardWorker();
      }, timeoutMs);
      this.#pending.set(id, { resolve, reject, timer });
      worker.postMessage({ type: "evaluate", id, payload });
    });
  }

  testCollection(request, values, options = {}) {
    return this.evaluate(
      { operation: "testCollection", request, values },
      options,
    );
  }

  async filter(strings, request, options = {}) {
    if (!Array.isArray(strings)) {
      const error = new TypeError("Regex filter strings must be an array.");
      error.code = "INVALID_COLLECTION";
      throw error;
    }
    const result = await this.evaluate(
      { operation: "filter", request, values: strings },
      options,
    );
    if (
      !result ||
      !Array.isArray(result.matchedIndices) ||
      result.matchedIndices.some(
        (index, position) =>
          !Number.isInteger(index) ||
          index < 0 ||
          index >= strings.length ||
          (position > 0 && index <= result.matchedIndices[position - 1]),
      )
    ) {
      const error = new Error("Regex worker returned invalid matched indices.");
      error.name = "RegexWorkerError";
      error.code = "INVALID_WORKER_RESULT";
      throw error;
    }
    return result.matchedIndices;
  }

  dispose() {
    this.#failAll(Object.assign(new Error("Regex worker was disposed."), { code: "DISPOSED" }));
    this.#discardWorker();
  }
}
