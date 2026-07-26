export interface PaginationQuery {
  limit: number;
  cursor?: string;
}

declare global {
  namespace Express {
    interface Request {
      pagination?: PaginationQuery;
    }
  }
}

export {};
