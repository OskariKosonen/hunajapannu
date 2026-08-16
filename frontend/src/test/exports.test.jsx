import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import IocExport from "../components/IocExport";
import OriginsPanel from "../components/OriginsPanel";
import PayloadInfraPanel from "../components/PayloadInfraPanel";

describe("IocExport", () => {
  const endpoint = "/api/public/cowrie/iocs";
  afterEach(() => vi.restoreAllMocks());

  const withClipboard = () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    return writeText;
  };

  it("offers both raw and defanged copies, plus file downloads", () => {
    render(<IocExport endpoint={endpoint} />);
    expect(screen.getByRole("button", { name: /copy list/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy defanged/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy sha-256/i })).toBeInTheDocument();
    // Downloads are real links so right-click / save-as behaves normally.
    expect(screen.getAllByRole("link", { name: /csv/i }).length).toBe(2);
  });

  it("asks the API for the defanged variant rather than mangling text locally", async () => {
    const writeText = withClipboard();
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, text: () => Promise.resolve("# header\n1.2.3[.]4\n") })
    );
    render(<IocExport endpoint={endpoint} />);
    fireEvent.click(screen.getByRole("button", { name: /copy defanged/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const url = String(global.fetch.mock.calls[0][0]);
    expect(url).toContain("defang=1");
    expect(url).toContain("format=txt");
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("1.2.3[.]4"));
  });

  it("strips the comment header when copying, since a block list wants indicators", async () => {
    const writeText = withClipboard();
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve("# hunajapannu.fi\n# window: 24h\n#\n1.2.3.4\n5.6.7.8\n"),
      })
    );
    render(<IocExport endpoint={endpoint} />);
    fireEvent.click(screen.getByRole("button", { name: /copy list/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("1.2.3.4\n5.6.7.8"));
  });

  it("changes the window without losing the format", () => {
    render(<IocExport endpoint={endpoint} />);
    fireEvent.click(screen.getByRole("button", { name: "7d" }));
    const csv = screen.getAllByRole("link", { name: /csv/i })[0];
    expect(csv.getAttribute("href")).toContain("hours=168");
    expect(csv.getAttribute("href")).toContain("format=csv");
  });

  it("says so when the clipboard is unavailable instead of failing silently", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, text: () => Promise.resolve("1.2.3.4") }));
    render(<IocExport endpoint={endpoint} />);
    fireEvent.click(screen.getByRole("button", { name: /copy list/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/download links still work/i);
  });
});

