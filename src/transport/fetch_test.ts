import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { send } from "./fetch";
import { vars } from "../vars";
import * as utils from "../utils";

describe("fetch transport keepalive handling", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Reset vars
    vars.endpoints = [
      {
        url: "https://api.example.com/",
        authToken: "test-token",
      },
    ];
    vars.enableTransportCompression = false;

    // Mock fetch with proper response
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: vi.fn().mockResolvedValue(""),
    });
    vi.spyOn(utils, "fetch" as any).mockImplementation(fetchMock);

    // Spy on warn to verify error handling
    consoleWarnSpy = vi.spyOn(utils, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should set keepalive=true for small single request", async () => {
    const smallBody = { data: "test" };

    await send("/v1/traces", smallBody);

    expect(fetchMock).toHaveBeenCalledOnce();
    const fetchOptions = fetchMock.mock.calls[0]![1];
    expect(fetchOptions.keepalive).toBe(true);
  });

  it("should set keepalive=false when body size exceeds BEACON_BODY_SIZE_LIMIT", async () => {
    // Create a large body that exceeds 60KB
    const largeBody = { data: "x".repeat(65000) };

    await send("/v1/traces", largeBody);

    expect(fetchMock).toHaveBeenCalledOnce();
    const fetchOptions = fetchMock.mock.calls[0]![1];
    expect(fetchOptions.keepalive).toBe(false);
  });

  it("should handle multiple parallel requests within limits", async () => {
    const smallBody = { data: "test" };

    // Send 3 requests in parallel
    await Promise.all([send("/v1/traces", smallBody), send("/v1/traces", smallBody), send("/v1/traces", smallBody)]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    fetchMock.mock.calls.forEach((call) => {
      expect(call[1].keepalive).toBe(true);
    });
  });

  it("should set keepalive=false when pending request count exceeds 15", async () => {
    // Create 16 endpoints to trigger the limit
    vars.endpoints = Array.from({ length: 16 }, (_, i) => ({
      url: `https://api${i}.example.com/`,
      authToken: `token-${i}`,
    }));

    const smallBody = { data: "test" };

    // Mock fetch to delay response to keep requests pending
    let resolvers: Array<() => void> = [];
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(() =>
            resolve({
              ok: true,
              status: 200,
              statusText: "OK",
              text: vi.fn().mockResolvedValue(""),
            })
          );
        })
    );

    const sendPromise = send("/v1/traces", smallBody);

    // Wait a bit for all requests to be initiated
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Check that at least one request has keepalive=false
    const keepaliveValues = fetchMock.mock.calls.map((call) => call[1].keepalive);
    expect(keepaliveValues.some((v) => v === false)).toBe(true);

    // Resolve all requests
    resolvers.forEach((resolve) => resolve());
    await sendPromise;
  });

  it("should correctly adjust pendingBodySize when request succeeds", async () => {
    // Create bodies that are ~35KB each, so two together would exceed the 60KB limit
    const mediumBody1 = { data: "x".repeat(35000) };
    const mediumBody2 = { data: "y".repeat(35000) };

    // First request: pendingBodySize starts at 0, so keepalive should be true
    await send("/v1/traces", mediumBody1);
    expect(fetchMock.mock.calls[0]![1].keepalive).toBe(true);

    // After first request completes, pendingBodySize should be back to 0
    // Second request: pendingBodySize starts at 0 again, so keepalive should be true
    await send("/v1/traces", mediumBody2);
    expect(fetchMock.mock.calls[1]![1].keepalive).toBe(true);

    // This verifies that the pendingBodySize is properly decremented in the finally block
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("should correctly adjust pendingBodySize when request fails with network error", async () => {
    // Create bodies that are ~35KB each, so two together would exceed the 60KB limit
    const mediumBody = { data: "x".repeat(35000) };

    // First request fails
    fetchMock.mockRejectedValueOnce(new Error("Network error"));
    // Second request succeeds
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      text: vi.fn().mockResolvedValue(""),
    });

    // First request: should have keepalive=true (pendingBodySize is 0)
    await send("/v1/traces", mediumBody);
    expect(fetchMock.mock.calls[0]![1].keepalive).toBe(true);

    // Even though first request failed, pendingBodySize should be decremented in finally block
    // Second request: should also have keepalive=true (pendingBodySize is back to 0)
    await send("/v1/traces", mediumBody);
    expect(fetchMock.mock.calls[1]![1].keepalive).toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Error sending telemetry"), expect.any(Error));
  });

  it("should correctly adjust pendingBodySize when response.text() fails", async () => {
    // Create bodies that are ~35KB each, so two together would exceed the 60KB limit
    const mediumBody = { data: "x".repeat(35000) };

    // Mock response.text() to fail
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      text: vi.fn().mockRejectedValue(new Error("Failed to read body")),
    });

    // First request: should have keepalive=true (pendingBodySize is 0)
    await send("/v1/traces", mediumBody);
    expect(fetchMock.mock.calls[0]![1].keepalive).toBe(true);

    // Should still complete successfully and adjust pendingBodySize even though text() failed
    expect(fetchMock).toHaveBeenCalledOnce();

    // Next request should still work with keepalive=true (verifying pendingBodySize is 0)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      text: vi.fn().mockResolvedValue(""),
    });

    await send("/v1/traces", mediumBody);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![1].keepalive).toBe(true);
  });

  it("should handle multiple parallel requests with failures", async () => {
    vars.endpoints = [
      { url: "https://api1.example.com/", authToken: "token1" },
      { url: "https://api2.example.com/", authToken: "token2" },
      { url: "https://api3.example.com/", authToken: "token3" },
    ];

    const body = { data: "test" };

    // First endpoint fails, others succeed
    fetchMock
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        text: vi.fn().mockResolvedValue(""),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        text: vi.fn().mockResolvedValue(""),
      });

    await send("/v1/traces", body);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Error sending telemetry"), expect.any(Error));

    // After all complete, counters should be reset
    // Reset endpoints back to 1
    vars.endpoints = [
      {
        url: "https://api.example.com/",
        authToken: "test-token",
      },
    ];

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      text: vi.fn().mockResolvedValue(""),
    });

    await send("/v1/traces", body);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3]![1].keepalive).toBe(true);
  });

  it("should correctly handle mixed success and failure in parallel with size tracking", async () => {
    vars.endpoints = [
      { url: "https://api1.example.com/", authToken: "token1" },
      { url: "https://api2.example.com/", authToken: "token2" },
    ];

    // Create a body that's about 30KB
    const mediumBody = { data: "x".repeat(30000) };

    // First endpoint fails, second succeeds
    fetchMock.mockRejectedValueOnce(new Error("Network error")).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      text: vi.fn().mockResolvedValue(""),
    });

    await send("/v1/traces", mediumBody);

    // Both requests should have been made
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Error sending telemetry"), expect.any(Error));

    // After completion, pendingBodySize should be back to 0
    // Reset to single endpoint for simpler test
    vars.endpoints = [
      {
        url: "https://api.example.com/",
        authToken: "test-token",
      },
    ];

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      text: vi.fn().mockResolvedValue(""),
    });

    await send("/v1/traces", { data: "test" });
    expect(fetchMock.mock.calls[2]![1].keepalive).toBe(true);
  });

  it("should handle requests with non-ok response status", async () => {
    // Create bodies that are ~35KB each, so two together would exceed the 60KB limit
    const mediumBody = { data: "x".repeat(35000) };

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: vi.fn().mockResolvedValue(""),
    });

    // First request with error response
    await send("/v1/traces", mediumBody);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to send telemetry"));

    // Verify pendingBodySize was adjusted correctly by sending another request
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      text: vi.fn().mockResolvedValue(""),
    });

    // Second request should have keepalive=true (verifying pendingBodySize was decremented)
    await send("/v1/traces", mediumBody);
    expect(fetchMock.mock.calls[1]![1].keepalive).toBe(true);
  });

  it("should handle the exact boundary of BEACON_BODY_SIZE_LIMIT", async () => {
    // Create a body that's just under 60000 bytes
    const nearBoundaryBody = { data: "x".repeat(59970) }; // Accounting for JSON overhead

    await send("/v1/traces", nearBoundaryBody);

    expect(fetchMock).toHaveBeenCalledOnce();
    const fetchOptions = fetchMock.mock.calls[0]![1];

    // Should be true since we're under the limit
    expect(fetchOptions.keepalive).toBe(true);
  });

  it("should handle exactly 15 parallel requests", async () => {
    vars.endpoints = Array.from({ length: 15 }, (_, i) => ({
      url: `https://api${i}.example.com/`,
      authToken: `token-${i}`,
    }));

    const smallBody = { data: "test" };

    await send("/v1/traces", smallBody);

    expect(fetchMock).toHaveBeenCalledTimes(15);
    fetchMock.mock.calls.forEach((call) => {
      expect(call[1].keepalive).toBe(true);
    });
  });
});
