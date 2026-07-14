import { win } from "../../utils";
import { debug } from "../../utils/debug";
import { addAttribute } from "../../utils/otel";
import { INTERACTION_KEY } from "../../semantic-conventions";
import { KeyValue } from "../../types/otlp";
import { vars } from "../../vars";
import { deriveActionName } from "./action-name";
import { registerActiveInteraction } from "./active-interaction";
import { emitInteractionEvent, pagePath } from "./emit";

/**
 * Only these navigation/activation keys are ever captured. Printable
 * characters (letters, digits, punctuation) are deliberately excluded --
 * capturing them would amount to keylogging. This is an allow-list, not a
 * block-list, so anything unknown is dropped by default.
 */
const CAPTURED_KEYS = new Set([
  "Enter",
  "Tab",
  "Escape",
  " ", // reported as "Space"
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Backspace",
  "Delete",
  "PageUp",
  "PageDown",
  "Home",
  "End",
]);

let listenerAttached = false;

function onWindowKeydown(event: KeyboardEvent) {
  if (!event.isTrusted) return;
  handleKeydown(event);
}

export function startKeyPressInstrumentation() {
  if (listenerAttached) return;
  if (!win) return;

  win.addEventListener("keydown", onWindowKeydown as EventListener, { capture: true });
  listenerAttached = true;
}

export function stopKeyPressInstrumentationForTests() {
  if (!listenerAttached || !win) return;
  win.removeEventListener("keydown", onWindowKeydown as EventListener, { capture: true } as EventListenerOptions);
  listenerAttached = false;
}

/**
 * Exported for tests (bypasses the isTrusted gate, same pattern as
 * click.ts/handleClick).
 */
export function handleKeydown(event: KeyboardEvent): void {
  try {
    if (event.repeat) return; // holding a key down is one interaction, not many
    if (!CAPTURED_KEYS.has(event.key)) return;

    const target = event.target;
    if (!target || (target as Node).nodeType !== 1) return;
    const element = target as Element;

    const key = event.key === " " ? "Space" : event.key;
    const { name, nameSource } = deriveActionName(element, vars.interactionInstrumentation.actionNameAttribute!);

    // Enter/Space frequently activate a control or submit a form, so register
    // the interaction for HTTP span attribution just like a click.
    const interaction = registerActiveInteraction(name);

    const extraAttributes: KeyValue[] = [];
    addAttribute(extraAttributes, INTERACTION_KEY, key);

    emitInteractionEvent({
      type: "key_press",
      // Press Enter in "Search parts" on /inventory/parts
      // Press Escape on /playground              (no derivable target name)
      title: name ? `Press ${key} in "${name}" on ${pagePath()}` : `Press ${key} on ${pagePath()}`,
      id: interaction.id,
      name,
      nameSource,
      element,
      extraAttributes,
    });
  } catch (err) {
    debug("Dash0 interaction instrumentation failed to process a keydown event.", err);
  }
}
