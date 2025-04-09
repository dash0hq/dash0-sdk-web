import { debug } from "../debug";
import {init as sharedInit} from "../init";
import { init as initApi, InitOptions } from "../api/init";

export * from "../api/identify";
export * from "../api/debug";

export function init(opts: InitOptions): void {
  debug("Initializing Dash0 Web SDK");
  initApi(opts);
  sharedInit();
}
