import { evaluateRegexRequest } from "./regex-worker-core.mjs";

type RegexWorkerRequest = {
  id: number;
  operation: "filter" | "preview";
  pattern: string;
  flags: string;
  values?: string[];
  sample?: string;
  deadlineEpochMs: number;
};

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<RegexWorkerRequest>) => void) | null;
  postMessage: (message: unknown) => void;
};

workerScope.onmessage = (event) => {
  const request = event.data;
  const result = evaluateRegexRequest(request);
  workerScope.postMessage({ id: request?.id, result });
};

export {};
