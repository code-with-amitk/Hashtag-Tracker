export interface MediaCursorPayload {
  createdAt: string;
  id: string;
}

export function encodeMediaCursor(payload: MediaCursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeMediaCursor(cursor: string): MediaCursorPayload {
  let parsed: unknown;

  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid cursor");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("createdAt" in parsed) ||
    !("id" in parsed) ||
    typeof parsed.createdAt !== "string" ||
    typeof parsed.id !== "string"
  ) {
    throw new Error("Invalid cursor");
  }

  return {
    createdAt: parsed.createdAt,
    id: parsed.id,
  };
}
