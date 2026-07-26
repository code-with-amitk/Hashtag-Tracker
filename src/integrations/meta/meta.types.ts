export interface MetaMediaItem {
  id: string;
  mediaType: string;
  timestamp: Date;
  permalink: string;
  mediaUrl: string;
  caption: string | null;
  likeCount: number;
  commentsCount: number;
}

export interface MediaPage {
  items: MetaMediaItem[];
  nextCursor: string | null;
}

export interface MetaHashtagSearchResponse {
  data?: Array<{ id: string }>;
  error?: MetaGraphErrorBody;
}

export interface MetaMediaResponse {
  data?: MetaMediaApiItem[];
  paging?: {
    cursors?: {
      after?: string;
    };
    next?: string;
  };
  error?: MetaGraphErrorBody;
}

export interface MetaMediaApiItem {
  id: string;
  media_type?: string;
  timestamp?: string;
  permalink?: string;
  media_url?: string;
  caption?: string;
  like_count?: number;
  comments_count?: number;
}

export interface MetaGraphErrorBody {
  message: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
}
