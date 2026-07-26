import { loadConfig } from "../../src/config";

describe("loadConfig", () => {
  const validEnv: NodeJS.ProcessEnv = {
    DATABASE_URL: "postgresql://localhost:5432/hashtag_tracker",
    META_ACCESS_TOKEN: "test-token",
    META_USER_ID: "17841413741308252",
  };

  it("loads required environment variables", () => {
    const config = loadConfig(validEnv);

    expect(config.databaseUrl).toBe(validEnv.DATABASE_URL);
    expect(config.metaAccessToken).toBe(validEnv.META_ACCESS_TOKEN);
    expect(config.metaUserId).toBe(validEnv.META_USER_ID);
  });

  it("applies defaults for optional variables", () => {
    const config = loadConfig(validEnv);

    expect(config.hashtagName).toBe("matcha");
    expect(config.storageBasePath).toBe("./storage");
    expect(config.port).toBe(3000);
    expect(config.syncMaxItems).toBe(500);
    expect(config.cronRecentMedia).toBe("0 */3 * * *");
  });

  it("uses provided optional overrides", () => {
    const config = loadConfig({
      ...validEnv,
      HASHTAG_NAME: "coffee",
      STORAGE_BASE_PATH: "/tmp/storage",
      PORT: "4000",
      SYNC_MAX_ITEMS: "100",
      CRON_RECENT_MEDIA: "0 */1 * * *",
    });

    expect(config.hashtagName).toBe("coffee");
    expect(config.storageBasePath).toBe("/tmp/storage");
    expect(config.port).toBe(4000);
    expect(config.syncMaxItems).toBe(100);
    expect(config.cronRecentMedia).toBe("0 */1 * * *");
  });

  it.each([
    "DATABASE_URL",
    "META_ACCESS_TOKEN",
    "META_USER_ID",
  ] as const)("throws when %s is missing", (key) => {
    const env = { ...validEnv };
    delete env[key];

    expect(() => loadConfig(env)).toThrow(`${key} is required`);
  });

  it.each([
    "DATABASE_URL",
    "META_ACCESS_TOKEN",
    "META_USER_ID",
  ] as const)("throws when %s is blank", (key) => {
    expect(() => loadConfig({ ...validEnv, [key]: "   " })).toThrow(
      `${key} is required`
    );
  });

  it("throws when PORT is not a positive integer", () => {
    expect(() => loadConfig({ ...validEnv, PORT: "abc" })).toThrow(
      "PORT must be a positive integer"
    );
    expect(() => loadConfig({ ...validEnv, PORT: "0" })).toThrow(
      "PORT must be a positive integer"
    );
  });

  it("throws when SYNC_MAX_ITEMS is not a positive integer", () => {
    expect(() => loadConfig({ ...validEnv, SYNC_MAX_ITEMS: "-1" })).toThrow(
      "SYNC_MAX_ITEMS must be a positive integer"
    );
  });
});
