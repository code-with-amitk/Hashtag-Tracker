import request from "supertest";
import { createApp } from "../../src/api/app";
import { HashtagRepository } from "../../src/db/repositories/hashtag.repository";
import { encodeMediaCursor } from "../../src/db/repositories/pagination";
import { MediaRepository } from "../../src/db/repositories/media.repository";
import { MediaService } from "../../src/services/media.service";
import { buildTestAppDependencies } from "../helpers/app-deps";
import { getTestPool } from "../helpers/db";

describe("GET /hashtags integration", () => {
  it("returns stored media from the database", async () => {
    const pool = getTestPool();
    const hashtagRepository = new HashtagRepository(pool);
    const mediaRepository = new MediaRepository(pool);
    const hashtag = await hashtagRepository.findOrCreate(
      "matcha",
      "ig-hashtag-integration"
    );

    await mediaRepository.upsert({
      instagramMediaId: "integration-media-old",
      hashtagId: hashtag.id,
      mediaType: "IMAGE",
      caption: "Older post",
      permalink: "https://instagram.com/p/old",
      mediaUrl: "https://cdn.example.com/old.jpg",
      likeCount: 1,
      commentsCount: 0,
      instagramTimestamp: new Date("2026-01-01T10:00:00.000Z"),
      source: "top",
    });

    await mediaRepository.upsert({
      instagramMediaId: "integration-media-new",
      hashtagId: hashtag.id,
      mediaType: "IMAGE",
      caption: "Newer post",
      permalink: "https://instagram.com/p/new",
      mediaUrl: "https://cdn.example.com/new.jpg",
      likeCount: 5,
      commentsCount: 1,
      instagramTimestamp: new Date("2026-01-02T10:00:00.000Z"),
      source: "recent",
    });

    await pool.query(
      "UPDATE media SET created_at = $1 WHERE instagram_media_id = $2",
      ["2026-01-01T12:00:00.000Z", "integration-media-old"]
    );
    await pool.query(
      "UPDATE media SET created_at = $1 WHERE instagram_media_id = $2",
      ["2026-01-03T12:00:00.000Z", "integration-media-new"]
    );

    const mediaService = new MediaService(
      mediaRepository,
      hashtagRepository,
      "matcha"
    );
    const app = createApp(
      buildTestAppDependencies({
        mediaService,
        hashtagRepository,
      })
    );

    const firstPage = await request(app).get("/hashtags").query({ limit: 1 });

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.data).toHaveLength(1);
    expect(firstPage.body.data[0].instagramMediaId).toBe(
      "integration-media-new"
    );
    expect(firstPage.body.pagination.hasMore).toBe(true);
    expect(firstPage.body.pagination.nextCursor).toBeTruthy();

    const secondPage = await request(app)
      .get("/hashtags")
      .query({
        limit: 1,
        cursor: firstPage.body.pagination.nextCursor,
      });

    expect(secondPage.status).toBe(200);
    expect(secondPage.body.data[0].instagramMediaId).toBe(
      "integration-media-old"
    );
    expect(secondPage.body.pagination.hasMore).toBe(false);

    const encodedCursor = encodeMediaCursor({
      createdAt: "2026-01-03T12:00:00.000Z",
      id: firstPage.body.data[0].id,
    });
    expect(firstPage.body.pagination.nextCursor).toBe(encodedCursor);
  });
});
