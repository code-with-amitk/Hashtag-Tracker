import request from "supertest";
import { createApp } from "../../src/api/app";
import { MediaService } from "../../src/services/media.service";
import { Media } from "../../src/types";
import { buildTestAppDependencies } from "../helpers/app-deps";

function buildMedia(overrides: Partial<Media> = {}): Media {
  return {
    id: "media-uuid-1",
    instagramMediaId: "ig-media-1",
    hashtagId: "hashtag-uuid",
    mediaType: "IMAGE",
    caption: "Matcha",
    permalink: "https://instagram.com/p/abc",
    mediaUrl: "https://cdn.example.com/1.jpg",
    storedAssetPath: "/storage/matcha/ig-media-1.jpg",
    likeCount: 10,
    commentsCount: 2,
    instagramTimestamp: new Date("2026-01-01T10:00:00.000Z"),
    source: "top",
    createdAt: new Date("2026-01-02T10:00:00.000Z"),
    updatedAt: new Date("2026-01-02T10:00:00.000Z"),
    ...overrides,
  };
}

describe("GET /hashtags", () => {
  function createTestApp(listResult?: {
    items: Media[];
    nextCursor: string | null;
    hasMore: boolean;
  }) {
    const mediaService = {
      listHashtagMedia: jest.fn().mockResolvedValue(
        listResult ?? {
          items: [buildMedia()],
          nextCursor: "next-cursor",
          hasMore: true,
        }
      ),
    } as unknown as MediaService;

    return {
      app: createApp(
        buildTestAppDependencies({
          mediaService,
        })
      ),
      mediaService,
    };
  }

  it("returns 200 with paginated media data", async () => {
    const { app, mediaService } = createTestApp();
    const response = await request(app).get("/hashtags");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      id: "media-uuid-1",
      instagramMediaId: "ig-media-1",
      mediaType: "IMAGE",
      likeCount: 10,
      createdAt: "2026-01-02T10:00:00.000Z",
    });
    expect(response.body.pagination).toEqual({
      nextCursor: "next-cursor",
      hasMore: true,
    });
    expect(mediaService.listHashtagMedia).toHaveBeenCalledWith({
      limit: 20,
      cursor: undefined,
    });
  });

  it("passes limit and cursor query params to the service", async () => {
    const cursor = Buffer.from(
      JSON.stringify({
        createdAt: "2026-01-01T00:00:00.000Z",
        id: "uuid",
      })
    ).toString("base64url");

    const { app, mediaService } = createTestApp({
      items: [],
      nextCursor: null,
      hasMore: false,
    });

    await request(app).get("/hashtags").query({ limit: 10, cursor });

    expect(mediaService.listHashtagMedia).toHaveBeenCalledWith({
      limit: 10,
      cursor,
    });
  });

  it("returns 400 when limit exceeds maximum", async () => {
    const { app } = createTestApp();

    const response = await request(app).get("/hashtags").query({ limit: 101 });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/limit must be an integer/);
  });

  it("returns 400 for an invalid cursor", async () => {
    const { app } = createTestApp();

    const response = await request(app)
      .get("/hashtags")
      .query({ cursor: "not-a-valid-cursor" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid cursor");
  });

  it("returns media ordered by createdAt descending from the service", async () => {
    const newer = buildMedia({
      id: "newer",
      createdAt: new Date("2026-01-03T10:00:00.000Z"),
    });
    const older = buildMedia({
      id: "older",
      instagramMediaId: "ig-media-2",
      createdAt: new Date("2026-01-01T10:00:00.000Z"),
    });

    const { app } = createTestApp({
      items: [newer, older],
      nextCursor: null,
      hasMore: false,
    });

    const response = await request(app).get("/hashtags");

    expect(response.body.data.map((item: { id: string }) => item.id)).toEqual([
      "newer",
      "older",
    ]);
  });
});

describe("GET /health", () => {
  it("returns ok status", async () => {
    const mediaService = {
      listHashtagMedia: jest.fn(),
    } as unknown as MediaService;

    const response = await request(
      createApp(buildTestAppDependencies({ mediaService }))
    ).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});
