import { parentPort, workerData } from "node:worker_threads";
import { evaluateRegexRequest } from "../../app/regex-worker-core.mjs";

parentPort.postMessage(evaluateRegexRequest(workerData));
