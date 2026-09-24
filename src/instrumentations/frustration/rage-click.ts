import { EVENT_NAME, EVENT_NAMES, LOG_SEVERITIES, SESSION_RECORDING_ID } from "../../semantic-conventions";
import { KeyValue, LogRecord } from "../../types/otlp";
import { addCommonAttributes } from "../../attributes";
import { sendLog } from "../../transport";
import { addAttribute } from "../../utils/otel";
import { createRateLimiter, debug, doc, now, toNanosTs, win } from "../../utils";
import { addEventListener, removeEventListener } from "../../utils/listeners";
import { clearTimeout, setTimeout } from "../../utils/timers";
import { onLastChance } from "../../utils/on-last-chance";
import { onRecordingStateChange } from "../session-recording";
import { vars } from "../../vars";
import { buildCssSelector, extractText } from "./element";

/**
 * A run of clicks the user made in the same place in quick succession. Held open until
 * `windowMillis` pass without another click, so the reported count is the whole burst rather
 * than the first few clicks of it.
 */
type Cluster = {
  target: Element;
  /** Viewport coordinates of the first click, the centre of the radius check. */
  x: number;
  y: number;
  count: number;
  firstMillis: number;
  lastMillis: number;
};

let cluster: Cluster | undefined;
let closeTimer: ReturnType<typeof setTimeout> | undefined;
let isExcessiveUsage: () => boolean;
let started = false;
/** The recording clicks are currently being observed for. Undefined means not observing. */
let recordingId: string | undefined;

/**
 * Arms rage click detection. Clicks are only observed while a session recording is running: a rage
 * click is a claim about what the user experienced, and it is only worth making when the replay
 * that substantiates it exists. Detection therefore starts and stops with the recording, which
 * itself follows document visibility.
 */
export function startRageClickInstrumentation(): void {
  if (started || !win || !doc) return;
  started = true;

  // A page that manages to produce this many rage clicks is either a test harness or a click
  // storm no dashboard benefits from. The limiter keeps a pathological page from filling the
  // session with duplicates.
  isExcessiveUsage = createRateLimiter({ maxCallsPerTenMinutes: 32, maxCallsPerTenSeconds: 4 });

  // A burst that ends in a navigation would otherwise never reach its close timer.
  onLastChance(closeCluster);

  onRecordingStateChange(onRecordingState);
}

function onRecordingState(id: string | undefined): void {
  if (id) {
    recordingId = id;
    observe();
    return;
  }

  // Report what the user did before the recording ended while its id is still known — those clicks
  // happened on record, and the replay covers them.
  closeCluster();
  stopObserving();
  recordingId = undefined;
}

function observe(): void {
  if (!doc) return;
  // Capture phase: a click whose propagation an application handler stops is still a click the
  // user made, and is exactly the kind of click a frustrated user repeats.
  addEventListener(doc, "click", onClick, true);
}

function stopObserving(): void {
  if (!doc) return;
  removeEventListener(doc, "click", onClick, true);
}

function onClick(event: Event): void {
  try {
    // Detaching the listener is the primary gate; this covers an event delivered while the
    // recording was being torn down, which would otherwise join a cluster no replay covers.
    if (!recordingId) return;

    const mouseEvent = event as MouseEvent;

    // Synthetic clicks (`element.click()`, test drivers, consent managers) say nothing about how
    // the user feels, and secondary buttons are not how frustration is expressed.
    if (!mouseEvent.isTrusted || (mouseEvent.button ?? 0) !== 0) return;

    const target = clickTarget(mouseEvent);
    if (!target) return;

    const settings = rageClickSettings();
    const timestamp = now();

    if (
      cluster &&
      timestamp - cluster.lastMillis <= settings.windowMillis &&
      isSameSpot(cluster, target, mouseEvent, settings.radiusPixels)
    ) {
      cluster.count++;
      cluster.lastMillis = timestamp;
    } else {
      closeCluster();
      cluster = {
        target,
        x: mouseEvent.clientX,
        y: mouseEvent.clientY,
        count: 1,
        firstMillis: timestamp,
        lastMillis: timestamp,
      };
    }

    if (closeTimer != null) clearTimeout(closeTimer);
    closeTimer = setTimeout(closeCluster, settings.windowMillis);
  } catch (e) {
    debug("Failed to evaluate click for rage click detection", e);
  }
}

