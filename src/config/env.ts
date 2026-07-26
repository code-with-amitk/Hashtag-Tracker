export interface AppConfig {
  databaseUrl: string;
  metaAccessToken: string;
  metaUserId: string;
  hashtagName: string;
  storageBasePath: string;
  port: number;
  syncMaxItems: number;
  metaPageLimit: number;
  cronRecentMedia: string;
}

const REQUIRED_VARS = [
  "DATABASE_URL",
  "META_ACCESS_TOKEN",
  "META_USER_ID",
] as const;

function parsePositiveInt(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  for (const key of REQUIRED_VARS) {
    if (!env[key]?.trim()) {
      throw new Error(`${key} is required`);
    }
  }

  const metaAccessToken = env.META_ACCESS_TOKEN!.trim();

  if (metaAccessToken.includes("|")) {
    console.warn(
      "META_ACCESS_TOKEN looks like an App ID|App Secret pair. " +
        "Use the Instagram Page access token from requrirements.md (starts with EAAM...)."
    );
  }

  return {
    databaseUrl: env.DATABASE_URL!.trim(),
    metaAccessToken,
    metaUserId: env.META_USER_ID!.trim(),
    hashtagName: env.HASHTAG_NAME?.trim() || "matcha",
    storageBasePath: env.STORAGE_BASE_PATH?.trim() || "./storage",
    port: env.PORT ? parsePositiveInt(env.PORT, "PORT") : 3000,
    syncMaxItems: env.SYNC_MAX_ITEMS
      ? parsePositiveInt(env.SYNC_MAX_ITEMS, "SYNC_MAX_ITEMS")
      : 500,
    metaPageLimit: env.META_PAGE_LIMIT
      ? parsePositiveInt(env.META_PAGE_LIMIT, "META_PAGE_LIMIT")
      : 10,
    cronRecentMedia: env.CRON_RECENT_MEDIA?.trim() || "0 */3 * * *",
  };
}
