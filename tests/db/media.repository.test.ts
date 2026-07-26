import { HashtagRepository } from "../../src/db/repositories/hashtag.repository";
import { MediaRepository } from "../../src/db/repositories/media.repository";
import { decodeMediaCursor } from "../../src/db/repositories/pagination";
import { CreateMediaInput } from "../../src/types";
import { getTestPool } from "../helpers/db";

describe("MediaRepository", () => {
  const mediaRepository = () => new MediaRepository(getTestPool());
  const hashtagRepository = () => new HashtagRepository(getTestPool());

  async function createHashtag() {
    return hashtagRepository().findOrCreate("matcha", "ig-hashtag-123");
  }

  function buildMediaInput(
    hashtagId: string,
    overrides: Partial<CreateMediaInput> = {}
  ): CreateMediaInput {
    return {
      instagramMediaId: "media-1",
      hashtagId,
      mediaType: "IMAGE",
      caption: "Matcha latte",
      permalink: "https://instagram.com/p/abc",
      mediaUrl: "https://cdn.example.com/media-1.jpg",
      likeCount: 10,
      commentsCount: 2,
      instagramTimestamp: new Date("2026-01-01T10:00:00.000Z"),
      source: "top",
      ...overrides,
    };
  }

  it("upsert inserts a new media record", async () => {
    const hashtag = await createHashtag();
    const result = await mediaRepository().upsert(buildMediaInput(hashtag.id));

    expect(result.inserted).toBe(true);
    expect(result.media.instagramMediaId).toBe("media-1");
    expect(result.media.likeCount).toBe(10);
  });

  it("upsert skips duplicate and updates engagement counts", async () => {
    const hashtag = await createHashtag();
    const first = await mediaRepository().upsert(buildMediaInput(hashtag.id));
    const second = await mediaRepository().upsert(
      buildMediaInput(hashtag.id, { likeCount: 25, commentsCount: 5 })
    );

    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
    expect(second.media.id).toBe(first.media.id);
    expect(second.media.likeCount).toBe(25);
    expect(second.media.commentsCount).toBe(5);
    expect(second.media.source).toBe("top");
  });

  it("findByInstagramId returns stored media", async () => {
    const hashtag = await createHashtag();
    const { media } = await mediaRepository().upsert(buildMediaInput(hashtag.id));

    const found = await mediaRepository().findByInstagramId("media-1");

    expect(found?.id).toBe(media.id);
  });

  it("findPaginated returns empty results when no media exists", async () => {
    const hashtag = await createHashtag();

    const page = await mediaRepository().findPaginated({
      hashtagId: hashtag.id,
      limit: 10,
    });

    expect(page.items).toEqual([]);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it("findPaginated returns media ordered by created_at desc", async () => {
    const hashtag = await createHashtag();
    const pool = getTestPool();

    await mediaRepository().upsert(
      buildMediaInput(hashtag.id, { instagramMediaId: "media-old" })
    );
    await pool.query("UPDATE media SET created_at = $1 WHERE instagram_media_id = $2", [
      "2026-01-01T10:00:00.000Z",
      "media-old",
    ]);

    await mediaRepository().upsert(
      buildMediaInput(hashtag.id, { instagramMediaId: "media-new" })
    );
    await pool.query("UPDATE media SET created_at = $1 WHERE instagram_media_id = $2", [
      "2026-01-02T10:00:00.000Z",
      "media-new",
    ]);

    const page = await mediaRepository().findPaginated({
      hashtagId: hashtag.id,
      limit: 10,
    });

    expect(page.items.map((item) => item.instagramMediaId)).toEqual([
      "media-new",
      "media-old",
    ]);
  });

  it("findPaginated supports cursor pagination", async () => {
    const hashtag = await createHashtag();
    const pool = getTestPool();

    for (const [mediaId, createdAt] of [
      ["media-1", "2026-01-03T10:00:00.000Z"],
      ["media-2", "2026-01-02T10:00:00.000Z"],
      ["media-3", "2026-01-01T10:00:00.000Z"],
    ] as const) {
      await mediaRepository().upsert(
        buildMediaInput(hashtag.id, { instagramMediaId: mediaId })
      );
      await pool.query(
        "UPDATE media SET created_at = $1 WHERE instagram_media_id = $2",
        [createdAt, mediaId]
      );
    }

    const firstPage = await mediaRepository().findPaginated({
      hashtagId: hashtag.id,
      limit: 2,
    });

    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.nextCursor).toBeTruthy();

    const secondPage = await mediaRepository().findPaginated({
      hashtagId: hashtag.id,
      limit: 2,
      cursor: firstPage.nextCursor ?? undefined,
    });

    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0].instagramMediaId).toBe("media-3");
    expect(secondPage.hasMore).toBe(false);

    const decoded = decodeMediaCursor(firstPage.nextCursor!);
    expect(decoded.id).toBe(firstPage.items[1].id);
  });
});