/**
 * The deepest element the user actually clicked. `composedPath()` sees through shadow roots,
 * where `event.target` only reports the host element.
 */
function clickTarget(event: MouseEvent): Element | undefined {
  const path = event.composedPath?.();
  const candidate = (path && path.length > 0 ? path[0] : event.target) as Node | null;

  if (!candidate) return undefined;
  if (candidate.nodeType === 3 /* text node */) {
    return (candidate.parentElement as Element | null) ?? undefined;
  }
  return candidate.nodeType === 1 ? (candidate as Element) : undefined;
}

/**
 * Whether this click belongs to the open cluster. Element identity comes first: repeated clicks
 * on one button are the canonical rage click, and they stay one cluster even when the button
 * moves under the cursor. Proximity covers the rest — clicking a dead area, or a control whose
 * DOM node is replaced between clicks by a re-render.
 */
function isSameSpot(open: Cluster, target: Element, event: MouseEvent, radiusPixels: number): boolean {
  if (open.target === target) return true;
  if (open.target.contains?.(target) || target.contains?.(open.target)) return true;

  const dx = event.clientX - open.x;
  const dy = event.clientY - open.y;
  return dx * dx + dy * dy <= radiusPixels * radiusPixels;
}

/**
 * Ends the open cluster and reports it when it qualifies.
 */
function closeCluster(): void {
  if (closeTimer != null) {
    clearTimeout(closeTimer);
    closeTimer = undefined;
  }

  const closed = cluster;
  cluster = undefined;
  if (!closed) return;

  if (closed.count < rageClickSettings().minClicks) return;

  if (isExcessiveUsage()) {
    debug("Suppressing rage click event due to excessive usage");
    return;
  }

  try {
    sendRageClick(closed);
  } catch (e) {
    debug("Failed to report rage click", e);
  }
}

function sendRageClick(closed: Cluster): void {
  const attributes: KeyValue[] = [];
  addAttribute(attributes, EVENT_NAME, EVENT_NAMES.RAGE_CLICK);
  addCommonAttributes(attributes);

  // Lets the backend deep-link from the event straight into the replay at this timestamp. Always
  // present: clicks are only observed while a recording is running.
  if (recordingId) {
    addAttribute(attributes, SESSION_RECORDING_ID, recordingId);
  }

  const body: KeyValue[] = [];
  addAttribute(body, "click_count", closed.count);
  addAttribute(body, "duration_millis", closed.lastMillis - closed.firstMillis);
  addAttribute(body, "selector", buildCssSelector(closed.target));
  addAttribute(body, "x", closed.x);
  addAttribute(body, "y", closed.y);

  const text = extractText(closed.target);
  if (text) {
    addAttribute(body, "text", text);
  }

  const log: LogRecord = {
    // The burst starts where the frustration starts. Dating the event at its first click also
    // lines it up with the replay.
    timeUnixNano: toNanosTs(closed.firstMillis),
    attributes,
    severityNumber: LOG_SEVERITIES.WARN,
    severityText: "WARN",
    body: {
      kvlistValue: {
        values: body,
      },
    },
  };

  sendLog(log);
}

function rageClickSettings() {
  const configured = vars.frustrationSignals?.rageClick ?? {};
  return {
    minClicks: configured.minClicks ?? 3,
    windowMillis: configured.windowMillis ?? 1000,
    radiusPixels: configured.radiusPixels ?? 30,
  };
}

/**
 * Test seam: drops all detector state so each test starts from a clean instrumentation.
 */
export function resetRageClickInstrumentation(): void {
  if (closeTimer != null) clearTimeout(closeTimer);
  closeTimer = undefined;
  cluster = undefined;
  recordingId = undefined;
  started = false;
  stopObserving();
}
