import { memo } from "react";
import EventsPanel from "../components/EventsPanel";
import TrendPanel from "../components/TrendPanel";
import ErrorBoundary from "../components/common/ErrorBoundary";
import { useApi, buildUrl } from "../hooks/useApi";
import { API, PAGE_SIZE } from "../lib/api";

const ActivityView = ({ onOpenSession }) => {
  const eventsApi = useApi(buildUrl(API.LATEST_EVENTS, { limit: PAGE_SIZE.EVENTS }));
  const trendApi = useApi(API.TRENDS);

  return (
    <div className="space-y-5 sm:space-y-6">
      <ErrorBoundary name="Events per hour">
        <TrendPanel trend={trendApi.rows} trendError={trendApi.error} trendLoading={trendApi.loading} height={140} />
      </ErrorBoundary>
      <ErrorBoundary name="Live events">
        <EventsPanel
          events={eventsApi.rows}
          eventLimit={PAGE_SIZE.EVENTS}
          loading={eventsApi.loading}
          error={eventsApi.error}
          onOpenSession={onOpenSession}
        />
      </ErrorBoundary>
    </div>
  );
};

export default memo(ActivityView);
