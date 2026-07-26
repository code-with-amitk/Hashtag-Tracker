import { HashtagRepository } from "../db/repositories/hashtag.repository";
import { MetaClient } from "../integrations/meta";
import { Hashtag } from "../types";

export class HashtagService {
  constructor(
    private readonly hashtagRepository: HashtagRepository,
    private readonly metaClient: MetaClient
  ) {}

  async resolveHashtag(
    name: string,
    instagramHashtagId?: string
  ): Promise<Hashtag> {
    const resolvedId =
      instagramHashtagId ?? (await this.metaClient.searchHashtag(name));

    return this.hashtagRepository.findOrCreate(name, resolvedId);
  }
}
