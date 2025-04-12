import { vars } from "../vars";
import { debug as debugLogger } from "../utils/debug";

export function debug() {
  debugLogger("Dash0 Web SDK configuration state:", vars);
}
