export const appConfig = {
  adminPassword: process.env.ADMIN_PASSWORD || "change-me",
  sessionSecret: process.env.SESSION_SECRET || "replace-with-a-long-random-secret",
  cookieSecure: (process.env.COOKIE_SECURE || "false").toLowerCase() === "true",
  refreshIntervalMinutes: Number(process.env.REFRESH_INTERVAL_MINUTES || 30),
  publicFeed: (process.env.PUBLIC_FEED || "false").toLowerCase() === "true",
  ai: {
    apiKey: process.env.AI_API_KEY || "",
    baseUrl: process.env.AI_BASE_URL || "https://api.openai.com/v1",
    model: process.env.AI_MODEL || "gpt-4.1-mini",
    timeoutSeconds: Number(process.env.AI_TIMEOUT_SECONDS || 30)
  }
};

export function isAiConfigured() {
  return Boolean(appConfig.ai.apiKey);
}
