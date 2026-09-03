/**
 * The subset of rrweb's `record()` option surface the SDK forwards. Declared structurally so the
 * public API of `@dash0/sdk-web` does not depend on `@rrweb/types`; rrweb's `record` satisfies it.
 */
export type SessionRecorderOptions = {
  /**
   * Called by the recorder for every rrweb event. `isCheckout` is true for the events that
   * start a new full snapshot (see `checkoutEveryNms`).
   */
  emit: (event: SessionRecordingEvent, isCheckout?: boolean) => void;
  checkoutEveryNms?: number;
  maskAllInputs?: boolean;
  maskTextClass?: string | RegExp;
  maskTextSelector?: string;
  maskInputFn?: (text: string, element: HTMLElement | null) => string;
  maskTextFn?: (text: string, element: HTMLElement | null) => string;
  blockClass?: string | RegExp;
  blockSelector?: string;
  ignoreClass?: string;
  recordCanvas?: boolean;
  collectFonts?: boolean;
  inlineStylesheet?: boolean;
};

/**
 * A function that starts recording and returns a function that stops it.
 * `record` from `@rrweb/record` (re-exported by `@dash0/sdk-web/session-recording`) has this shape.
 */
export type SessionRecorder = (options: SessionRecorderOptions) => (() => void) | undefined;

/**
 * The shape of an rrweb event the SDK relies on. rrweb events carry more data, which the SDK
 * forwards untouched inside the chunk body.
 */
export type SessionRecordingEvent = {
  /**
   * rrweb EventType. 2 is FullSnapshot, 4 is Meta.
   */
  type: number;
  /**
   * Milliseconds since the unix epoch.
   */
  timestamp: number;
  data?: unknown;
};

export type SessionRecordingSettings = {
  /**
   * The percentage of sessions for which a recording is captured. Must be a number between 0 and 100.
   * The decision is deterministic per session ID and uses the same hash as `sessionSamplingRate`, so
   * recorded sessions are always a subset of the sessions for which telemetry is transmitted.
   *
   * @default 100
   */
  samplingRate?: number;

  /**
   * Replace the value of every input, textarea and select with asterisks before it leaves the browser.
   * Set to `false` only when you know no form on the page accepts sensitive data.
   *
   * @default true
   */
  maskAllInputs?: boolean;

  /**
   * CSS selector for elements whose text content must be masked. Use `"*"` to mask all text on the page.
   */
  maskTextSelector?: string;

  /**
   * Elements with this class have their text content masked.
   *
   * @default "dash0-mask"
   */
  maskTextClass?: string | RegExp;

  /**
   * Elements with this class are not recorded at all. A placeholder with the same dimensions
   * is shown in the replay instead.
   *
   * @default "dash0-block"
   */
  blockClass?: string | RegExp;

  /**
   * CSS selector for elements that are not recorded at all.
   */
  blockSelector?: string;

  /**
   * Custom function to mask input values. Receives the raw value and the element, and must return the masked value.
   */
  maskInputFn?: (text: string, element: HTMLElement | null) => string;

  /**
   * Custom function to mask text nodes. Receives the raw text and the parent element, and must return the masked text.
   */
  maskTextFn?: (text: string, element: HTMLElement | null) => string;

  /**
   * Record the content of canvas elements. This is expensive and off by default.
   *
   * @default false
   */
  recordCanvas?: boolean;

  /**
   * Collect fonts so the replay renders with the same typefaces. Adds payload size.
   *
   * @default false
   */
  collectFonts?: boolean;

  /**
   * The maximum serialized size of one chunk in bytes. When the buffered events reach this size, a chunk is
   * transmitted. A single rrweb event larger than this (typically a full snapshot) is transmitted on its own.
   *
   * @default 48000
   */
  chunkMaxBytes?: number;

  /**
   * The maximum time buffered events wait before they are transmitted as a chunk.
   *
   * @default 5000
   */
  chunkMaxMillis?: number;

  /**
   * How often the recorder takes a new full snapshot of the DOM, in milliseconds. A replay can start
   * from any chunk that contains a full snapshot.
   *
   * @default 300000
   */
  checkoutEveryNms?: number;

  /**
   * The recorder to use. Pass `recorder` from `@dash0/sdk-web/session-recording`. When omitted, the SDK waits for
   * a recorder to be registered through `startSessionRecording(recorder)` or through the
   * `dash0-session-recording.iife.js` script.
   */
  recorder?: SessionRecorder;
};
