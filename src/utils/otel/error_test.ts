import { expect, describe, it } from "vitest";
import { recordException, Exception } from "./error";
import { InProgressSpan } from "./span";
import { toKeyValue } from "./attributes";
import {
  EXCEPTION_MESSAGE,
  EXCEPTION_STACKTRACE,
  EXCEPTION_TYPE,
  SPAN_EVENT_NAME_EXCEPTION,
} from "../../semantic-conventions";

function newSpan(): InProgressSpan {
  return { events: [] } as unknown as InProgressSpan;
}

describe("recordException", () => {
  it("records an exception event for a string exception", () => {
    const span = newSpan();
    recordException(span, "boom");

    expect(span.events).toHaveLength(1);
    expect(span.events[0]!.name).toBe(SPAN_EVENT_NAME_EXCEPTION);
    expect(span.events[0]!.attributes).toEqual([toKeyValue(EXCEPTION_MESSAGE, "boom")]);
  });

  it("records an exception event for an error object", () => {
    const span = newSpan();
    const error = new TypeError("Failed to fetch");
    recordException(span, error);

    expect(span.events).toHaveLength(1);
    expect(span.events[0]!.attributes).toEqual([
      toKeyValue(EXCEPTION_TYPE, "TypeError"),
      toKeyValue(EXCEPTION_MESSAGE, "Failed to fetch"),
      toKeyValue(EXCEPTION_STACKTRACE, error.stack!),
    ]);
  });

  it("records no event for a missing exception", () => {
    const span = newSpan();
    recordException(span, null as unknown as Exception);

    expect(span.events).toHaveLength(0);
  });

  it("records no event for an object without exception fields", () => {
    const span = newSpan();
    recordException(span, {} as Exception);

    expect(span.events).toHaveLength(0);
  });
});
