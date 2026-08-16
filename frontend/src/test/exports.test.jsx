import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import IocExport from "../components/IocExport";
import EngineeringNotes from "../components/EngineeringNotes";

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

describe("EngineeringNotes", () => {
  it("shows the one-line pipeline without being expanded", () => {
    render(<EngineeringNotes />);
    expect(screen.getByText(/Raspberry Pi sensor/)).toBeInTheDocument();
    // Detail is hidden until asked for, so it never competes with live data.
    expect(screen.queryByText(/Trigger-maintained aggregates/)).toBeNull();
  });

  it("expands on click and reports it to assistive tech", () => {
    render(<EngineeringNotes />);
    const toggle = screen.getByRole("button");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Trigger-maintained aggregates/)).toBeInTheDocument();
    expect(screen.getByText(/k-anonymous password lookup/)).toBeInTheDocument();
  });

  it("does not link anywhere, since the repo is private", () => {
    const { container } = render(<EngineeringNotes />);
    fireEvent.click(screen.getByRole("button"));
    expect(container.querySelectorAll("a").length).toBe(0);
  });
});
