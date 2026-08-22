import { describe, it, expect, vi, afterEach } from "vitest";
import {
  LOADING_WORDS,
  BOOT_MESSAGES,
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
 * The voice is allowed to be silly; it is not allowed to be broken. These
 * guard the things that would actually show up wrong on the page.
 */
describe("flavour", () => {
  afterEach(() => vi.restoreAllMocks());

  it("has enough loading words that the rotation is not obviously short", () => {
    expect(LOADING_WORDS.length).toBeGreaterThanOrEqual(20);
  });

  it("keeps loading words to a single word, since they render inline mid-sentence", () => {
    for (const w of LOADING_WORDS) {
      expect(w, `"${w}" should be one word`).not.toMatch(/\s/);
      // The ellipsis is added by the component; baking one in would double it.
      expect(w).not.toMatch(/[.…]/);
    }
  });

  it("has no duplicate loading words", () => {
    expect(new Set(LOADING_WORDS).size).toBe(LOADING_WORDS.length);
  });

  it("gives every boot message both a label and a detail", () => {
    for (const m of BOOT_MESSAGES) {
      expect(m.label, JSON.stringify(m)).toBeTruthy();
      expect(m.detail, JSON.stringify(m)).toBeTruthy();
      // Labels sit in a fixed-width chip; long ones wrap badly.
      expect(m.label.length).toBeLessThanOrEqual(24);
    }
  });

  it("gives every empty state a line and a useful hint under the joke", () => {
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
