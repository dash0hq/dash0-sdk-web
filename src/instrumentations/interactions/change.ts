import { win } from "../../utils";
import { debug } from "../../utils/debug";
import { addAttribute } from "../../utils/otel";
import { INTERACTION_SELECTED_COUNT, INTERACTION_VALUE_LENGTH } from "../../semantic-conventions";
import { KeyValue } from "../../types/otlp";
import { vars } from "../../vars";
import { deriveActionName } from "./action-name";
import { registerActiveInteraction } from "./active-interaction";
import { emitInteractionEvent, pagePath } from "./emit";

/**
 * Form-change capture, privacy-first: the VALUE of a field is never read.
 * What is emitted, per control kind:
 *   - text-like inputs / textarea: the value's LENGTH only
 *     ("Change "Email" to 17 characters")
 *   - select: the number of selected options only
 *     ("Change "Country" to 1 selected")
 *   - checkbox / radio: the fact that it was toggled, nothing else
 *   - password inputs: not even the length (length is itself a weak secret)
 *   - file inputs: the fact that files were chosen; never a filename
 * Field names come from deriveActionName, which for form controls only uses
 * naming attributes (aria-label, placeholder, the custom attribute), never
 * user-entered content.
 */
const CHANGE_TAGS = new Set(["INPUT", "SELECT", "TEXTAREA"]);
const NO_LENGTH_INPUT_TYPES = new Set(["password", "hidden"]);
const TOGGLE_INPUT_TYPES = new Set(["checkbox", "radio"]);

let listenerAttached = false;

function onWindowChange(event: Event) {
  if (!event.isTrusted) return;
  handleChange(event);
}

export function startChangeInstrumentation() {
  if (listenerAttached) return;
  if (!win) return;

  win.addEventListener("change", onWindowChange, { capture: true });
  listenerAttached = true;
}

export function stopChangeInstrumentationForTests() {
  if (!listenerAttached || !win) return;
  win.removeEventListener("change", onWindowChange, { capture: true } as EventListenerOptions);
  listenerAttached = false;
}

/**
 * Exported for tests (bypasses the isTrusted gate, same pattern as
 * click.ts/handleClick).
 */
export function handleChange(event: Event): void {
  try {
    const target = event.target;
    if (!target || (target as Node).nodeType !== 1) return;
    const element = target as Element;
    if (!CHANGE_TAGS.has(element.tagName)) return;

    const { name, nameSource } = deriveActionName(element, vars.interactionInstrumentation.actionNameAttribute!);
    const tag = element.tagName.toLowerCase();
    const label = name ? `"${name}"` : tag;

    // A change often triggers a request (dependent selects, autosave), so
    // register it for HTTP span attribution just like a click.
    const interaction = registerActiveInteraction(name);

    const extraAttributes: KeyValue[] = [];
    let title: string;

    if (element.tagName === "SELECT") {
      const selectedCount = (element as HTMLSelectElement).selectedOptions?.length ?? 0;
      addAttribute(extraAttributes, INTERACTION_SELECTED_COUNT, selectedCount);
      title = `Change ${label} to ${selectedCount} selected on ${pagePath()}`;
    } else if (element.tagName === "INPUT" && TOGGLE_INPUT_TYPES.has((element as HTMLInputElement).type)) {
      title = `Toggle ${label} on ${pagePath()}`;
    } else if (element.tagName === "INPUT" && (element as HTMLInputElement).type === "file") {
      title = `Change ${label} on ${pagePath()}`;
    } else if (element.tagName === "INPUT" && NO_LENGTH_INPUT_TYPES.has((element as HTMLInputElement).type)) {
      // password/hidden: even the length stays private
      title = `Change ${label} on ${pagePath()}`;
    } else {
      const valueLength = (element as HTMLInputElement | HTMLTextAreaElement).value?.length ?? 0;
      addAttribute(extraAttributes, INTERACTION_VALUE_LENGTH, valueLength);
      title = `Change ${label} to ${valueLength} characters on ${pagePath()}`;
    }

    emitInteractionEvent({
      type: "change",
      title,
      id: interaction.id,
      name,
      nameSource,
      element,
      extraAttributes,
    });
  } catch (err) {
    debug("Dash0 interaction instrumentation failed to process a change event.", err);
  }
}
