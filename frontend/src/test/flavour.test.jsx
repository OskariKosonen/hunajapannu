import { describe, it, expect, vi, afterEach } from "vitest";
import {
  EMPTY_STATES,
  DEVTOOLS_MESSAGES,
  printConsoleBanner,
  watchForDevTools,
} from "../lib/flavour";

/** jsdom reports equal inner/outer by default; nudge them apart to fake a panel. */
const setViewport = ({ inner, outer }) => {
  window.innerWidth = inner;
  window.outerWidth = outer;
  window.innerHeight = 768;
  window.outerHeight = 768;
};

/**
 * What is left of the voice is allowed to be silly; it is not allowed to be
 * broken. These guard the things that would actually show up wrong.
 */
describe("flavour", () => {
  afterEach(() => vi.restoreAllMocks());

  it("gives every empty state a line and a useful hint", () => {
    for (const [key, v] of Object.entries(EMPTY_STATES)) {
      expect(v.line, key).toBeTruthy();
      expect(v.hint, key).toBeTruthy();
      expect(v.line).not.toBe(v.hint);
    }
  });

  it("prints the console banner without throwing", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    printConsoleBanner();
    expect(log).toHaveBeenCalledTimes(1);
    const [format, ...styles] = log.mock.calls[0];
    // Every %c must have a matching style argument or the output is garbled.
    expect((format.match(/%c/g) || []).length).toBe(styles.length);
    // Points at the public API, not the repo: the repo is private, so a link
    // to it would 404 for exactly the audience most likely to click.
    expect(format).toContain("hunajapannu.fi/api/public/cowrie/summary");
    expect(format).not.toContain("github.com");
  });

  it("does not throw when console is unavailable", () => {
    const original = globalThis.console;
    globalThis.console = undefined;
    expect(() => printConsoleBanner()).not.toThrow();
    globalThis.console = original;
  });

  describe("devtools easter egg", () => {
    const realInner = window.innerWidth;
    const realOuter = window.outerWidth;
    let stop = () => {};

    afterEach(() => {
      // The watcher only detaches itself once it has fired; a test that leaves
      // it armed would otherwise answer the next test's resize as well.
      stop();
      setViewport({ inner: realInner, outer: realOuter });
    });

    it("gives every devtools message both a label and a detail", () => {
      for (const m of DEVTOOLS_MESSAGES) {
        expect(m.label, JSON.stringify(m)).toBeTruthy();
        expect(m.detail, JSON.stringify(m)).toBeTruthy();
        expect(m.label.length).toBeLessThanOrEqual(24);
      }
    });

    it("says nothing while the panel is shut", () => {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      setViewport({ inner: 1024, outer: 1024 });
      stop = watchForDevTools();
      window.dispatchEvent(new Event("resize"));
      expect(log).not.toHaveBeenCalled();
    });

    it("greets the viewport shrinking out from under the page", () => {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      setViewport({ inner: 1024, outer: 1024 });
      stop = watchForDevTools();

      setViewport({ inner: 600, outer: 1024 });   // panel docked to the side
      window.dispatchEvent(new Event("resize"));

      expect(log).toHaveBeenCalledTimes(1);
      const [format, ...styles] = log.mock.calls[0];
      expect((format.match(/%c/g) || []).length).toBe(styles.length);
    });

    it("fires once, not on every dock and undock", () => {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      setViewport({ inner: 1024, outer: 1024 });
      stop = watchForDevTools();

      for (const inner of [600, 1024, 600]) {
        setViewport({ inner, outer: 1024 });
        window.dispatchEvent(new Event("resize"));
      }

      expect(log).toHaveBeenCalledTimes(1);
    });

    it("catches a panel that was already open at load", () => {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      setViewport({ inner: 600, outer: 1024 });
      stop = watchForDevTools();
      expect(log).toHaveBeenCalledTimes(1);
    });

    it("does not throw when there is no window", () => {
      const original = globalThis.window;
      globalThis.window = undefined;
      expect(() => watchForDevTools()).not.toThrow();
      globalThis.window = original;
    });
  });
});
