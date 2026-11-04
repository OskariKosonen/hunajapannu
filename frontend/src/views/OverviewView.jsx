import { memo } from "react";
import Panel from "../components/ui/Panel";
import { ErrorNotice, Skeleton, EmptyState } from "../components/ui/states";
import OverviewHero from "../components/OverviewHero";
import KpiStrip from "../components/KpiStrip";
import DayPanel from "../components/DayPanel";
import OriginsShare from "../components/OriginsShare";
import TechniquesPanel from "../components/TechniquesPanel";
import EventsPanel from "../components/EventsPanel";
import FeaturedAttack from "../components/FeaturedAttack";
import ErrorBoundary from "../components/common/ErrorBoundary";
import { useApi, buildUrl } from "../hooks/useApi";
import { useCatalogue } from "../hooks/useCatalogue";
import { API, PAGE_SIZE } from "../lib/api";
import { formatNumber } from "../lib/format";

/** A top-5 list; the → in its header opens the full view. */
const TopList = ({ title, rows, loading, error, errorLabel, label, value, onOpen, openLabel }) => {
  const max = Math.max(0, ...rows.map((r) => Number(value(r)) || 0));
  return (
    <Panel title={title} meta="All time" onOpen={onOpen} openLabel={openLabel} className="h-full">
      {rows.length === 0 ? (
        error ? (
          <ErrorNotice>
            {errorLabel}: {error}
          </ErrorNotice>
        ) : loading ? (
          <Skeleton rows={5} />
        ) : (
          <EmptyState title="Nothing yet." />
        )
      ) : (
        <ol className="space-y-2.5">
          {rows.map((r, i) => {
            const v = Number(value(r)) || 0;
            return (
              <li key={i} className="min-w-0">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{label(r)}</span>
                  <span className="shrink-0 tabular-nums text-fg-muted">{formatNumber(v)}</span>
                </div>
                <div className="mt-1 h-1 rounded-full bg-surface-3 overflow-hidden" aria-hidden="true">
                  <div className="h-full rounded-full bg-accent/60" style={{ width: `${max ? (v / max) * 100 : 0}%` }} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
};

/**
 * The landing view, top to bottom: what this is, the all-time scale, the
 * last day, a session to read, the live feed, and the leaderboards. Panels sit
 * on a tight 16px grid so a laptop screen shows the first live panels without
 * scrolling and the row below always peeks in.
 */
const OverviewView = ({ onOpenSession, onNavigate }) => {
  const { byId: mitreById, techniques } = useCatalogue();

  const summaryApi = useApi(API.SUMMARY);
  const trendApi = useApi(API.TRENDS);
  const featuredApi = useApi(API.FEATURED_SESSION);
  const eventsApi = useApi(buildUrl(API.LATEST_EVENTS, { limit: 12 }));
  const countriesApi = useApi(buildUrl(API.TOP_COUNTRIES, { limit: PAGE_SIZE.PREVIEW }));
  const credsApi = useApi(buildUrl(API.CREDENTIALS, { limit: PAGE_SIZE.PREVIEW }));
  const commandsApi = useApi(buildUrl(API.COMMANDS, { limit: PAGE_SIZE.PREVIEW }));

  const summary = summaryApi.raw;
  const summaryLoading = summaryApi.loading && !summary;

  // A quiet week 404s the featured session; let the feed take the full width
  // rather than leave a hole beside it.
  const hasFeatured = Boolean(featuredApi.raw?.session) || (featuredApi.loading && !featuredApi.error);

  return (
    <div className="space-y-4">
      <ErrorBoundary name="Introduction">
        <OverviewHero onNavigate={onNavigate} />
      </ErrorBoundary>

      {summaryApi.error && !summary && <ErrorNotice>Failed to load summary: {summaryApi.error}</ErrorNotice>}

      <ErrorBoundary name="All-time figures">
        <KpiStrip summary={summary} loading={summaryLoading} />
      </ErrorBoundary>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
        <ErrorBoundary name="Last 24 hours">
          <DayPanel
            summary={summary}
            summaryLoading={summaryLoading}
            trend={trendApi.rows}
            trendLoading={trendApi.loading}
            trendError={trendApi.error}
            onNavigate={onNavigate}
          />
        </ErrorBoundary>
        <ErrorBoundary name="Attack origins">
          <OriginsShare
            countries={countriesApi.rows}
            lifetimeEvents={summary?.lifetimeEvents}
            loading={countriesApi.loading || summaryLoading}
            error={countriesApi.error}
            onOpen={() => onNavigate("origins")}
          />
        </ErrorBoundary>
      </div>

      <div className={hasFeatured ? "grid gap-4 xl:grid-cols-2" : ""}>
        {hasFeatured && (
          <ErrorBoundary name="Featured session">
            <FeaturedAttack
              // Remount on a new session so the replay restarts from the top.
              key={featuredApi.raw?.session?.session_id || "none"}
              data={featuredApi.raw}
              loading={featuredApi.loading}
              error={featuredApi.error}
              mitreById={mitreById}
              onOpenFull={onOpenSession}
            />
          </ErrorBoundary>
        )}
        <ErrorBoundary name="Live events">
          <EventsPanel
            compact
            events={eventsApi.rows}
            eventLimit={12}
            loading={eventsApi.loading}
            error={eventsApi.error}
            onOpenSession={onOpenSession}
            onViewAll={() => onNavigate("activity")}
          />
        </ErrorBoundary>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ErrorBoundary name="Top credentials">
          <TopList
            title="Top credentials"
            rows={credsApi.rows}
            loading={credsApi.loading}
            error={credsApi.error}
            errorLabel="Failed to load credentials"
            label={(r) => (
              <span className="font-mono text-[0.8125rem]">
                <span className="text-fg">{r.username}</span>
                <span className="text-fg-subtle"> / </span>
                <span className="text-danger">{r.password}</span>
              </span>
            )}
            value={(r) => r.total}
            onOpen={() => onNavigate("credentials")}
            openLabel="Open credentials"
          />
        </ErrorBoundary>
        <ErrorBoundary name="Top commands">
          <TopList
            title="Top commands"
            rows={commandsApi.rows}
            loading={commandsApi.loading}
            error={commandsApi.error}
            errorLabel="Failed to load commands"
            label={(r) => (
              <span className="font-mono text-[0.8125rem] text-fg" title={r.command}>
                {r.command}
              </span>
            )}
            value={(r) => r.total}
            onOpen={() => onNavigate("commands")}
            openLabel="Open commands"
          />
        </ErrorBoundary>
        <ErrorBoundary name="Techniques observed">
          <TechniquesPanel
            counts={commandsApi.raw?.counts}
            techniques={techniques}
            loading={commandsApi.loading}
            error={commandsApi.error}
            onOpen={() => onNavigate("commands")}
          />
        </ErrorBoundary>
      </div>
    </div>
  );
};

export default memo(OverviewView);
