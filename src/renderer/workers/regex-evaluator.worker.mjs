import { evaluateRegex, evaluateRegexCollection } from "../core/regex.mjs";

// Each request is held only for the duration of this message handler. The
// renderer-side client terminates and replaces this worker on deadline.
self.addEventListener("message", (event) => {
  const message = event.data;
  if (!message || message.type !== "evaluate" || typeof message.id !== "string") return;
  self.postMessage({ type: "started", id: message.id });
  try {
    const result =
      message.payload?.operation === "testCollection" ||
      message.payload?.operation === "filter"
        ? evaluateRegexCollection(
            message.payload.request,
            message.payload.values,
            { allowRisky: true },
          )
        : evaluateRegex(message.payload, { allowRisky: true });
    self.postMessage({ type: "result", id: message.id, result });
  } catch (error) {
    self.postMessage({
      type: "error",
      id: message.id,
      error: {
        name: error?.name ?? "Error",
        code: error?.code ?? "REGEX_WORKER_ERROR",
        message: error?.message ?? String(error),
        details: error?.details,
      },
    });
  }
});
