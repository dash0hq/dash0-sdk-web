import { debug } from "../utils";
import { init as initApi, InitOptions } from "../api/init";

export * from "../api/identify";
export * from "../api/debug";
export { terminateSession } from "../api/session";
export { reportError } from "../api/report-error";

export function init(opts: InitOptions): void {
  debug("Initializing Dash0 Web SDK (via package)");
  initApi(opts);
}
