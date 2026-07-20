import { vars } from "../../vars";
import { startClickInstrumentation } from "./click";
import { startScrollInstrumentation } from "./scroll";
import { startKeyPressInstrumentation } from "./keypress";
import { startChangeInstrumentation } from "./change";

export function startInteractionInstrumentation() {
  startClickInstrumentation();
  // Scroll/key-press/change capture are individually opt-in: enabling
  // interaction instrumentation alone only captures clicks.
  if (vars.interactionInstrumentation.captureScrolls === true) {
    startScrollInstrumentation();
  }
  if (vars.interactionInstrumentation.captureKeyPresses === true) {
    startKeyPressInstrumentation();
  }
  if (vars.interactionInstrumentation.captureChanges === true) {
    startChangeInstrumentation();
  }
}
