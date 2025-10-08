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

  it("should inject traceparent for same-origin when default traceparent propagator configured", async () => {
    vars.propagators = [
      {
        type: "traceparent",
        match: [], // Empty match array - matches no cross-origin URLs but same-origin gets all propagators
      },
    ];
    instrumentFetch();
    // Same-origin request
    // eslint-disable-next-line no-restricted-globals
    await fetch("http://localhost:3000/api/test");

    expect(fetchMock).toHaveBeenCalledOnce();
    const fetchHeaders = (fetchMock.mock.calls[0]!.at(1)! as { headers: Headers }).headers;
    // Same-origin gets all configured propagator types
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

  // Large response handling tests
  it("should skip body reading when maxResponseBodySize is 0", async () => {
    const originalMaxSize = vars.maxResponseBodySize;
    vars.maxResponseBodySize = 0;

    const mockHeaders = new Headers();
    mockHeaders.set("content-length", "1000");
    mockHeaders.set("content-type", "application/json");

    fetchMock = vi.fn(() => ({
      ok: true,
      headers: mockHeaders,
      status: 200,
      clone: vi.fn(() => ({
        body: {
          getReader: () => ({
            read: vi.fn(),
          }),
        },
      })),
    }));
    vi.stubGlobal("fetch", fetchMock);

    instrumentFetch();
    // eslint-disable-next-line no-restricted-globals
    const response = await fetch("http://localhost:3000/api/test");

    // Body should not be read (clone should not be called or getReader not called)
    expect(response.clone).not.toHaveBeenCalled();

    vars.maxResponseBodySize = originalMaxSize;
  });

  it("should skip body reading for large responses based on Content-Length", async () => {
    const originalMaxSize = vars.maxResponseBodySize;
    vars.maxResponseBodySize = 1000; // 1KB limit

    const mockHeaders = new Headers();
    mockHeaders.set("content-length", "2000"); // 2KB response
    mockHeaders.set("content-type", "application/json");

    fetchMock = vi.fn(() => ({
      ok: true,
      headers: mockHeaders,
      status: 200,
      clone: () => ({
        body: null,
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    instrumentFetch();
    // eslint-disable-next-line no-restricted-globals
    const response = await fetch("http://localhost:3000/api/test");

    // Should complete without errors
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();

    vars.maxResponseBodySize = originalMaxSize;
  });

  it("should skip body reading for streaming responses without Content-Length", async () => {
    const mockHeaders = new Headers();
    // No Content-Length header
    mockHeaders.set("content-type", "application/json");

    fetchMock = vi.fn(() => ({
      ok: true,
      headers: mockHeaders,
      status: 200,
      clone: () => ({
        body: null,
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    instrumentFetch();
    // eslint-disable-next-line no-restricted-globals
    const response = await fetch("http://localhost:3000/api/test");

    // Should complete without errors despite missing Content-Length
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("should skip body reading for video content type", async () => {
    const mockHeaders = new Headers();
    mockHeaders.set("content-length", "1000");
    mockHeaders.set("content-type", "video/mp4");

    fetchMock = vi.fn(() => ({
      ok: true,
      headers: mockHeaders,
      status: 200,
      clone: () => ({
        body: null,
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    instrumentFetch();
    // eslint-disable-next-line no-restricted-globals
    const response = await fetch("http://localhost:3000/api/video.mp4");

    // Should complete without errors for video content type
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("should skip body reading for audio content type", async () => {
    const mockHeaders = new Headers();
    mockHeaders.set("content-length", "1000");
    mockHeaders.set("content-type", "audio/mpeg");

    fetchMock = vi.fn(() => ({
      ok: true,
      headers: mockHeaders,
      status: 200,
      clone: () => ({
        body: null,
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    instrumentFetch();
    // eslint-disable-next-line no-restricted-globals
    const response = await fetch("http://localhost:3000/api/audio.mp3");

    // Should complete without errors for audio content type
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("should skip body reading for binary octet-stream content type", async () => {
    const mockHeaders = new Headers();
    mockHeaders.set("content-length", "1000");
    mockHeaders.set("content-type", "application/octet-stream");

    fetchMock = vi.fn(() => ({
      ok: true,
      headers: mockHeaders,
      status: 200,
      clone: () => ({
        body: null,
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    instrumentFetch();
    // eslint-disable-next-line no-restricted-globals
    const response = await fetch("http://localhost:3000/api/file.bin");

    // Should complete without errors for binary content type
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("should skip body reading for YouTube video content type", async () => {
    const mockHeaders = new Headers();
    mockHeaders.set("content-length", "5000000"); // 5MB
    mockHeaders.set("content-type", "application/vnd.yt-ump");

    fetchMock = vi.fn(() => ({
      ok: true,
      headers: mockHeaders,
      status: 200,
      clone: () => ({
        body: null,
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    instrumentFetch();
    // eslint-disable-next-line no-restricted-globals
    const response = await fetch("http://localhost:3000/api/youtube-video");

    // Should complete without errors for YouTube video content type
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
