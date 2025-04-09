import { debug, warn } from "../debug";
import { win } from "../browser";
import { vars } from "../vars";
import { apis } from "../api";

type GlobalObject = {
  /**
   * Queued API calls. We will work through this queue during the initialization and then set it to `undefined`
   * afterward to signal completion
   */
  q?: Array<Array<any>>;

  /**
   * Script tag version
   */
  v: number;
}

init();

function init(): void {
  debug("Initializing Dash0 Web SDK (via Script)");

  const globalObjectName = (win as any)[vars.nameOfLongGlobal];
  const globalObject: GlobalObject = win[globalObjectName] as any;

  if (!globalObject) {
    warn("global " + vars.nameOfLongGlobal + " not found. Did you use the correct Dash0 Web SDK initializer?");
    return;
  }

  if (!globalObject.q) {
    warn("Dash0 Web SDK command queue not defined. Did you add the script tag multiple times to your website?");
    return;
  }

  if (typeof globalObject['v'] === 'number') {
    vars.scriptTagVersion = String(Math.round(globalObject['v']));
  }

  processQueuedApiCalls(globalObject.q);
  addApiCallAfterInitializationSupport();

  // TODO
  // if (!vars.reportingUrl && vars.reportingBackends.length === 0) {
  //   if (DEBUG) {
  //     error('No reporting URL configured. Aborting EUM initialization.');
  //   }
  //   return;
  // }
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
    warn('Unsupported Dash0 Web SDK api: ', apiCall[0]);
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
