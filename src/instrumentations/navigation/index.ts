import { startPageLoadInstrumentation } from "./page-load";
import { startPageTransitionInstrumentation } from "./page-transition";

export function startNavigationInstrumentation() {
  startPageLoadInstrumentation();
  startPageTransitionInstrumentation();
}
