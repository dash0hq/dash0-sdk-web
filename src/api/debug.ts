import { vars } from "../vars";
import { debug as debugLogger } from "../debug";

export function debug() {
  debugLogger('Dash0 Web SDK state:', vars)
}
