import { Endpoint, vars } from "./vars";
import { debug, warn } from "./debug";

export function init(): void {
  if (vars.endpoints.length===0) {
    warn("No telemetry endpoint configured. Aborting Dash0 Web SDK initialization process.");
    return;
  }

  initializeAttributes();
}

function initializeAttributes() {
  // window.navigator.userAgent
}
