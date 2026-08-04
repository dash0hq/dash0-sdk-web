import { generateUniqueId, nowNanos, win, WEB_EVENT_ID_BYTES } from "../../utils";
import { debug } from "../../utils/debug";
import { onLastChance } from "../../utils/on-last-chance";
import { setTimeout, clearTimeout } from "../../utils/timers";
import { addAttribute } from "../../utils/otel";
import { INTERACTION_KEY, INTERACTION_REPEAT_COUNT } from "../../semantic-conventions";
import { KeyValue } from "../../types/otlp";
import { ActionNameSource, resolveActionName } from "./action-name";
import { registerActiveInteraction } from "./active-interaction";
import { emitInteractionEvent } from "./emit";

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

/**
 * Only these keys register for HTTP span attribution: Enter and Space are the
 * keys that activate a control or submit a form, so a request that follows is
 * plausibly caused by them. Navigation keys (arrows, Tab, PageUp/Down, ...)
 * still emit an interaction event but must not claim the active-interaction
 * slot -- arrowing through a list would steal attribution from a real click
 * or stamp unrelated background requests.
 */
const ACTIVATION_KEYS = new Set(["Enter", " "]);

/**
 * Repeated presses of the SAME key on the SAME element collapse into one
 * telemetry event carrying a repeat count, finalized this long after the last
 * press. Ordinary prose typing produces a press per word boundary and per
 * correction, so without this the space bar and Backspace alone can dominate the
 * interaction budget: a twelve-word sentence becomes one event instead of
 * twelve.
 *
 * Pressing a *different* key, or the same key on a different element, finalizes
 * the pending burst immediately, so emission order still follows press order.
 *
 * Enter is deliberately exempt (see handleKeydown): it is low-frequency, and it
 * is the key most likely to have caused a request, so its event should not wait
 * on a settle timer.
 */
export const KEYPRESS_SETTLE_MILLIS = 300;

/** A run of presses of one key on one element, pending emission. */
type KeyPressBurst = {
  element: Element;
  /** Display form of the key, e.g. "Space" rather than " ". */
  key: string;
  /** Correlation id, shared by every span attributed during the burst. */
  id: string;
  name: string;
  nameSource: ActionNameSource;
  count: number;
  /** When the burst started, so a delayed emission is not timestamped late. */
  timeUnixNano: string;
  settleTimeout: ReturnType<typeof setTimeout> | null;
};

let listenerAttached = false;
let unloadHookRegistered = false;
let burst: KeyPressBurst | undefined;

function onWindowKeydown(event: KeyboardEvent) {
  if (!event.isTrusted) return;
  handleKeydown(event);
}

export function startKeyPressInstrumentation() {
  if (listenerAttached) return;
  if (!win) return;

  win.addEventListener("keydown", onWindowKeydown as EventListener, { capture: true });
  listenerAttached = true;

  // A coalesced burst is otherwise only emitted once its settle timer fires, so
  // pressing a key and immediately navigating away would drop it. See the long
  // form of this reasoning -- including why the log still reaches the wire
  // despite the transport registering its own onLastChance first -- in scroll.ts.
  if (!unloadHookRegistered) {
    unloadHookRegistered = true;
    onLastChance(flushBurst);
  }
}

export function stopKeyPressInstrumentationForTests() {
  // Before the guard below: an in-flight burst and its pending settle timer must
  // not leak into the next test case, even one that never attached a listener.
  if (burst?.settleTimeout != null) clearTimeout(burst.settleTimeout);
  burst = undefined;
  // unloadHookRegistered is deliberately NOT reset: onLastChance listeners
  // cannot be removed, so clearing the flag would only register a second set.
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
    const { name, nameSource } = resolveActionName(element);

    if (event.key === "Enter") {
      // Emitted straight away, so anything still pending has to go out first to
      // keep emission order aligned with press order.
      flushBurst();
      emitKeyPress({
        element,
        key,
        id: registerActiveInteraction(name).id,
        name,
        nameSource,
        count: 1,
        timeUnixNano: nowNanos(),
      });
      return;
    }

    // Enter/Space activate a control or submit a form, so they register for
    // HTTP span attribution just like a click; navigation keys only get an
    // event id of their own (see ACTIVATION_KEYS).
    const isActivation = ACTIVATION_KEYS.has(event.key);

    const extending = burst?.element === element && burst?.key === key ? burst : undefined;
    if (extending) {
      extending.count++;
      // Re-registering on the burst's own id keeps the attribution window alive
      // across the burst without minting ids no log record will ever carry.
      if (isActivation) registerActiveInteraction(name, extending.id);
    } else {
      flushBurst(); // a different key or target ends the previous burst
      burst = {
        element,
        key,
        id: isActivation ? registerActiveInteraction(name).id : generateUniqueId(WEB_EVENT_ID_BYTES),
        name,
        nameSource,
        count: 1,
        timeUnixNano: nowNanos(),
        settleTimeout: null,
      };
    }

    // Either branch above leaves `burst` as the pending one.
    const pending = burst!;
    if (pending.settleTimeout != null) clearTimeout(pending.settleTimeout);
    pending.settleTimeout = setTimeout(() => finalizeBurst(), KEYPRESS_SETTLE_MILLIS);
  } catch (err) {
    debug("Dash0 interaction instrumentation failed to process a keydown event.", err);
  }
}

function finalizeBurst(): void {
  const finished = burst;
  burst = undefined;
  if (!finished) return;

  try {
    emitKeyPress(finished);
  } catch (err) {
    debug("Dash0 interaction instrumentation failed to finalize a key press burst.", err);
  }
}

/** Finalizes the pending burst now, without waiting for the settle timer. */
function flushBurst(): void {
  if (burst?.settleTimeout != null) clearTimeout(burst.settleTimeout);
  finalizeBurst();
}

/** Test-only: force-finalize the pending burst without waiting for the settle timer. */
export function flushKeyPressBurstForTests(): void {
  flushBurst();
}

function emitKeyPress(press: Omit<KeyPressBurst, "settleTimeout">): void {
  const extraAttributes: KeyValue[] = [];
  addAttribute(extraAttributes, INTERACTION_KEY, press.key);
  if (press.count > 1) {
    addAttribute(extraAttributes, INTERACTION_REPEAT_COUNT, press.count);
  }

  const repetition = press.count > 1 ? ` ${press.count} times` : "";

  emitInteractionEvent({
    type: "key_press",
    // Press Enter in "Search parts"        (emit appends ` on <scrubbed page path>`)
    // Press Backspace 7 times in "Notes"   (a coalesced burst)
    // Press Escape                         (no derivable target name)
    title: press.name ? `Press ${press.key}${repetition} in "${press.name}"` : `Press ${press.key}${repetition}`,
    id: press.id,
    name: press.name,
    nameSource: press.nameSource,
    element: press.element,
    extraAttributes,
    timeUnixNano: press.timeUnixNano,
  });
}
