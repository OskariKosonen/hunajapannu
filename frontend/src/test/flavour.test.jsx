import { describe, it, expect, vi, afterEach } from "vitest";
import { LOADING_WORDS, BOOT_MESSAGES, EMPTY_STATES, printConsoleBanner } from "../lib/flavour";

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
    expect(format).toContain("github.com/OskariKosonen/hunajapannu");
  });

  it("does not throw when console is unavailable", () => {
    const original = globalThis.console;
    globalThis.console = undefined;
    expect(() => printConsoleBanner()).not.toThrow();
    globalThis.console = original;
  });
});
