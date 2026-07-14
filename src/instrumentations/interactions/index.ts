import { vars } from "../../vars";
import { startClickInstrumentation } from "./click";
import { startScrollInstrumentation } from "./scroll";
import { startKeyPressInstrumentation } from "./keypress";
import { startChangeInstrumentation } from "./change";

export function startInteractionInstrumentation() {
  startClickInstrumentation();
  if (vars.interactionInstrumentation.captureScrolls !== false) {
    startScrollInstrumentation();
  }
  if (vars.interactionInstrumentation.captureKeyPresses !== false) {
    startKeyPressInstrumentation();
  }
  if (vars.interactionInstrumentation.captureChanges !== false) {
    startChangeInstrumentation();
  }
}
