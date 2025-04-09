import { debug } from "../debug";

export * from "../api/identify";
export * from "../api/debug";

export function init(): void {
  debug("Initializing Dash0 Web SDK");
}
