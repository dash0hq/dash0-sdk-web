import { win, debug, warn } from "../utils";

import { reportError } from "../api/report-error";
import { identify } from "../api/identify";
import { debug as debugApi } from "../api/debug";
import { init as initApi } from "../api/init";
import { terminateSession } from "../api/session";

/**
 * All the APIs exposed through the script tag via `dash0('{{api name}}')`
 */
const scriptApis = {
  init: initApi,
  debug: debugApi,
  identify,
  terminateSession,
  reportError,
} as const;

type GlobalObject = {
  /**
   * Queued API calls. We will work through this queue during the initialization and then set it to `undefined`
   * afterward to signal completion
   */
  _q?: Array<IArguments>;
};

init();

function init(): void {
  debug("Initializing Dash0 Web SDK (via Script)");

  const globalObject: GlobalObject = (win as any)["dash0"] as GlobalObject;

  if (!globalObject) {
    warn("global 'dash0' not found. Did you use the correct Dash0 Web SDK initializer?");
    return;
  }

  if (!globalObject["_q"]) {
    warn("Dash0 Web SDK command queue not defined. Did you add the script tag multiple times to your website?");
    return;
  }

  processQueuedApiCalls(globalObject["_q"]);
  addApiCallAfterInitializationSupport();
}

function processQueuedApiCalls(apiCalls: Array<any>) {
  for (let i = 0, len = apiCalls.length; i < len; i++) {
    processQueuedApiCall(apiCalls[i]);
  }
}

function processQueuedApiCall(apiCall: IArguments) {
  const apiName = apiCall[0];
  // @ts-expect-error the APIs are dynamic
  const apiFn = scriptApis[apiName] as (typeof scriptApis)[apiName];

  if (!apiFn) {
    warn("Unsupported Dash0 Web SDK api: ", apiCall[0]);
    return;
  }

  const args: any[] = [];
  for (let i = 1; i < apiCall.length; i++) {
    args.push(apiCall[i]);
  }

  apiFn.apply(null, args);
}

function addApiCallAfterInitializationSupport() {
  const globalObjectName = (win as any)["dash0"];
  (win as any)[globalObjectName] = function () {
    return processQueuedApiCall(arguments as any);
  };
}
