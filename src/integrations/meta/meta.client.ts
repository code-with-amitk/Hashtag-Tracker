import {
  MetaAuthError,
  MetaNetworkError,
  MetaNotFoundError,
  MetaPermissionError,
  MetaRateLimitError,
  MetaApiError,
} from "./meta.errors";
import {
  MediaPage,
  MetaGraphErrorBody,
  MetaHashtagSearchResponse,
  MetaMediaApiItem,
  MetaMediaItem,
  MetaMediaResponse,
} from "./meta.types";

const DEFAULT_API_VERSION = "v24.0";
const DEFAULT_PAGE_LIMIT = 10;
const FULL_MEDIA_FIELDS =
  "id,media_type,timestamp,permalink,media_url,caption,like_count,comments_count";
const COMPACT_MEDIA_FIELDS =
  "id,media_type,timestamp,permalink,media_url,like_count,comments_count";
const MINIMAL_MEDIA_FIELDS =
  "id,media_type,timestamp,permalink,media_url";

export type FetchFn = (
  input: string | URL,
  init?: RequestInit
) => Promise<Response>;

export interface MetaClientConfig {
  accessToken: string;
  userId: string;
  apiVersion?: string;
  maxItemsPerSync?: number;
  pageLimit?: number;
  fetchFn?: FetchFn;
}

interface MediaFetchStrategy {
  fields?: string;
  limit: number;
}

export class MetaClient {
  private readonly accessToken: string;
  private readonly userId: string;
  private readonly apiVersion: string;
  private readonly maxItemsPerSync: number;
  private readonly pageLimit: number;
  private readonly fetchFn: FetchFn;

  constructor(config: MetaClientConfig) {
    this.accessToken = config.accessToken;
    this.userId = config.userId;
    this.apiVersion = config.apiVersion ?? DEFAULT_API_VERSION;
    this.maxItemsPerSync = config.maxItemsPerSync ?? 500;
    this.pageLimit = config.pageLimit ?? DEFAULT_PAGE_LIMIT;
    this.fetchFn = config.fetchFn ?? fetch;
  }

  async searchHashtag(name: string): Promise<string> {
    const url = this.buildUrl("/ig_hashtag_search", {
      user_id: this.userId,
      q: name,
    });

    const response = await this.request<MetaHashtagSearchResponse>(url);
    const hashtagId = response.data?.[0]?.id;

    if (!hashtagId) {
      throw new MetaNotFoundError(`Hashtag not found: ${name}`);
    }

    return hashtagId;
  }

  async fetchTopMedia(hashtagId: string, cursor?: string): Promise<MediaPage> {
    return this.fetchMediaPage(hashtagId, "top_media", cursor);
  }

  async fetchRecentMedia(hashtagId: string, cursor?: string): Promise<MediaPage> {
    return this.fetchMediaPage(hashtagId, "recent_media", cursor);
  }

  async fetchAllTopMedia(hashtagId: string): Promise<MetaMediaItem[]> {
    // Meta's top_media endpoint only accepts limit=1 for this API tier, and
    // further pages fail even with limit=1 — so we ingest the first page only.
    const page = await this.fetchTopMedia(hashtagId);
    return page.items.slice(0, this.maxItemsPerSync);
  }

  async fetchAllRecentMedia(hashtagId: string): Promise<MetaMediaItem[]> {
    return this.fetchAllMedia(hashtagId, (id, cursor) =>
      this.fetchRecentMedia(id, cursor)
    );
  }

  private async fetchAllMedia(
    hashtagId: string,
    fetchPage: (hashtagId: string, cursor?: string) => Promise<MediaPage>
  ): Promise<MetaMediaItem[]> {
    const items: MetaMediaItem[] = [];
    let cursor: string | undefined;

    while (items.length < this.maxItemsPerSync) {
      try {
        const page = await fetchPage(hashtagId, cursor);
        const remaining = this.maxItemsPerSync - items.length;
        items.push(...page.items.slice(0, remaining));

        if (!page.nextCursor || items.length >= this.maxItemsPerSync) {
          break;
        }

        cursor = page.nextCursor;
      } catch (error) {
        if (items.length > 0) {
          console.warn(
            `Stopping media pagination early after ${items.length} items:`,
            error instanceof Error ? error.message : error
          );
          break;
        }

        throw error;
      }
    }

    return items;
  }

