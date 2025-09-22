import { expect, vi, beforeEach, afterEach } from "vitest";
import { vars } from "../../vars";
import { instrumentFetch } from "./fetch";

describe("fetch test", () => {
  let fetchMock: any;

  beforeEach(() => {
    fetchMock = vi.fn(() => ({
      ok: false,
      headers: new Headers(),
      status: 200,
      clone: () => ({
        body: null,
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", { origin: "http://localhost:3000" });
  });

  afterEach(() => {
    vi.resetAllMocks();
    vars.propagators = undefined;
  });

  it("should inject traceparent header for cross-origin requests", async () => {
    vars.propagators = [
      {
        type: "traceparent",
        match: [new RegExp("http://foo.bar/")],
      },
    ];
    instrumentFetch();
    // eslint-disable-next-line no-restricted-globals
    await fetch("http://foo.bar/foo");

    expect(fetchMock).toHaveBeenCalledOnce();
    const fetchHeaders = (fetchMock.mock.calls[0]!.at(1)! as { headers: Headers }).headers;
    expect(fetchHeaders.get("traceparent")).not.toBeNull();
  });

  it("should inject xray header for cross-origin requests", async () => {
    vars.propagators = [
      {
        type: "xray",
        match: [new RegExp("http://foo.bar/")],
      },
    ];
    instrumentFetch();
    // eslint-disable-next-line no-restricted-globals
    await fetch("http://foo.bar/foo");

    expect(fetchMock).toHaveBeenCalledOnce();
    const fetchHeaders = (fetchMock.mock.calls[0]!.at(1)! as { headers: Headers }).headers;
    expect(fetchHeaders.get("X-Amzn-Trace-Id")).not.toBeNull();
  });

  it("should inject both headers for cross-origin requests when both match", async () => {
    vars.propagators = [
      {
        type: "traceparent",
        match: [new RegExp("http://foo.bar/")],
      },
      {
        type: "xray",
        match: [new RegExp("http://foo.bar/")],
      },
    ];
    instrumentFetch();
    // eslint-disable-next-line no-restricted-globals
    await fetch("http://foo.bar/foo");

    expect(fetchMock).toHaveBeenCalledOnce();
    const fetchHeaders = (fetchMock.mock.calls[0]!.at(1)! as { headers: Headers }).headers;
    expect(fetchHeaders.get("X-Amzn-Trace-Id")).not.toBeNull();
    expect(fetchHeaders.get("traceparent")).not.toBeNull();
  });

  it("should inject no headers for non-matching cross-origin requests", async () => {
    vars.propagators = [];
    instrumentFetch();
    // eslint-disable-next-line no-restricted-globals
    await fetch("http://foo.bar/foo");

    expect(fetchMock).toHaveBeenCalledOnce();
    const expectedHeaders = undefined;
    expect(fetchMock).toHaveBeenCalledWith("http://foo.bar/foo", expectedHeaders);
  });

  // New same-origin behavior tests
  it("should inject all configured propagator headers for same-origin requests", async () => {
    vars.propagators = [
      {
        type: "traceparent",
        match: [new RegExp("http://foo.bar/")], // Doesn't match same-origin
      },
      {
        type: "xray",
        match: [new RegExp("http://baz.com/")], // Doesn't match same-origin
      },
    ];
    instrumentFetch();
    // Same-origin request
    // eslint-disable-next-line no-restricted-globals
    await fetch("http://localhost:3000/api/test");

    expect(fetchMock).toHaveBeenCalledOnce();
    const fetchHeaders = (fetchMock.mock.calls[0]!.at(1)! as { headers: Headers }).headers;
    // Both headers should be present for same-origin, regardless of match patterns
    expect(fetchHeaders.get("traceparent")).not.toBeNull();
    expect(fetchHeaders.get("X-Amzn-Trace-Id")).not.toBeNull();
  });

  it("should inject only traceparent for same-origin when only traceparent propagator configured", async () => {
    vars.propagators = [
      {
        type: "traceparent",
        match: [new RegExp("http://foo.bar/")],
      },
    ];
    instrumentFetch();
    // Same-origin request
    // eslint-disable-next-line no-restricted-globals
    await fetch("http://localhost:3000/api/test");

    expect(fetchMock).toHaveBeenCalledOnce();
    const fetchHeaders = (fetchMock.mock.calls[0]!.at(1)! as { headers: Headers }).headers;
    expect(fetchHeaders.get("traceparent")).not.toBeNull();
    expect(fetchHeaders.get("X-Amzn-Trace-Id")).toBeNull();
  });

  it("should inject both traceparent and xray for same-origin when only xray propagator configured", async () => {
    vars.propagators = [
      {
        type: "xray",
        match: [new RegExp("http://foo.bar/")],
      },
    ];
    instrumentFetch();
    // Same-origin request
    // eslint-disable-next-line no-restricted-globals
    await fetch("http://localhost:3000/api/test");

    expect(fetchMock).toHaveBeenCalledOnce();
    const fetchHeaders = (fetchMock.mock.calls[0]!.at(1)! as { headers: Headers }).headers;
    // Same-origin always gets traceparent + all configured propagator types
    expect(fetchHeaders.get("traceparent")).not.toBeNull();
    expect(fetchHeaders.get("X-Amzn-Trace-Id")).not.toBeNull();
  });

  it("should inject traceparent for same-origin when no other propagators configured", async () => {
    vars.propagators = [];
    instrumentFetch();
    // Same-origin request
    // eslint-disable-next-line no-restricted-globals
    await fetch("http://localhost:3000/api/test");

    expect(fetchMock).toHaveBeenCalledOnce();
    const fetchHeaders = (fetchMock.mock.calls[0]!.at(1)! as { headers: Headers }).headers;
    // Same-origin always gets traceparent, even with no propagators configured
    expect(fetchHeaders.get("traceparent")).not.toBeNull();
    expect(fetchHeaders.get("X-Amzn-Trace-Id")).toBeNull();
  });

  it("should follow cross-origin pattern matching for non-same-origin requests", async () => {
    vars.propagators = [
      {
        type: "traceparent",
        match: [new RegExp("http://foo.bar/")],
      },
      {
        type: "xray",
        match: [new RegExp("http://baz.com/")],
      },
    ];
    instrumentFetch();
    // Cross-origin request that matches only traceparent pattern
    // eslint-disable-next-line no-restricted-globals
    await fetch("http://foo.bar/api");

    expect(fetchMock).toHaveBeenCalledOnce();
    const fetchHeaders = (fetchMock.mock.calls[0]!.at(1)! as { headers: Headers }).headers;
    expect(fetchHeaders.get("traceparent")).not.toBeNull();
    expect(fetchHeaders.get("X-Amzn-Trace-Id")).toBeNull();
  });
});
