import { debug, warn } from "../debug";
import { win } from "../browser";
import { vars } from "../vars";
import { apis } from "../api";
import {init as sharedInit} from "../init";

type GlobalObject = {
  /**
   * Queued API calls. We will work through this queue during the initialization and then set it to `undefined`
   * afterward to signal completion
   */
  q?: Array<Array<any>>;
};

init();

function init(): void {
  debug("Initializing Dash0 Web SDK (via Script)");

  const globalObjectName = (win as any)[vars.nameOfLongGlobal];
  const globalObject: GlobalObject = win[globalObjectName] as any;

  if (!globalObject) {
    warn("global " + vars.nameOfLongGlobal + " not found. Did you use the correct Dash0 Web SDK initializer?");
    return;
  }

  if (!globalObject["q"]) {
    warn("Dash0 Web SDK command queue not defined. Did you add the script tag multiple times to your website?");
    return;
  }

  processQueuedApiCalls(globalObject.q);
  addApiCallAfterInitializationSupport();

  sharedInit();
}

function processQueuedApiCalls(apiCalls: Array<any>) {
  for (let i = 0, len = apiCalls.length; i < len; i++) {
    processQueuedApiCall(apiCalls[i]);
  }
}

function processQueuedApiCall(apiCall: Array<any>) {
  const apiName = apiCall[0];
  // @ts-ignore
  const apiFn = apis[apiName] as Function;

  if (!apiFn) {
    warn("Unsupported Dash0 Web SDK api: ", apiCall[0]);
    return;
  }

  apiFn.apply(null, apiCall.slice(1));
}

function addApiCallAfterInitializationSupport() {
  const globalObjectName = (win as any)[vars.nameOfLongGlobal];
  (win as any)[globalObjectName] = function () {
    /* eslint-disable prefer-rest-params */
    return processQueuedApiCall(arguments as any);
  };
}
