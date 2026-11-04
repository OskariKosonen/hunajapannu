import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AreaSparkline from "../components/common/AreaSparkline";
import PasswordAnatomy from "../components/PasswordAnatomy";
import ConcentrationPanel from "../components/ConcentrationPanel";
import ClientsPanel from "../components/ClientsPanel";
import TunnelsPanel from "../components/TunnelsPanel";
import TopCredentialsPanel from "../components/TopCredentialsPanel";
import TopMalwarePanel from "../components/TopMalwarePanel";
import { clientFamily, groupClients } from "../lib/sshClients";
import { formatDate } from "../lib/format";

const noop = () => {};

describe("chart axis", () => {
  it("does not leave half the plot empty above the peak", () => {
    // A peak of 2,258 used to get an axis to 5,000.
    const { container } = render(<AreaSparkline data={[{ label: "a", value: 2258 }]} />);
    const labels = [...container.querySelectorAll("text")].map((t) => t.textContent);
    expect(labels).toContain("2,500");
    expect(labels).not.toContain("5,000");
  });

  it("keeps ticks whole for tiny counts", () => {
    const { container } = render(<AreaSparkline data={[{ label: "a", value: 3 }]} />);
    const labels = [...container.querySelectorAll("text")].map((t) => t.textContent);
    expect(labels.filter((l) => /\./.test(l))).toEqual([]);
  });
});

describe("formatDate", () => {
  const now = new Date("2026-11-04T12:00:00Z");
  it("drops the year inside the current one", () => {
    expect(formatDate("2026-11-03T12:00:00Z", now)).toBe("3 Nov");
  });
  it("keeps it for earlier years", () => {
    expect(formatDate("2025-11-24T12:00:00Z", now)).toBe("24 Nov 2025");
  });
});

describe("SSH client families", () => {
  it("names the software behind a banner", () => {
    expect(clientFamily("SSH-2.0-Go").id).toBe("go");
    expect(clientFamily("SSH-2.0-libssh2_1.9.0").id).toBe("libssh2");
    expect(clientFamily("SSH-2.0-libssh_0.9.6").id).toBe("libssh");
    expect(clientFamily("SSH-2.0-OpenSSH_8.9p1 Ubuntu-3").id).toBe("openssh");
    expect(clientFamily("SSH-2.0-paramiko_3.4.0").id).toBe("paramiko");
    expect(clientFamily("SSH-2.0-PuTTY_Release_0.78").id).toBe("putty");
    expect(clientFamily("SSH-2.0-whatever").id).toBe("other");
    expect(clientFamily(null).id).toBe("other");
  });

  it("groups banners and puts what the top list left out under Other", () => {
    const families = groupClients(
      [
        { client_version: "SSH-2.0-Go", sessions: 50 },
        { client_version: "SSH-2.0-libssh2_1.9.0", sessions: 20 },
        { client_version: "SSH-2.0-libssh2_1.11.0", sessions: 10 },
      ],
      100
    );
    expect(families.map((f) => [f.id, f.sessions])).toEqual([
      ["go", 50],
      ["libssh2", 30],
      ["other", 20],
    ]);
  });
});

describe("PasswordAnatomy", () => {
  const data = {
    attempts: 100,
    kinds: { same: 30, digits: 25, letters: 20, mixed: 20, empty: 5 },
    lengths: [
      { length: 0, attempts: 5 },
      { length: 5, attempts: 40 },
      { length: 8, attempts: 45 },
      { length: 14, attempts: 10 },
    ],
    topUsernames: [{ username: "root", total: 40 }],
  };

  it("shows every kind, with its share", () => {
    render(<PasswordAnatomy data={data} />);
    expect(screen.getByText("The username again")).toBeInTheDocument();
    expect(screen.getByText("30.0%")).toBeInTheDocument();
    expect(screen.getByText("No password")).toBeInTheDocument();
  });

  it("finds the length half of all guesses stay under", () => {
    render(<PasswordAnatomy data={data} />);
    expect(screen.getByText("8 characters")).toBeInTheDocument();
    expect(screen.getByText("10.0%")).toBeInTheDocument();
  });

  it("says so when there is nothing yet", () => {
    render(<PasswordAnatomy data={{ attempts: 0 }} />);
    expect(screen.getByText(/no login attempts yet/i)).toBeInTheDocument();
  });
});

