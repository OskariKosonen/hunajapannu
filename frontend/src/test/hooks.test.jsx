import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { buildUrl, useApi, useDebounced } from "../hooks/useApi";
import { useUrlState } from "../hooks/useUrlState";

describe("buildUrl", () => {
  it("drops empty, null and the 'all' sentinel", () => {
    expect(buildUrl("/x", { limit: 10, search: "", tag: "all", q: null })).toBe("/x?limit=10");
  });

  it("encodes values that would otherwise break the query string", () => {
    expect(buildUrl("/x", { search: "a b&c=d" })).toBe("/x?search=a+b%26c%3Dd");
  });

  it("returns the bare base when nothing survives", () => {
    expect(buildUrl("/x", { search: "", tag: "all" })).toBe("/x");
  });
});

describe("useApi", () => {
  beforeEach(() => { global.fetch = vi.fn(); });
  afterEach(() => { vi.restoreAllMocks(); });

  const ok = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

  it("unwraps the { rows, total } envelope", async () => {
    global.fetch.mockReturnValue(ok({ rows: [{ a: 1 }], total: 42 }));
    const { result } = renderHook(() => useApi("/api/x"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows).toEqual([{ a: 1 }]);
    expect(result.current.total).toBe(42);
    expect(result.current.error).toBe("");
  });

  it("still accepts endpoints that answer a bare array", async () => {
    global.fetch.mockReturnValue(ok([{ a: 1 }, { a: 2 }]));
    const { result } = renderHook(() => useApi("/api/y"));
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.total).toBe(2);
  });

  it("surfaces a non-2xx as an error without throwing", async () => {
    global.fetch.mockReturnValue(Promise.resolve({ ok: false, status: 503 }));
    const { result } = renderHook(() => useApi("/api/z"));
    await waitFor(() => expect(result.current.error).toBe("API error 503"));
    expect(result.current.rows).toEqual([]);
  });

  it("does not fetch while disabled", () => {
    renderHook(() => useApi("/api/x", { enabled: false }));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does not fetch a null url (the closed drawer)", () => {
    renderHook(() => useApi(null));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("aborts the previous request when the url changes", async () => {
    global.fetch.mockReturnValue(ok({ rows: [], total: 0 }));
    const { rerender } = renderHook(({ url }) => useApi(url), {
      initialProps: { url: "/api/a" },
    });
    rerender({ url: "/api/b" });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    const firstSignal = global.fetch.mock.calls[0][1].signal;
    expect(firstSignal.aborted).toBe(true);
  });

  it("reports an aborted request as neither error nor data", async () => {
    const abortErr = Object.assign(new Error("aborted"), { name: "AbortError" });
    global.fetch.mockReturnValue(Promise.reject(abortErr));
    const { result } = renderHook(() => useApi("/api/x"));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(result.current.error).toBe("");
  });
});

describe("useDebounced", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("only emits after the delay has passed without changes", () => {
    const { result, rerender } = renderHook(({ v }) => useDebounced(v, 300), {
      initialProps: { v: "a" },
    });
    rerender({ v: "ab" });
    rerender({ v: "abc" });
    expect(result.current).toBe("a");
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current).toBe("abc");
  });
});

describe("useUrlState", () => {
  beforeEach(() => { window.history.replaceState(null, "", "/"); });

  it("reads an initial value out of the query string", () => {
    window.history.replaceState(null, "", "/?q=china");
    const { result } = renderHook(() => useUrlState("q"));
    expect(result.current[0]).toBe("china");
  });

  it("writes to the url so the view can be shared", () => {
    const { result } = renderHook(() => useUrlState("q"));
    act(() => result.current[1]("wget"));
    expect(window.location.search).toBe("?q=wget");
    expect(result.current[0]).toBe("wget");
  });

  it("removes the parameter when cleared, rather than leaving q=", () => {
    window.history.replaceState(null, "", "/?q=wget");
    const { result } = renderHook(() => useUrlState("q"));
    act(() => result.current[1](""));
    expect(window.location.search).toBe("");
  });

  it("treats the fallback as absent, keeping default views clean", () => {
    const { result } = renderHook(() => useUrlState("tag", "all"));
    act(() => result.current[1]("T1105"));
    expect(window.location.search).toBe("?tag=T1105");
    act(() => result.current[1]("all"));
    expect(window.location.search).toBe("");
  });

  it("leaves other parameters alone", () => {
    window.history.replaceState(null, "", "/?session=abc&q=x");
    const { result } = renderHook(() => useUrlState("q"));
    act(() => result.current[1]("y"));
    expect(new URLSearchParams(window.location.search).get("session")).toBe("abc");
  });
});
