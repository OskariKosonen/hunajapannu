import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  formatNumber,
  formatCompact,
  formatBytes,
  formatDuration,
  formatRelative,
  formatEventTime,
  countryFlag,
  networkLabel,
  placeLabel,
} from "../lib/format";
import DataTable from "../components/ui/DataTable";

describe("format", () => {
  it("separates thousands, and dashes what is not a number", () => {
    expect(formatNumber(203819)).toBe("203,819");
    expect(formatNumber("91383")).toBe("91,383");
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber("abc")).toBe("—");
  });

  it("shortens headline figures", () => {
    expect(formatCompact(7682298)).toBe("7.7M");
    expect(formatCompact(12_400_000)).toBe("12M");
    expect(formatCompact(24122)).toBe("24k");
    expect(formatCompact(9876)).toBe("9,876");
    expect(formatCompact(undefined)).toBe("—");
  });

  it("formats sizes, durations and percentages", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatDuration(500)).toBe("<1s");
    expect(formatDuration(65_000)).toBe("1m 5s");
    expect(formatDuration(3_720_000)).toBe("1h 2m");
    expect(formatDuration(null)).toBe("—");
  });

  it("says how long ago, in the largest sensible unit", () => {
    const now = Date.parse("2026-11-04T12:00:00Z");
    expect(formatRelative("2026-11-04T11:59:48Z", now)).toBe("12s ago");
    expect(formatRelative("2026-11-04T11:56:00Z", now)).toBe("4m ago");
    expect(formatRelative("2026-11-04T09:00:00Z", now)).toBe("3h ago");
    expect(formatRelative("2026-11-01T12:00:00Z", now)).toBe("3d ago");
    // Clock skew between the Pi and the browser must not produce "-3s ago".
    expect(formatRelative("2026-11-04T12:00:03Z", now)).toBe("0s ago");
  });

  it("drops the date from today's event times, and keeps it otherwise", () => {
    const now = new Date();
    expect(formatEventTime(now, now)).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    const lastWeek = new Date(now.getTime() - 7 * 86_400_000);
    expect(formatEventTime(lastWeek, now)).toMatch(/^\d{1,2} [A-Z][a-z]{2,3}, \d{2}:\d{2}:\d{2}$/);
  });

  it("labels places and networks without empty separators", () => {
    expect(placeLabel({ city: "Beijing", country_iso: "CN" })).toBe("Beijing · CN");
    expect(placeLabel({ country_iso: "CN" })).toBe("CN");
    expect(placeLabel({})).toBe("Unknown");
    expect(networkLabel({ asn: 4134, org: "Chinanet" })).toBe("AS4134 · Chinanet");
    expect(networkLabel({})).toBe("Unknown network");
  });

  it("turns a country code into a flag and anything else into a globe", () => {
    expect(countryFlag("fi")).toBe("🇫🇮");
    expect(countryFlag("")).toBe("🌐");
    expect(countryFlag("XYZ")).toBe("🌐");
  });
});

describe("DataTable", () => {
  const columns = [
    { key: "name", header: "Name" },
    { key: "n", header: "Count", align: "right" },
  ];

  it("renders rows under a real table header", () => {
    render(<DataTable columns={columns} rows={[{ name: "a", n: 1 }]} />);
    expect(screen.getByRole("columnheader", { name: "Count" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "a" })).toBeInTheDocument();
  });

  it("says when there is nothing, and when the request failed", () => {
    const { rerender } = render(<DataTable columns={columns} rows={[]} emptyTitle="Nothing here." />);
    expect(screen.getByText("Nothing here.")).toBeInTheDocument();
    rerender(<DataTable columns={columns} rows={[]} error="API error 500" errorLabel="Failed to load things" />);
    expect(screen.getByText(/failed to load things: API error 500/i)).toBeInTheDocument();
    expect(screen.queryByText("Nothing here.")).toBeNull();
  });

  it("shows a skeleton on first load rather than an empty state", () => {
    render(<DataTable columns={columns} rows={[]} loading emptyTitle="Nothing here." />);
    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
    expect(screen.queryByText("Nothing here.")).toBeNull();
  });

  it("keeps showing rows during a refresh", () => {
    render(<DataTable columns={columns} rows={[{ name: "a", n: 1 }]} loading />);
    expect(screen.getByRole("cell", { name: "a" })).toBeInTheDocument();
  });
});
