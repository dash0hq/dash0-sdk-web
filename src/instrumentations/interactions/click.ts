import { win } from "../../utils";
import { debug } from "../../utils/debug";
import { vars } from "../../vars";
import { deriveActionName } from "./action-name";
import { registerActiveInteraction } from "./active-interaction";
import { emitInteractionEvent, pagePath } from "./emit";

let listenerAttached = false;

function onWindowClick(event: Event) {
  if (!event.isTrusted) return;
  handleClick(event);
}

export function startClickInstrumentation() {
  if (listenerAttached) return;
  if (!win) return;

  win.addEventListener("click", onWindowClick, { capture: true });
  listenerAttached = true;
}

/**
 * Test-only teardown. Production code has no need to stop this listener --
 * matching the errors/index.ts precedent of start-only lifecycle -- but unit
 * tests need to avoid leaking a real window listener across test cases.
 */
export function stopClickInstrumentationForTests() {
  if (!listenerAttached || !win) return;
  win.removeEventListener("click", onWindowClick, { capture: true } as EventListenerOptions);
  listenerAttached = false;
}

/**
 * Handles a click event and, if the target is a valid Element, builds and
 * transmits a `browser.interaction` log. Exported separately from the
 * `isTrusted` gate in the real listener (see `onWindowClick`) so unit tests
 * can exercise the full event-building path directly: jsdom's
 * `dispatchEvent`, like real browsers, always produces `isTrusted: false`,
 * so a trust-gated entry point cannot be driven by synthetic test events.
 */
export function handleClick(event: Event): void {
  try {
    const target = event.target;
    if (!target || (target as Node).nodeType !== 1) {
      return;
    }

    const element = target as Element;
    const { name, nameSource } = deriveActionName(element, vars.interactionInstrumentation.actionNameAttribute!);
    const tag = element.tagName.toLowerCase();

    // Register this click as the active interaction BEFORE the application's
    // own handlers run (we are in the capture phase), so any HTTP request the
    // click triggers gets stamped with this interaction's id/name.
    const interaction = registerActiveInteraction(name);

    emitInteractionEvent({
      type: "click",
      // Click "Save Part" on /inventory/parts
      // Click button on /playground          (no derivable name)
      title: name ? `Click "${name}" on ${pagePath()}` : `Click ${tag} on ${pagePath()}`,
      id: interaction.id,
      name,
      nameSource,
      element,
    });
  } catch (err) {
    debug("Dash0 interaction instrumentation failed to process a click event.", err);
  }
}