describe("OriginsPanel", () => {
  const props = {
    view: "countries",
    onView: () => {},
    topCountries: [{ country_iso: "CN", total: 1548513, unique_ips: 3970 }],
    countriesError: "", countriesLoading: false, countryFlag: () => "🏴",
    topAsn: [{ asn: 4134, org: "Chinanet", total: 441665, unique_ips: 19 }],
    asnError: "", asnLoading: false, asnTotal: 1,
    search: "", onSearch: () => {}, pageSize: 50,
    formatNumber: (n) => Number(n).toLocaleString("en-GB"),
    isMobile: false,
  };

  it("shows countries by default and networks on demand", () => {
    const { rerender } = render(<OriginsPanel {...props} />);
    expect(screen.getByText("CN")).toBeInTheDocument();
    expect(screen.queryByText(/Chinanet/)).toBeNull();
    rerender(<OriginsPanel {...props} view="asn" />);
    expect(screen.getByText("AS4134")).toBeInTheDocument();
    expect(screen.queryByText("CN")).toBeNull();
  });

  it("separates thousands so magnitudes can be ranked at a glance", () => {
    render(<OriginsPanel {...props} />);
    expect(screen.getByText("1,548,513")).toBeInTheDocument();
  });

  it("only offers search on the view the API can search", () => {
    // Countries arrive whole (153 rows); a box there would be decoration.
    const { rerender } = render(<OriginsPanel {...props} />);
    expect(screen.queryByPlaceholderText(/search network/i)).toBeNull();
    rerender(<OriginsPanel {...props} view="asn" />);
    expect(screen.getByPlaceholderText(/search network/i)).toBeInTheDocument();
  });

  it("flags a failure in the view you are not currently looking at", () => {
    // Merging two panels into one otherwise hides half the errors: the failing
    // view no longer has its own panel to report in.
    render(<OriginsPanel {...props} asnError="boom" />);
    const networks = screen.getByRole("button", { name: /networks/i });
    expect(networks).toHaveTextContent("!");
    expect(screen.getByRole("button", { name: /countries/i })).not.toHaveTextContent("!");
  });

  it("marks the active view for assistive tech", () => {
    render(<OriginsPanel {...props} view="asn" />);
    expect(screen.getByRole("button", { name: /networks/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /countries/i })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("PayloadInfraPanel", () => {
  const props = {
    hosts: [
      { host: "35.237.91.38", is_ip: true, country_iso: "US", asn: 15169,
        org: "GOOGLE-CLOUD-PLATFORM", url_count: 44, attempts: 120,
        first_seen: "2026-07-01T00:00:00Z",
        urls: ["http://35.237.91.38/bins.sh", "http://35.237.91.38/arm7"] },
      { host: "evil.example", is_ip: false, country_iso: null, asn: null, org: null,
        url_count: 1, attempts: 3, first_seen: "2026-08-01T00:00:00Z",
        urls: ["http://evil.example/x.sh"] },
    ],
    error: "", loading: false, total: 2,
    formatNumber: (n) => Number(n).toLocaleString("en-GB"),
    formatDate: (d) => String(d).slice(0, 10),
  };

  it("defangs hosts and URLs so a live malware link is never clickable", () => {
    // This page may be open on a work machine. Rendering a live payload URL as
    // a link would be a poor thing to do to a visitor.
    const { container } = render(<PayloadInfraPanel {...props} />);
    expect(screen.getByText("35.237.91[.]38")).toBeInTheDocument();
    const links = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(links.some((h) => h.includes("bins.sh"))).toBe(false);
  });

  it("flags cloud-hosted delivery, which IP reputation will not catch", () => {
    render(<PayloadInfraPanel {...props} />);
    expect(screen.getByText(/IP reputation will not flag this/i)).toBeInTheDocument();
  });

  it("does not flag a host that is not on a cloud provider", () => {
    render(<PayloadInfraPanel {...props} hosts={[props.hosts[1]]} />);
    expect(screen.queryByText(/IP reputation will not flag/i)).toBeNull();
  });

  it("offers a VirusTotal pivot for addresses but not for names", () => {
    const { container } = render(<PayloadInfraPanel {...props} />);
    const vt = [...container.querySelectorAll("a")].filter((a) =>
      a.getAttribute("href").includes("virustotal.com")
    );
    expect(vt).toHaveLength(1);
    expect(vt[0].getAttribute("href")).toBe(
      "https://www.virustotal.com/gui/ip-address/35.237.91.38"
    );
  });

  it("shows the attribution it has, and says so when it has none", () => {
    render(<PayloadInfraPanel {...props} />);
    expect(screen.getByText(/AS15169 · GOOGLE-CLOUD-PLATFORM · US/)).toBeInTheDocument();
    expect(screen.getByText("hostname")).toBeInTheDocument();
  });

  it("keeps the URL list collapsed so hosts stay scannable", () => {
    const { container } = render(<PayloadInfraPanel {...props} />);
    expect(container.querySelectorAll("details").length).toBe(2);
    expect(screen.getAllByText("show URLs").length).toBe(2);
  });

  it("distinguishes no data from a failure", () => {
    const { rerender } = render(<PayloadInfraPanel {...props} hosts={[]} total={0} />);
    expect(screen.getByText(/no download URLs captured/i)).toBeInTheDocument();
    rerender(<PayloadInfraPanel {...props} hosts={[]} total={0} error="boom" />);
    expect(screen.getByText(/failed to load payload hosts: boom/i)).toBeInTheDocument();
  });
});
