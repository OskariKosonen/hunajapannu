import { memo } from "react";
import LoadingSkeleton from "./common/LoadingSkeleton";
import ScrollShadow from "./common/ScrollShadow";
import SearchBox from "./common/SearchBox";

/**
 * Where the traffic comes from, at two granularities.
 *
 * Countries and ASNs were separate panels sitting at the bottom of a column of
 * nine. They answer the same question — where is this coming from — at
 * different resolutions, and neither is the most differentiated content here,
 * so between them they were taking two full slots to say one thing. One panel,
 * one toggle.
 *
 * Formatting numbers matters more here than elsewhere: these are the only
 * columns on the page where a reader compares magnitudes across rows, and
 * "1548513" against "441665" is much harder to rank at a glance than
 * "1,548,513" against "441,665".
 */

const TABS = [
  { id: "countries", label: "Countries" },
  { id: "asn", label: "Networks" },
];

const OriginsPanel = ({
  view,
  onView,
  topCountries,
  countriesError,
  countriesLoading,
  countryFlag,
  topAsn,
  asnError,
  asnLoading,
  asnTotal,
  search,
  onSearch,
  pageSize,
  formatNumber,
  isMobile,
}) => {
  const isAsn = view === "asn";
  const rows = isAsn ? topAsn : topCountries;
  const error = isAsn ? asnError : countriesError;
  const loading = isAsn ? asnLoading : countriesLoading;

  return (
    <section className="relative overflow-hidden border border-emerald-700/50 rounded-xl bg-slate-950/70 shadow-[0_10px_35px_rgba(0,0,0,0.45)] backdrop-blur-sm min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-950/70 border-b border-emerald-800/60">
        <span className="text-[0.68rem] uppercase tracking-[0.18em] px-2 py-1 rounded-full border border-emerald-600/60 text-emerald-200 bg-emerald-500/5">
          Origins
        </span>
        <div className="flex items-center gap-1" role="group" aria-label="Origin granularity">
          {TABS.map((t) => {
            // Merging two panels into one hid half the errors: a failure in the
            // view you are not looking at used to have its own panel to report
            // in. Mark the tab so it stays discoverable.
            const failed = t.id === "asn" ? Boolean(asnError) : Boolean(countriesError);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onView(t.id)}
                aria-pressed={view === t.id}
                className={`px-2.5 py-1 rounded-md border text-[0.66rem] transition ${
                  view === t.id
                    ? "border-emerald-400 text-emerald-100 bg-emerald-500/15"
                    : "border-emerald-800/70 text-emerald-500 hover:border-emerald-600"
                }`}
              >
                {t.label}
                {failed && (
                  <span className="text-red-400 ml-1" title={`Failed to load ${t.label.toLowerCase()}`}>
                    !
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-4 sm:p-5 text-[0.72rem] sm:text-[0.78rem] leading-tight">
        {error && rows.length === 0 && (
          <div className="text-[0.6rem] text-red-400 border border-red-500/50 rounded px-2 py-1 mb-2">
            Failed to load {isAsn ? "networks" : "geo"}: {error}
          </div>
        )}

        {/* Only the ASN view is searchable server-side; countries are 153 rows
            and arrive whole, so a search box there would be decoration. */}
        {isAsn && (
          <div className="mb-3">
            <SearchBox
              value={search}
              onChange={onSearch}
              placeholder="Search network or AS number…"
              resultLabel={asnTotal ? `${formatNumber(asnTotal)} networks` : null}
            />
          </div>
        )}

        {loading && rows.length === 0 ? (
          <LoadingSkeleton />
        ) : rows.length === 0 ? (
          !error && (
            <div className="text-[0.6rem] text-emerald-500">
              {isAsn && search ? "No networks match that search." : "No origin data yet."}
            </div>
          )
        ) : isMobile && isAsn ? (
          <div className="grid grid-cols-1 gap-2.5">
            {topAsn.map((row, idx) => (
              <div
                key={`${row.asn}-${idx}`}
                className="border border-emerald-800/70 rounded-lg bg-slate-950/85 p-3 space-y-1.5"
              >
                <div className="text-[0.8rem] text-emerald-100">AS{row.asn || "?"}</div>
                <div className="text-[0.68rem] text-emerald-300 truncate">
                  {row.org || "Unknown"}
                </div>
                <div className="flex items-center justify-between text-[0.7rem] text-emerald-200">
                  <span>Events</span>
                  <span className="font-semibold tabular-nums">{formatNumber(row.total)}</span>
                </div>
                <div className="flex items-center justify-between text-[0.7rem] text-emerald-200">
                  <span>IPs</span>
                  <span className="font-semibold tabular-nums">{formatNumber(row.unique_ips)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <ScrollShadow className="max-h-[16.5rem] overflow-y-auto border border-emerald-800/70 rounded-lg">
            <table className="w-full text-[0.68rem] sm:text-[0.72rem]">
              <thead className="bg-slate-950 sticky top-0 z-10 border-b border-emerald-800/70">
                <tr>
                  <th className="px-2.5 py-1.5 text-left font-semibold text-emerald-100 bg-slate-950">
                    {isAsn ? "ASN / Org" : "Country"}
                  </th>
                  <th className="px-2.5 py-1.5 text-right font-semibold text-emerald-100 bg-slate-950">
                    Events
                  </th>
                  <th className="px-2.5 py-1.5 text-right font-semibold text-emerald-100 bg-slate-950">
                    IPs
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-900/70 bg-slate-950/80">
                {rows.map((row, idx) => (
                  <tr
                    key={isAsn ? `${row.asn}-${idx}` : `${row.country_iso}-${idx}`}
                    className="hover:bg-emerald-900/15 odd:bg-slate-950/50 transition-colors"
                  >
                    <td className="px-2.5 py-1.5 text-emerald-200 whitespace-nowrap">
                      {isAsn ? (
                        <div className="flex flex-col leading-tight">
                          <span className="text-emerald-100">AS{row.asn || "?"}</span>
                          <span className="text-emerald-500 truncate">
                            {row.org || "Unknown"}
                          </span>
                        </div>
                      ) : (
                        <>
                          <span className="mr-1" aria-hidden="true">
                            {countryFlag(row.country_iso)}
                          </span>
                          {row.country_iso}
                        </>
                      )}
                    </td>
                    <td className="px-2.5 py-1.5 text-right text-emerald-200 tabular-nums">
                      {formatNumber(row.total)}
                    </td>
                    <td className="px-2.5 py-1.5 text-right text-emerald-200 tabular-nums">
                      {formatNumber(row.unique_ips)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollShadow>
        )}

        <p className="text-[0.68rem] text-emerald-400 mt-2">
          {isAsn ? "/api/public/cowrie/top-asn" : "/api/public/cowrie/top-countries"}
          {isAsn && asnTotal > topAsn.length && (
            <span className="text-emerald-600">
              {" "}· showing top {Math.min(pageSize, topAsn.length)} of {formatNumber(asnTotal)}
            </span>
          )}
        </p>
      </div>
    </section>
  );
};

export default memo(OriginsPanel);