  private async fetchMediaPage(
    hashtagId: string,
    mediaType: "top_media" | "recent_media",
    cursor?: string
  ): Promise<MediaPage> {
    if (mediaType === "top_media") {
      return this.fetchMediaPageRequest(hashtagId, mediaType, cursor, {
        fields: FULL_MEDIA_FIELDS,
        limit: 1,
      });
    }

    const strategies: MediaFetchStrategy[] = [
      { fields: FULL_MEDIA_FIELDS, limit: this.pageLimit },
      { fields: COMPACT_MEDIA_FIELDS, limit: Math.min(this.pageLimit, 10) },
      { fields: MINIMAL_MEDIA_FIELDS, limit: 5 },
    ];

    let lastError: unknown;

    for (const strategy of strategies) {
      try {
        return await this.fetchMediaPageRequest(
          hashtagId,
          mediaType,
          cursor,
          strategy
        );
      } catch (error) {
        if (isReduceDataError(error)) {
          lastError = error;
          console.warn(
            `Meta media fetch retry for ${mediaType} using smaller payload strategy`
          );
          continue;
        }
        throw error;
      }
    }

    throw lastError;
  }

  private async fetchMediaPageRequest(
    hashtagId: string,
    mediaType: "top_media" | "recent_media",
    cursor: string | undefined,
    strategy: MediaFetchStrategy
  ): Promise<MediaPage> {
    const params: Record<string, string> = {
      user_id: this.userId,
      limit: String(strategy.limit),
    };

    if (strategy.fields) {
      params.fields = strategy.fields;
    }

    if (cursor) {
      params.after = cursor;
    }

    const url = this.buildUrl(`/${hashtagId}/${mediaType}`, params);
    const response = await this.request<MetaMediaResponse>(url);

    return {
      items: (response.data ?? []).map(mapMediaItem),
      nextCursor: response.paging?.cursors?.after ?? null,
    };
  }

  private buildUrl(
    path: string,
    params: Record<string, string> = {}
  ): string {
    const url = new URL(
      `https://graph.facebook.com/${this.apiVersion}${path}`
    );

    url.searchParams.set("access_token", this.accessToken);

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    return url.toString();
  }

  private async request<T extends { error?: MetaGraphErrorBody }>(
    url: string
  ): Promise<T> {
    let response: Response;

    try {
      response = await this.fetchFn(url);
    } catch (error) {
      throw new MetaNetworkError("Failed to reach Meta Graph API", error);
    }

    let body: T;
    try {
      body = (await response.json()) as T;
    } catch (error) {
      throw new MetaNetworkError("Invalid JSON response from Meta Graph API", error);
    }

    if (body.error) {
      throw mapGraphError(body.error, response.status);
    }

    if (!response.ok) {
      throw new MetaApiError(
        `Meta Graph API request failed with status ${response.status}`,
        response.status
      );
    }

    return body;
  }
}

function mapMediaItem(item: MetaMediaApiItem): MetaMediaItem {
  if (!item.media_type || !item.timestamp || !item.permalink || !item.media_url) {
    throw new MetaApiError(
      "Meta media item is missing required fields after fetch/enrichment",
      502
    );
  }

  return {
    id: item.id,
    mediaType: item.media_type,
    timestamp: new Date(item.timestamp),
    permalink: item.permalink,
    mediaUrl: item.media_url,
    caption: item.caption ?? null,
    likeCount: item.like_count ?? 0,
    commentsCount: item.comments_count ?? 0,
  };
}

function isReduceDataError(error: unknown): boolean {
  return (
    error instanceof MetaApiError &&
    error.message.toLowerCase().includes("reduce the amount of data")
  );
}

function mapGraphError(
  error: MetaGraphErrorBody,
  statusCode: number
): MetaApiError {
  const message = error.message || "Meta Graph API error";

  if (statusCode === 401 || error.code === 190) {
    return new MetaAuthError(message, error.code);
  }

  if (
    statusCode === 403 ||
    error.code === 200 ||
    error.code === 10 ||
    message.toLowerCase().includes("permission")
  ) {
    return new MetaPermissionError(message, error.code);
  }

  if (statusCode === 429 || error.code === 4 || error.code === 17) {
    return new MetaRateLimitError(message, error.code);
  }

  return new MetaApiError(message, statusCode, error.code);
}
