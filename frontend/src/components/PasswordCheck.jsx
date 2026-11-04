import { memo, useCallback, useId, useState } from "react";
import Panel from "./ui/Panel";
import Button from "./ui/Button";
import { ErrorNotice } from "./ui/states";
import { formatNumber } from "../lib/format";

/**
 * "Have the bots tried your password?"
 *
 * Uses the k-anonymity model Have I Been Pwned uses: the password is hashed
 * with SHA-256 in the browser, and only the first few hex characters of that
 * hash are sent. The API answers with every stored hash sharing that prefix,
 * and the match is found here, locally. The password itself never crosses the
 * network, so this cannot become a credential-harvesting form even by
 * accident — which matters, because a box on a security site inviting you to
 * type a password is exactly the shape of a phishing page.
 *
 * Three characters, not HIBP's five. The prefix length has to be sized to the
 * corpus: HIBP holds ~850M hashes, so 5 chars leaves ~800 candidates per
 * lookup. This honeypot holds ~134k distinct passwords, where 5 chars returned
 * exactly one hash — the caller's own — so there was no anonymity set at all.
 * 3 chars gives 4,096 buckets, measured at ~33 candidates per lookup against
 * production.
 *
 * The caveat below the field is deliberate and stays.
 */

const PREFIX_LENGTH = 3;
// Deliberately not a hardcoded count: the corpus grows, and the exact number
// of candidates for this lookup is reported after the check from the actual
// response, so the claim stays checkable without drifting out of date.

/** Hex SHA-256 via WebCrypto. Requires a secure context (https or localhost). */
async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const PasswordCheck = ({ endpoint, uniqueCredCount, className = "" }) => {
  const inputId = useId();
  const [value, setValue] = useState("");
  const [reveal, setReveal] = useState(false);
  const [state, setState] = useState({ status: "idle" });

  const check = useCallback(
    async (event) => {
      event.preventDefault();
      const password = value;
      if (!password) return;

      if (typeof crypto === "undefined" || !crypto.subtle) {
        setState({
          status: "error",
          message: "This browser will not hash locally, so the check is disabled.",
        });
        return;
      }

      setState({ status: "checking" });
      try {
        const hash = await sha256Hex(password);
        const prefix = hash.slice(0, PREFIX_LENGTH);
        const suffix = hash.slice(PREFIX_LENGTH);

        const res = await fetch(`${endpoint}/${prefix}`);
        if (!res.ok) throw new Error(`API error ${res.status}`);
        const body = await res.json();

        const hit = (body.results || []).find(
          (r) => String(r.suffix).toLowerCase() === suffix
        );
        setState({
          status: "done",
          prefix,
          candidates: (body.results || []).length,
          hit: hit || null,
        });
      } catch (err) {
        setState({ status: "error", message: err.message || "Lookup failed" });
      }
    },
    [value, endpoint]
  );

  return (
    <Panel
      title="Password check"
      description={
        uniqueCredCount != null
          ? `Has this password been tried against the honeypot? Checked against ${formatNumber(uniqueCredCount)} captured username/password pairs.`
          : "Has this password been tried against the honeypot?"
      }
      className={className}
    >
      <div className="space-y-4">
        <form onSubmit={check} className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1 min-w-0">
            <label htmlFor={inputId} className="sr-only">
              Password to check
            </label>
            <input
              id={inputId}
              type={reveal ? "text" : "password"}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setState({ status: "idle" });
              }}
              placeholder="e.g. 123456"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              className="h-9 w-full rounded-md border border-line bg-surface-2 pl-3 pr-16 font-mono text-sm text-fg placeholder:font-sans placeholder:text-fg-subtle focus:border-accent/60 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setReveal((r) => !r)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-fg-subtle hover:text-fg"
            >
              {reveal ? "Hide" : "Show"}
            </button>
          </div>
          <Button type="submit" variant="primary" size="md" disabled={!value || state.status === "checking"}>
            {state.status === "checking" ? "Checking…" : "Check"}
          </Button>
        </form>

        {state.status === "error" && (
          <div role="alert">
            <ErrorNotice>{state.message}</ErrorNotice>
          </div>
        )}

        {state.status === "done" && state.hit && (
          <div role="status" className="rounded-md border border-warn/40 bg-warn/5 p-3.5 space-y-1">
            <div className="text-sm font-semibold text-warn">
              Yes — seen {formatNumber(state.hit.attempts)} {state.hit.attempts === 1 ? "time" : "times"}.
            </div>
            <div className="text-sm text-fg-muted">
              Tried against {formatNumber(state.hit.pairs)}{" "}
              {state.hit.pairs === 1 ? "username" : "different usernames"}
              {state.hit.usernames?.length > 0 && (
                <>
                  {" "}— including{" "}
                  {state.hit.usernames.map((u, i) => (
                    <span key={u}>
                      {i > 0 && ", "}
                      <span className="font-mono text-fg">{u}</span>
                    </span>
                  ))}
                </>
              )}
              .
            </div>
          </div>
        )}

        {state.status === "done" && !state.hit && (
          <div role="status" className="rounded-md border border-accent/30 bg-accent/5 p-3.5 space-y-1">
            <div className="text-sm font-semibold text-accent">Not in this corpus.</div>
            <div className="text-sm text-fg-muted">
              These are the passwords bots have actually thrown at one honeypot — not a measure of whether a
              password is strong or has leaked elsewhere.
            </div>
          </div>
        )}

        <div className="rounded-md bg-surface-2/60 px-3.5 py-3 text-xs leading-relaxed text-fg-muted space-y-1.5">
          <p>
            <span className="font-medium text-fg">Your password never leaves this page.</span> It is hashed here
            with SHA-256 and only the first {PREFIX_LENGTH} characters of the hash are sent — one of{" "}
            {(16 ** PREFIX_LENGTH).toLocaleString("en-GB")} buckets, shared by dozens of other captured passwords,
            so the server cannot tell which one you asked about.
          </p>
          <p className="text-warn/90">Still — don't type a password you currently use, into this or any other site.</p>
          {state.status === "done" && (
            <p className="text-fg-subtle">
              Sent prefix <code className="font-mono text-fg-muted">{state.prefix}</code>; the server returned{" "}
              {formatNumber(state.candidates)} {state.candidates === 1 ? "hash" : "hashes"} sharing it, matched
              locally.
            </p>
          )}
        </div>
      </div>
    </Panel>
  );
};

export default memo(PasswordCheck);
