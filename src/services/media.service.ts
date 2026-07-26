import { HashtagRepository } from "../db/repositories/hashtag.repository";
import { MediaRepository } from "../db/repositories/media.repository";
import { PaginatedMediaResult } from "../types";

export class MediaService {
  constructor(
    private readonly mediaRepository: MediaRepository,
    private readonly hashtagRepository: HashtagRepository,
    private readonly hashtagName: string
  ) {}

  async listHashtagMedia(options: {
    limit: number;
    cursor?: string;
  }): Promise<PaginatedMediaResult> {
    const hashtag = await this.hashtagRepository.findByName(this.hashtagName);

    if (!hashtag) {
      return {
        items: [],
        nextCursor: null,
        hasMore: false,
      };
    }

    return this.mediaRepository.findPaginated({
      hashtagId: hashtag.id,
      limit: options.limit,
      cursor: options.cursor,
    });
  }
}
