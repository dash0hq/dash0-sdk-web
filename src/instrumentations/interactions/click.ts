import { win } from "../../utils";
import { debug } from "../../utils/debug";
import { resolveActionName } from "./action-name";
import { registerActiveInteraction } from "./active-interaction";
import { emitInteractionEvent } from "./emit";

/**
 * How long a label-forward marker stays valid. The window only has to span one
 * dispatch task: a label's activation behavior fires the forwarded click
 * synchronously while the label's own click is still being dispatched, so a
 * genuine second click is always a later task.
 */
const LABEL_FORWARD_WINDOW_MILLIS = 50;

let listenerAttached = false;

/**
 * The control a `<label>` activation is about to forward a click to, set by the
 * label's own click and consumed by the very next one. Holds a DOM reference
 * only for that gap, and only for clicks that landed inside a label with a
 * control -- every other click clears it.
 */
let pendingLabelForward: { control: Element; epochMillis: number } | undefined;

function onWindowClick(event: Event) {
  if (!event.isTrusted) return;
  handleClick(event);
}

/**
 * Consumes the one-shot marker left by the preceding click. True when `element`
 * is the control that label activation forwarded to, i.e. this event is the
 * browser's duplicate of a gesture already reported.
 */
function consumePendingLabelForward(element: Element): boolean {
  const pending = pendingLabelForward;
  pendingLabelForward = undefined; // one-shot: never outlives the next click
  return (
    pending !== undefined &&
    pending.control === element &&
    Date.now() - pending.epochMillis <= LABEL_FORWARD_WINDOW_MILLIS
  );
}

/**
 * Records that this click is about to be duplicated, if it landed inside a
 * `<label>` that has a labeled control.
 *
 * `closest` rather than a parent walk: the click target is routinely a
 * `<span>`/`<svg>` inside the label, and activation forwards regardless of
 * depth. `label.control` rather than a containment check: with
 * `<label for="x">` the control is not a descendant of the label at all.
 */
function rememberLabelForward(element: Element): void {
  const label = element.closest("label") as HTMLLabelElement | null;
  const control = label?.control;
  // A click that already landed on the control is not forwarded again -- a
  // label's activation behavior does nothing for events targeted at its
  // interactive content descendants -- so there is nothing to suppress.
  if (control && control !== element) {
    pendingLabelForward = { control, epochMillis: Date.now() };
  }
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
  // Before the guard below: module state has to be reset even for test cases
  // that never attached the real listener.
  pendingLabelForward = undefined;
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
 *
 * Not every click handed in produces an event: clicking a `<label>` makes the
 * browser forward a second, also trusted, click to the labeled control, and
 * that duplicate is dropped so one gesture yields one interaction. The click
 * the user actually made is the one that survives, which also keeps the
 * registered active interaction and the emitted log carrying the same id.
 */
export function handleClick(event: Event): void {
  try {
    const target = event.target;
    if (!target || (target as Node).nodeType !== 1) {
      return;
    }

    const element = target as Element;
    if (consumePendingLabelForward(element)) return;
    rememberLabelForward(element);

    const { name, nameSource } = resolveActionName(element);
    const tag = element.tagName.toLowerCase();

    // Register this click as the active interaction BEFORE the application's
    // own handlers run (we are in the capture phase), so any HTTP request the
    // click triggers gets stamped with this interaction's id/name.
    const interaction = registerActiveInteraction(name);

    emitInteractionEvent({
      type: "click",
      // Click "Save Part"   (emit appends ` on <scrubbed page path>`)
      // Click button        (no derivable name)
      title: name ? `Click "${name}"` : `Click ${tag}`,
      id: interaction.id,
      name,
      nameSource,
      element,
    });
  } catch (err) {
    debug("Dash0 interaction instrumentation failed to process a click event.", err);
  }
}
