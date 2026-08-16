import { memo, useCallback, useId, useState } from "react";

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

const PasswordCheck = ({ endpoint, formatNumber, uniqueCredCount }) => {
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
    <section className="relative overflow-hidden border border-emerald-700/50 rounded-xl bg-slate-950/70 shadow-[0_10px_35px_rgba(0,0,0,0.45)]">
      <div className="px-4 sm:px-5 py-3 border-b border-emerald-800/60 bg-black/40">
        <p className="text-[0.65rem] uppercase tracking-[0.2em] text-emerald-400">
          Credential corpus
        </p>
        <h2 className="text-base sm:text-lg font-semibold text-green-200">
          Have the bots tried your password?
        </h2>
        <p className="text-[0.65rem] text-emerald-500 mt-0.5">
          Checked against {formatNumber(uniqueCredCount)} username/password pairs captured
          by the honeypot.
        </p>
      </div>

      <div className="p-4 sm:p-5 space-y-3">
        <form onSubmit={check} className="flex flex-col sm:flex-row gap-2">
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
              placeholder="try 123456"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              className="w-full bg-black/50 border border-emerald-800/70 rounded-md pl-3 pr-16 py-2 text-[0.8rem] text-emerald-100 placeholder-emerald-800 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={() => setReveal((r) => !r)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2 py-1 text-[0.6rem] uppercase tracking-wider text-emerald-500 hover:text-emerald-300"
            >
              {reveal ? "Hide" : "Show"}
            </button>
          </div>
          <button
            type="submit"
            disabled={!value || state.status === "checking"}
            className="px-4 py-2 rounded-md border border-emerald-400 text-slate-950 bg-emerald-200 hover:bg-emerald-100 disabled:opacity-40 disabled:hover:bg-emerald-200 transition-colors font-semibold text-[0.8rem] shrink-0"
          >
            {state.status === "checking" ? "Checking…" : "Check"}
          </button>
        </form>

        <p className="text-[0.6rem] text-emerald-600 leading-relaxed">
          Your password never leaves this page. It is hashed here with SHA-256 and only the
          first {PREFIX_LENGTH} characters of that hash are sent — one of{" "}
          {(16 ** PREFIX_LENGTH).toLocaleString()} buckets, shared by dozens of other captured
          passwords, so the server cannot tell which one you asked about.{" "}
          <span className="text-emerald-500">
            Still — don't type a password you currently use, into this or any other site.
          </span>
        </p>

        {state.status === "error" && (
          <div role="alert" className="text-[0.68rem] text-red-400 border border-red-500/50 rounded px-2.5 py-1.5">
            {state.message}
          </div>
        )}

        {state.status === "done" && state.hit && (
          <div role="status" className="border border-amber-500/50 bg-amber-500/5 rounded-lg p-3 space-y-1">
            <div className="text-amber-200 font-semibold text-[0.85rem]">
              Yes — seen {formatNumber(state.hit.attempts)}{" "}
              {state.hit.attempts === 1 ? "time" : "times"}.
            </div>
            <div className="text-[0.68rem] text-emerald-400">
              Tried against {formatNumber(state.hit.pairs)}{" "}
              {state.hit.pairs === 1 ? "username" : "different usernames"}
              {state.hit.usernames?.length > 0 && (
                <>
                  {" "}— including{" "}
                  {state.hit.usernames.map((u, i) => (
                    <span key={u}>
                      {i > 0 && ", "}
                      <span className="text-red-400">{u}</span>
                    </span>
                  ))}
                </>
              )}
              .
            </div>
          </div>
        )}

        {state.status === "done" && !state.hit && (
          <div role="status" className="border border-emerald-600/50 bg-emerald-500/5 rounded-lg p-3 space-y-1">
            <div className="text-emerald-200 font-semibold text-[0.85rem]">
              Not in this corpus.
            </div>
            <div className="text-[0.68rem] text-emerald-500">
              These are the passwords bots have actually thrown at one honeypot — not a
              measure of whether a password is strong or has leaked elsewhere.
            </div>
          </div>
        )}

        {state.status === "done" && (
          <p className="text-[0.58rem] text-emerald-800">
            Sent prefix <code className="text-emerald-600">{state.prefix}</code> — the server
            returned {formatNumber(state.candidates)}{" "}
            {state.candidates === 1 ? "hash" : "hashes"} sharing it, matched locally — it cannot
            tell which of them you were asking about.
          </p>
        )}
      </div>
    </section>
  );
};

export default memo(PasswordCheck);
