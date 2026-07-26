import { Media } from "../../types";

export interface MediaResponseDto {
  id: string;
  instagramMediaId: string;
  mediaType: string;
  caption: string | null;
  permalink: string;
  mediaUrl: string;
  storedAssetPath: string | null;
  likeCount: number;
  commentsCount: number;
  instagramTimestamp: string;
  source: string;
  createdAt: string;
}

export function toMediaResponseDto(media: Media): MediaResponseDto {
  return {
    id: media.id,
    instagramMediaId: media.instagramMediaId,
    mediaType: media.mediaType,
    caption: media.caption,
    permalink: media.permalink,
    mediaUrl: media.mediaUrl,
    storedAssetPath: media.storedAssetPath,
    likeCount: media.likeCount,
    commentsCount: media.commentsCount,
    instagramTimestamp: media.instagramTimestamp.toISOString(),
    source: media.source,
    createdAt: media.createdAt.toISOString(),
  };
}