describe("ConcentrationPanel", () => {
  it("answers how many networks carry half the traffic", () => {
    render(
      <ConcentrationPanel
        data={{
          events: 100,
          networks: 3214,
          thresholds: [
            { share: 0.5, networks: 6 },
            { share: 0.8, networks: 41 },
            { share: 0.9, networks: 112 },
          ],
          top: [{ asn: 14061, org: "DIGITALOCEAN-ASN", total: 30, cumulative: 0.3 }],
        }}
      />
    );
    expect(screen.getByText("3,214")).toBeInTheDocument();
    expect(screen.getByText("Half")).toBeInTheDocument();
    expect(screen.getByText(/sent half of/)).toBeInTheDocument();
    expect(screen.getByText("DIGITALOCEAN-ASN")).toBeInTheDocument();
  });
});

describe("ClientsPanel", () => {
  it("shows the software and the most widespread fingerprint", () => {
    render(
      <ClientsPanel
        data={{
          days: 30,
          sessions: 100,
          ips: 900,
          fingerprints: 12,
          versioned: 100,
          versions: [{ client_version: "SSH-2.0-Go", sessions: 100, ips: 900 }],
          hassh: [
            { hassh: "06046964c022c6407d15a27b12a6a4fb", sessions: 80, ips: 700, countries: 41, networks: 90, client_version: "SSH-2.0-Go" },
          ],
        }}
      />
    );
    expect(screen.getByText("Go")).toBeInTheDocument();
    expect(screen.getAllByText("700").length).toBeGreaterThan(0);
    expect(screen.getByTitle(/HASSH 06046964/)).toBeInTheDocument();
    expect(screen.getByText(/one tool, many machines/)).toBeInTheDocument();
  });
});

describe("TunnelsPanel", () => {
  it("names what each destination port is for", () => {
    render(
      <TunnelsPanel
        data={{
          days: 30,
          requests: 9,
          sources: 2,
          destinations: 1,
          ports: [{ dst_port: 25, requests: 9, sources: 2 }],
          hosts: [{ dst_host: "smtp.example.com", dst_port: 25, requests: 9, sources: 2 }],
        }}
      />
    );
    expect(screen.getByText("email (SMTP)")).toBeInTheDocument();
    expect(screen.getByText("smtp.example.com")).toBeInTheDocument();
  });
});

describe("long tables", () => {
  const creds = Array.from({ length: 60 }, (_, i) => ({ username: `u${i}`, password: `p${i}`, total: 60 - i, unique_ips: 1 }));

  it("show a page, then more on request, instead of a scroll box", () => {
    render(<TopCredentialsPanel creds={creds} credsTotal={1000} credsError="" credsLoading={false} search="" onSearch={noop} />);
    expect(screen.getByText("u24")).toBeInTheDocument();
    expect(screen.queryByText("u25")).toBeNull();
    expect(screen.getByText(/Showing 25 of 1,000/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show 25 more" }));
    expect(screen.getByText("u49")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show 10 more" }));
    expect(screen.getByText(/Search to find the rest/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /more/ })).toBeNull();
  });

  it("draw no footer when everything fits", () => {
    const { container } = render(
      <TopCredentialsPanel creds={creds.slice(0, 3)} credsTotal={3} credsError="" credsLoading={false} search="" onSearch={noop} />
    );
    expect(container.querySelector("footer")).toBeNull();
  });
});

describe("Malware verdicts", () => {
  it("summarise the whole set above the table", () => {
    render(
      <TopMalwarePanel
        downloads={[]}
        downloadsTotal={423}
        downloadsError=""
        downloadsLoading={false}
        verdicts={{ malicious: 296, suspicious: 0, clean: 69, notFound: 51, pending: 7 }}
        search=""
        onSearch={noop}
      />
    );
    expect(screen.getByText("296")).toBeInTheDocument();
    expect(screen.getByText(/never seen by virustotal/i)).toBeInTheDocument();
    expect(screen.queryByText(/suspicious/i)).toBeNull();
  });
});
