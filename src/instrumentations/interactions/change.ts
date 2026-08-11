import { nowNanos, win } from "../../utils";
import { debug } from "../../utils/debug";
import { onLastChance } from "../../utils/on-last-chance";
import { setTimeout, clearTimeout } from "../../utils/timers";
import { addAttribute } from "../../utils/otel";
import { INTERACTION_SELECTED_COUNT, INTERACTION_VALUE_LENGTH } from "../../semantic-conventions";
import { KeyValue } from "../../types/otlp";
import { ActionNameSource, resolveActionName } from "./action-name";
import { registerActiveInteraction } from "./active-interaction";
import { emitInteractionEvent } from "./emit";

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
 * Field names come from resolveActionName, which for form controls uses naming
 * attributes (aria-label, placeholder, the custom attribute) or the enclosing
 * label's text with the control's own text excluded -- never user-entered
 * content.
 */
const CHANGE_TAGS = new Set(["INPUT", "SELECT", "TEXTAREA"]);
const NO_LENGTH_INPUT_TYPES = new Set(["password", "hidden"]);
const TOGGLE_INPUT_TYPES = new Set(["checkbox", "radio"]);

/**
 * Successive changes to the SAME control collapse into one telemetry event
 * describing its latest state, emitted this long after the last change.
 * Drag-driven controls (`input[type=range]` in browsers that fire `change`
 * during the drag) and dependent-select cascades are otherwise the chattiest
 * producers in this instrumentation.
 *
 * A change to a *different* control finalizes the pending one immediately, so
 * emission order still follows the order the fields were edited in.
 */
export const CHANGE_SETTLE_MILLIS = 300;

/** A run of changes to one control, pending emission. */
type PendingChange = {
  element: Element;
  /** Correlation id, shared by every span attributed during the run. */
  id: string;
  name: string;
  nameSource: ActionNameSource;
  title: string;
  extraAttributes: KeyValue[];
  /** When the run started, so a delayed emission is not timestamped late. */
  timeUnixNano: string;
  settleTimeout: ReturnType<typeof setTimeout> | null;
};

let listenerAttached = false;
let unloadHookRegistered = false;
let pending: PendingChange | undefined;

function onWindowChange(event: Event) {
  if (!event.isTrusted) return;
  handleChange(event);
}

export function startChangeInstrumentation() {
  if (listenerAttached) return;
  if (!win) return;

  win.addEventListener("change", onWindowChange, { capture: true });
  listenerAttached = true;

  // A coalesced change is otherwise only emitted once its settle timer fires, so
  // committing a field and immediately navigating away would drop it -- and a
  // change followed straight by a navigation (submit, dependent route change) is
  // one of the more interesting ones. See the long form of this reasoning --
  // including why the log still reaches the wire despite the transport
  // registering its own onLastChance first -- in scroll.ts.
  if (!unloadHookRegistered) {
    unloadHookRegistered = true;
    onLastChance(flushPending);
  }
}

export function stopChangeInstrumentationForTests() {
  // Before the guard below: a pending change and its settle timer must not leak
  // into the next test case, even one that never attached a listener.
  if (pending?.settleTimeout != null) clearTimeout(pending.settleTimeout);
  pending = undefined;
  // unloadHookRegistered is deliberately NOT reset: onLastChance listeners
  // cannot be removed, so clearing the flag would only register a second set.
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

    const { name, nameSource } = resolveActionName(element);
    const tag = element.tagName.toLowerCase();
    const label = name ? `"${name}"` : tag;

    // A change often triggers a request (dependent selects, autosave), so
    // register it for HTTP span attribution just like a click. Re-registering on
    // the pending run's own id keeps the attribution window alive across a run of
    // changes without minting ids no log record will ever carry.
    const extendingRun = pending?.element === element ? pending : undefined;
    const interaction = registerActiveInteraction(name, extendingRun?.id);

    const extraAttributes: KeyValue[] = [];
    // Titles carry no page path -- emit appends the scrubbed one.
    let title: string;

    if (element.tagName === "SELECT") {
      const selectedCount = (element as HTMLSelectElement).selectedOptions?.length ?? 0;
      addAttribute(extraAttributes, INTERACTION_SELECTED_COUNT, selectedCount);
      title = `Change ${label} to ${selectedCount} selected`;
    } else if (element.tagName === "INPUT" && TOGGLE_INPUT_TYPES.has((element as HTMLInputElement).type)) {
      title = `Toggle ${label}`;
    } else if (element.tagName === "INPUT" && (element as HTMLInputElement).type === "file") {
      title = `Change ${label}`;
    } else if (element.tagName === "INPUT" && NO_LENGTH_INPUT_TYPES.has((element as HTMLInputElement).type)) {
      // password/hidden: even the length stays private
      title = `Change ${label}`;
    } else {
      const valueLength = (element as HTMLInputElement | HTMLTextAreaElement).value?.length ?? 0;
      addAttribute(extraAttributes, INTERACTION_VALUE_LENGTH, valueLength);
      title = `Change ${label} to ${valueLength} characters`;
    }

    // Everything above is derived HERE, at event time, and only the derived
    // values are held for emission: re-reading value/selectedOptions once the
    // settle timer fires would report a field that has since been reset or
    // detached (modal closed, route change) -- the same trap scroll.ts documents
    // for its position reads.
    if (extendingRun) {
      extendingRun.name = name;
      extendingRun.nameSource = nameSource;
      extendingRun.title = title;
      extendingRun.extraAttributes = extraAttributes;
    } else {
      flushPending(); // a change to a different control ends the previous run
      pending = {
        element,
        id: interaction.id,
        name,
        nameSource,
        title,
        extraAttributes,
        timeUnixNano: nowNanos(),
        settleTimeout: null,
      };
    }

    // Either branch above leaves `pending` as the pending run.
    const run = pending!;
    if (run.settleTimeout != null) clearTimeout(run.settleTimeout);
    run.settleTimeout = setTimeout(() => finalizePending(), CHANGE_SETTLE_MILLIS);
  } catch (err) {
    debug("Dash0 interaction instrumentation failed to process a change event.", err);
  }
}

function finalizePending(): void {
  const finished = pending;
  pending = undefined;
  if (!finished) return;

  try {
    emitInteractionEvent({
      type: "change",
      title: finished.title,
      id: finished.id,
      name: finished.name,
      nameSource: finished.nameSource,
      element: finished.element,
      extraAttributes: finished.extraAttributes,
      timeUnixNano: finished.timeUnixNano,
    });
  } catch (err) {
    debug("Dash0 interaction instrumentation failed to finalize a change event.", err);
  }
}

/** Emits the pending change now, without waiting for the settle timer. */
function flushPending(): void {
  if (pending?.settleTimeout != null) clearTimeout(pending.settleTimeout);
  finalizePending();
}

/** Test-only: force-emit the pending change without waiting for the settle timer. */
export function flushPendingChangeForTests(): void {
  flushPending();
}
