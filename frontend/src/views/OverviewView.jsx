import { memo } from "react";
import Panel from "../components/ui/Panel";
import Button from "../components/ui/Button";
import { ErrorNotice, Skeleton, EmptyState } from "../components/ui/states";
import { ChevronRightIcon } from "../components/ui/icons";
import OverviewHero from "../components/OverviewHero";
import DayPanel from "../components/DayPanel";
import EventsPanel from "../components/EventsPanel";
import FeaturedAttack from "../components/FeaturedAttack";
import ErrorBoundary from "../components/common/ErrorBoundary";
import { useApi, buildUrl } from "../hooks/useApi";
import { useCatalogue } from "../hooks/useCatalogue";
import { API, PAGE_SIZE } from "../lib/api";
import { countryFlag, countryName, formatNumber } from "../lib/format";

/** A top-5 list with a link through to the full view. */
const TopList = ({ title, rows, loading, error, errorLabel, label, value, onViewAll, viewAllLabel }) => {
  const max = Math.max(0, ...rows.map((r) => Number(value(r)) || 0));
  return (
    <Panel
      title={title}
      meta="All time"
      actions={
        <Button variant="ghost" onClick={onViewAll} aria-label={viewAllLabel}>
          View all
          <ChevronRightIcon size={13} />
        </Button>
      }
    >
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

const OverviewView = ({ onOpenSession, onNavigate }) => {
  const { byId: mitreById } = useCatalogue();

  const summaryApi = useApi(API.SUMMARY);
  const trendApi = useApi(API.TRENDS);
  const featuredApi = useApi(API.FEATURED_SESSION);
  const eventsApi = useApi(buildUrl(API.LATEST_EVENTS, { limit: 12 }));
  const countriesApi = useApi(buildUrl(API.TOP_COUNTRIES, { limit: PAGE_SIZE.PREVIEW }));
  const credsApi = useApi(buildUrl(API.CREDENTIALS, { limit: PAGE_SIZE.PREVIEW }));
  const commandsApi = useApi(buildUrl(API.COMMANDS, { limit: PAGE_SIZE.PREVIEW }));

  const summaryLoading = summaryApi.loading && !summaryApi.raw;

  // A quiet week 404s the featured session; let the feed take the full width
  // rather than leave a hole beside it.
  const hasFeatured = Boolean(featuredApi.raw?.session) || (featuredApi.loading && !featuredApi.error);

  return (
    <div className="space-y-5 sm:space-y-6">
      <ErrorBoundary name="Introduction">
        <OverviewHero summary={summaryApi.raw} loading={summaryLoading} onNavigate={onNavigate} />
      </ErrorBoundary>

      {summaryApi.error && !summaryApi.raw && (
        <ErrorNotice>Failed to load summary: {summaryApi.error}</ErrorNotice>
      )}

      <ErrorBoundary name="Last 24 hours">
        <DayPanel
          summary={summaryApi.raw}
          summaryLoading={summaryLoading}
          trend={trendApi.rows}
          trendLoading={trendApi.loading}
          trendError={trendApi.error}
          onNavigate={onNavigate}
        />
      </ErrorBoundary>

      <div className={hasFeatured ? "grid gap-5 sm:gap-6 xl:grid-cols-2 xl:items-start" : ""}>
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

      <div className="grid gap-5 sm:gap-6 lg:grid-cols-3">
        <ErrorBoundary name="Top countries">
          <TopList
            title="Top countries"
            rows={countriesApi.rows}
            loading={countriesApi.loading}
            error={countriesApi.error}
            errorLabel="Failed to load countries"
            label={(r) => (
              <>
                <span aria-hidden="true" className="mr-2">{countryFlag(r.country_iso)}</span>
                <span className="text-fg">{countryName(r.country_iso)}</span>
              </>
            )}
            value={(r) => r.total}
            onViewAll={() => onNavigate("origins")}
            viewAllLabel="View all origins"
          />
        </ErrorBoundary>
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
            onViewAll={() => onNavigate("credentials")}
            viewAllLabel="View all credentials"
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
            onViewAll={() => onNavigate("commands")}
            viewAllLabel="View all commands"
          />
        </ErrorBoundary>
      </div>
    </div>
  );
};

export default memo(OverviewView);
