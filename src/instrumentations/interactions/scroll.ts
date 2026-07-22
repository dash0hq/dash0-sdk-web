import { doc, generateUniqueId, win, WEB_EVENT_ID_BYTES } from "../../utils";
import { debug } from "../../utils/debug";
import { setTimeout, clearTimeout } from "../../utils/timers";
import { addAttribute } from "../../utils/otel";
import { INTERACTION_DIRECTION } from "../../semantic-conventions";
import { KeyValue } from "../../types/otlp";
import { emitInteractionEvent, pagePath } from "./emit";

/**
 * Scroll events fire per frame, so emitting one telemetry event per DOM event
 * would be pure noise. Instead a contiguous burst of scrolling is collapsed
 * into ONE `browser.interaction` (type "scroll"): the burst starts on the
 * first scroll event, and finalizes after SCROLL_SETTLE_MILLIS without
 * further scrolling. The emitted direction is derived from the net position
 * delta over the whole burst.
 */
const SCROLL_SETTLE_MILLIS = 300;

/**
 * Net movement (px) below which a burst is dropped entirely -- sub-pixel and
 * micro-scrolls (trackpad jitter, momentum tails) are not meaningful user
 * interactions.
 */
const MIN_SCROLL_DELTA_PX = 8;

type ScrollBurst = {
  element: Element;
  startX: number;
  startY: number;
  settleTimeout: ReturnType<typeof setTimeout> | null;
};

let listenerAttached = false;
let burst: ScrollBurst | undefined;

function onWindowScroll(event: Event) {
  if (!event.isTrusted) return;
  handleScroll(event);
}

export function startScrollInstrumentation() {
  if (listenerAttached) return;
  if (!win) return;

  // Capture phase on window sees both document scrolling and scrolling of
  // nested overflow containers (scroll does not bubble, but capture works).
  win.addEventListener("scroll", onWindowScroll, { capture: true, passive: true } as AddEventListenerOptions);
  listenerAttached = true;
}

export function stopScrollInstrumentationForTests() {
  if (!listenerAttached || !win) return;
  win.removeEventListener("scroll", onWindowScroll, { capture: true } as EventListenerOptions);
  if (burst?.settleTimeout != null) clearTimeout(burst.settleTimeout);
  burst = undefined;
  listenerAttached = false;
}

/** Resolves the scrolled element plus its current scroll position. */
function scrollStateFor(event: Event): { element: Element; x: number; y: number } | undefined {
  const target = event.target;

  // Scrolling the page itself reports the document (or window) as target.
  if (!target || target === doc || target === win) {
    const root = doc?.scrollingElement ?? doc?.documentElement;
    if (!root) return undefined;
    return { element: root, x: win?.scrollX ?? root.scrollLeft, y: win?.scrollY ?? root.scrollTop };
  }

  if ((target as Node).nodeType !== 1) return undefined;
  const element = target as Element;
  return { element, x: element.scrollLeft, y: element.scrollTop };
}

/**
 * Exported for tests (bypasses the isTrusted gate, same pattern as
 * click.ts/handleClick).
 */
export function handleScroll(event: Event): void {
  try {
    const state = scrollStateFor(event);
    if (!state) return;

    if (!burst) {
      burst = {
        element: state.element,
        startX: state.x,
        startY: state.y,
        settleTimeout: null,
      };
    } else if (burst.settleTimeout != null) {
      clearTimeout(burst.settleTimeout);
    }

    // The burst tracks the element it started on; scrolls of other elements
    // during the settle window just keep the burst alive.
    burst.settleTimeout = setTimeout(() => finalizeBurst(), SCROLL_SETTLE_MILLIS);
  } catch (err) {
    debug("Dash0 interaction instrumentation failed to process a scroll event.", err);
  }
}

function finalizeBurst(): void {
  const finished = burst;
  burst = undefined;
  if (!finished) return;

  try {
    const element = finished.element;
    const endX =
      element === (doc?.scrollingElement ?? doc?.documentElement)
        ? (win?.scrollX ?? element.scrollLeft)
        : element.scrollLeft;
    const endY =
      element === (doc?.scrollingElement ?? doc?.documentElement)
        ? (win?.scrollY ?? element.scrollTop)
        : element.scrollTop;

    const deltaX = endX - finished.startX;
    const deltaY = endY - finished.startY;

    if (Math.abs(deltaX) < MIN_SCROLL_DELTA_PX && Math.abs(deltaY) < MIN_SCROLL_DELTA_PX) {
      return; // micro-scroll, not a meaningful interaction
    }

    const direction =
      Math.abs(deltaY) >= Math.abs(deltaX) ? (deltaY > 0 ? "down" : "up") : deltaX > 0 ? "right" : "left";

    const extraAttributes: KeyValue[] = [];
    addAttribute(extraAttributes, INTERACTION_DIRECTION, direction);

    emitInteractionEvent({
      type: "scroll",
      // Scroll down on /inventory/parts
      title: `Scroll ${direction} on ${pagePath()}`,
      id: generateUniqueId(WEB_EVENT_ID_BYTES),
      name: "",
      nameSource: "blank",
      element,
      extraAttributes,
    });
  } catch (err) {
    debug("Dash0 interaction instrumentation failed to finalize a scroll burst.", err);
  }
}

/** Test-only: force-finalize the in-flight burst without waiting for the settle timer. */
export function flushScrollBurstForTests(): void {
  if (burst?.settleTimeout != null) clearTimeout(burst.settleTimeout);
  finalizeBurst();
}
