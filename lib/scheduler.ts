import { appConfig } from "./config";
import { refreshFeeds } from "./rss";

const globalScheduler = globalThis as unknown as { aiRssSchedulerStarted?: boolean };

export function ensureScheduler() {
  if (globalScheduler.aiRssSchedulerStarted) return;
  globalScheduler.aiRssSchedulerStarted = true;

  const intervalMs = Math.max(5, appConfig.refreshIntervalMinutes) * 60 * 1000;
  setInterval(() => {
    refreshFeeds().catch((error) => {
      console.error("Scheduled RSS refresh failed", error);
    });
  }, intervalMs);
}
