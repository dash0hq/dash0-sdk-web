import { expect, vi } from "vitest";
import { vars } from "../../vars";
import { instrumentFetch } from "./fetch";

describe("fetch test", () => {
  const fetchMock = vi.fn(() => {
    return {
      ok: false,
    };
  });
  vi.stubGlobal("fetch", fetchMock);

  it("should inject traceparent header", async () => {
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

  it("should inject xray header", async () => {
    const fetchMock = vi.fn(() => {
      return {
        ok: false,
      };
    });
    vi.stubGlobal("fetch", fetchMock);
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

  it("should inject both headers", async () => {
    const fetchMock = vi.fn(() => {
      return {
        ok: false,
      };
    });
    vi.stubGlobal("fetch", fetchMock);
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

  it("should inject no headers", async () => {
    const fetchMock = vi.fn(() => {
      return {
        ok: false,
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    vars.propagators = [];
    instrumentFetch();
    // eslint-disable-next-line no-restricted-globals
    await fetch("http://foo.bar/foo");

    expect(fetchMock).toHaveBeenCalledOnce();
    const expectedHeaders = undefined;
    expect(fetchMock).toHaveBeenCalledWith("http://foo.bar/foo", expectedHeaders);
  });
});
