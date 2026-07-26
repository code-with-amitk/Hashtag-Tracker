import {
  MetaAuthError,
  MetaClient,
  MetaNotFoundError,
  MetaPermissionError,
  MetaRateLimitError,
  FetchFn,
} from "../../src/integrations/meta";

const ACCESS_TOKEN = "test-token";
const USER_ID = "17841413741308252";

function createMockFetch(
  handlers: Array<(url: string) => Response | Promise<Response>>
): FetchFn {
  let callIndex = 0;

  return async (input) => {
    const url = String(input);
    const handler = handlers[callIndex] ?? handlers[handlers.length - 1];
    callIndex += 1;
    return handler(url);
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function buildMediaItem(id: string) {
  return {
    id,
    media_type: "IMAGE",
    timestamp: "2026-01-01T10:00:00+0000",
    permalink: `https://instagram.com/p/${id}`,
    media_url: `https://cdn.example.com/${id}.jpg`,
    caption: `Caption for ${id}`,
    like_count: 10,
    comments_count: 2,
  };
}

describe("MetaClient", () => {
  it("searchHashtag parses the hashtag id from the response", async () => {
    const client = new MetaClient({
      accessToken: ACCESS_TOKEN,
      userId: USER_ID,
      fetchFn: createMockFetch([
        () =>
          jsonResponse({
            data: [{ id: "178438123456789" }],
          }),
      ]),
    });

    const hashtagId = await client.searchHashtag("matcha");

    expect(hashtagId).toBe("178438123456789");
  });

  it("searchHashtag throws MetaNotFoundError when hashtag is missing", async () => {
    const client = new MetaClient({
      accessToken: ACCESS_TOKEN,
      userId: USER_ID,
      fetchFn: createMockFetch([() => jsonResponse({ data: [] })]),
    });

    await expect(client.searchHashtag("unknown")).rejects.toBeInstanceOf(
      MetaNotFoundError
    );
  });

  it("fetchTopMedia returns a single page of mapped media", async () => {
    const client = new MetaClient({
      accessToken: ACCESS_TOKEN,
      userId: USER_ID,
      fetchFn: createMockFetch([
        () =>
          jsonResponse({
            data: [buildMediaItem("media-1"), buildMediaItem("media-2")],
            paging: {
              cursors: { after: "cursor-abc" },
            },
          }),
      ]),
    });

    const page = await client.fetchTopMedia("178438123456789");

    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({
      id: "media-1",
      mediaType: "IMAGE",
      caption: "Caption for media-1",
      likeCount: 10,
      commentsCount: 2,
    });
    expect(page.items[0].timestamp).toBeInstanceOf(Date);
    expect(page.nextCursor).toBe("cursor-abc");
  });

  it("fetchRecentMedia passes cursor to subsequent requests", async () => {
    const requestedUrls: string[] = [];
    const client = new MetaClient({
      accessToken: ACCESS_TOKEN,
      userId: USER_ID,
      fetchFn: async (input) => {
        requestedUrls.push(String(input));
        return jsonResponse({
          data: [buildMediaItem("media-recent")],
          paging: { cursors: {} },
        });
      },
    });

    await client.fetchRecentMedia("178438123456789", "cursor-xyz");

    expect(requestedUrls[0]).toContain("/178438123456789/recent_media");
    expect(requestedUrls[0]).toContain("after=cursor-xyz");
  });

  it("fetchAllTopMedia only requests the first page because Meta top_media is single-item", async () => {
    const client = new MetaClient({
      accessToken: ACCESS_TOKEN,
      userId: USER_ID,
      pageLimit: 2,
      fetchFn: createMockFetch([
        () =>
          jsonResponse({
            data: [buildMediaItem("media-1"), buildMediaItem("media-2")],
            paging: { cursors: { after: "page-2" } },
          }),
        () => {
          throw new Error("Should not request a second page");
        },
      ]),
    });

    const items = await client.fetchAllTopMedia("178438123456789");

    expect(items.map((item) => item.id)).toEqual(["media-1", "media-2"]);
  });

  it("fetchAllRecentMedia aggregates multiple pages", async () => {
    const client = new MetaClient({
      accessToken: ACCESS_TOKEN,
      userId: USER_ID,
      pageLimit: 2,
      fetchFn: createMockFetch([
        () =>
          jsonResponse({
            data: [buildMediaItem("media-1"), buildMediaItem("media-2")],
            paging: { cursors: { after: "page-2" } },
          }),
        () =>
          jsonResponse({
            data: [buildMediaItem("media-3")],
            paging: { cursors: {} },
          }),
      ]),
    });

    const items = await client.fetchAllRecentMedia("178438123456789");

    expect(items.map((item) => item.id)).toEqual([
      "media-1",
      "media-2",
      "media-3",
    ]);
  });

  it("fetchAllRecentMedia stops at the configured max items cap", async () => {
    const client = new MetaClient({
      accessToken: ACCESS_TOKEN,
      userId: USER_ID,
      maxItemsPerSync: 3,
      pageLimit: 2,
      fetchFn: createMockFetch([
        () =>
          jsonResponse({
            data: [buildMediaItem("media-1"), buildMediaItem("media-2")],
            paging: { cursors: { after: "page-2" } },
          }),
        () =>
          jsonResponse({
            data: [
              buildMediaItem("media-3"),
              buildMediaItem("media-4"),
              buildMediaItem("media-5"),
            ],
            paging: { cursors: { after: "page-3" } },
          }),
        () => {
          throw new Error("Should not request a third page");
        },
      ]),
    });

    const items = await client.fetchAllRecentMedia("178438123456789");

    expect(items).toHaveLength(3);
    expect(items.map((item) => item.id)).toEqual([
      "media-1",
      "media-2",
      "media-3",
    ]);
  });

  it("maps 401 responses to MetaAuthError", async () => {
    const client = new MetaClient({
      accessToken: ACCESS_TOKEN,
      userId: USER_ID,
      fetchFn: createMockFetch([
        () =>
          jsonResponse(
            {
              error: {
                message: "Invalid OAuth access token",
                code: 190,
              },
            },
            401
          ),
      ]),
    });

    await expect(client.searchHashtag("matcha")).rejects.toBeInstanceOf(
      MetaAuthError
    );
  });

  it("maps 403 permission errors to MetaPermissionError", async () => {
    const client = new MetaClient({
      accessToken: ACCESS_TOKEN,
      userId: USER_ID,
      fetchFn: createMockFetch([
        () =>
          jsonResponse(
            {
              error: {
                message:
                  "(#200) Requires instagram_basic permission to manage the object",
                code: 200,
              },
            },
            403
          ),
      ]),
    });

    await expect(client.searchHashtag("matcha")).rejects.toBeInstanceOf(
      MetaPermissionError
    );
  });

  it("fetchTopMedia uses limit=1 because Meta top_media rejects larger pages", async () => {
    const requestedUrls: string[] = [];
    const client = new MetaClient({
      accessToken: ACCESS_TOKEN,
      userId: USER_ID,
      pageLimit: 25,
      fetchFn: async (input) => {
        requestedUrls.push(String(input));
        return jsonResponse({
          data: [buildMediaItem("media-1")],
          paging: { cursors: { after: "cursor-abc" } },
        });
      },
    });

    const page = await client.fetchTopMedia("178438123456789");

    expect(page.items).toHaveLength(1);
    expect(requestedUrls[0]).toContain("limit=1");
    expect(requestedUrls[0]).toContain("/top_media");
  });

  it("fetchRecentMedia retries with a smaller payload when Meta asks to reduce data", async () => {
    const requestedUrls: string[] = [];
    const client = new MetaClient({
      accessToken: ACCESS_TOKEN,
      userId: USER_ID,
      pageLimit: 25,
      fetchFn: async (input) => {
        const url = String(input);
        requestedUrls.push(url);

        if (url.includes("/recent_media") && url.includes("limit=25")) {
          return jsonResponse(
            {
              error: {
                message:
                  "Please reduce the amount of data you're asking for, then retry your request",
                code: 1,
              },
            },
            400
          );
        }

        return jsonResponse({
          data: [buildMediaItem("media-1")],
          paging: { cursors: {} },
        });
      },
    });

    const page = await client.fetchRecentMedia("178438123456789");

    expect(page.items).toHaveLength(1);
    expect(page.items[0].id).toBe("media-1");
    expect(requestedUrls).toHaveLength(2);
    expect(requestedUrls[0]).toContain("limit=25");
    expect(requestedUrls[1]).toContain("limit=10");
    expect(requestedUrls[1]).not.toContain("caption");
  });

  it("maps 429 responses to MetaRateLimitError", async () => {
    const client = new MetaClient({
      accessToken: ACCESS_TOKEN,
      userId: USER_ID,
      fetchFn: createMockFetch([
        () =>
          jsonResponse(
            {
              error: {
                message: "Application request limit reached",
                code: 4,
              },
            },
            429
          ),
      ]),
    });

    await expect(client.fetchTopMedia("178438123456789")).rejects.toBeInstanceOf(
      MetaRateLimitError
    );
  });
});
