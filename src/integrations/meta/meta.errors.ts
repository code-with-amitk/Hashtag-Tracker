export class MetaApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code?: number
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

export class MetaAuthError extends MetaApiError {
  constructor(message: string, code?: number) {
    super(message, 401, code);
    this.name = "MetaAuthError";
  }
}

export class MetaPermissionError extends MetaApiError {
  constructor(message: string, code?: number) {
    super(message, 403, code);
    this.name = "MetaPermissionError";
  }
}

export class MetaRateLimitError extends MetaApiError {
  constructor(message: string, code?: number) {
    super(message, 429, code);
    this.name = "MetaRateLimitError";
  }
}

export class MetaNetworkError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "MetaNetworkError";
  }
}

export class MetaNotFoundError extends MetaApiError {
  constructor(message: string, code?: number) {
    super(message, 404, code);
    this.name = "MetaNotFoundError";
  }
}
