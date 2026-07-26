import path from "path";
import { FetchFn } from "../integrations/meta/meta.client";
import {
  StorageInterface,
  buildMediaStorageKey,
} from "../infrastructure/storage";

export class AssetDownloadError extends Error {
  constructor(
    message: string,
    public readonly mediaId: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "AssetDownloadError";
  }
}

export class AssetService {
  constructor(
    private readonly storage: StorageInterface,
    private readonly fetchFn: FetchFn = fetch
  ) {}

  async downloadAndStore(options: {
    hashtagName: string;
    mediaId: string;
    mediaUrl: string;
    mediaType: string;
  }): Promise<string> {
    const { hashtagName, mediaId, mediaUrl, mediaType } = options;

    let response: Response;
    try {
      response = await this.fetchFn(mediaUrl);
    } catch (error) {
      throw new AssetDownloadError(
        `Failed to download media ${mediaId}`,
        mediaId,
        error
      );
    }

    if (!response.ok) {
      throw new AssetDownloadError(
        `Failed to download media ${mediaId}: HTTP ${response.status}`,
        mediaId
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const extension = inferExtension(mediaType, mediaUrl);
    const key = buildMediaStorageKey(hashtagName, mediaId, extension);

    return this.storage.upload(key, buffer);
  }
}

function inferExtension(mediaType: string, mediaUrl: string): string {
  try {
    const urlExtension = path.extname(new URL(mediaUrl).pathname).slice(1);
    if (urlExtension) {
      return urlExtension;
    }
  } catch {
    // Fall through to media type defaults.
  }

  if (mediaType === "VIDEO") {
    return "mp4";
  }

  return "jpg";
}
