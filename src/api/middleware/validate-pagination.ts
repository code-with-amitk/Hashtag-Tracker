import { NextFunction, Request, Response } from "express";
import { decodeMediaCursor } from "../../db/repositories/pagination";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function validatePagination(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const limitParam = req.query.limit;

  let limit = DEFAULT_LIMIT;
  if (limitParam !== undefined) {
    const parsed = Number(limitParam);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
      res.status(400).json({
        error: `limit must be an integer between 1 and ${MAX_LIMIT}`,
      });
      return;
    }
    limit = parsed;
  }

  const cursorParam = req.query.cursor;
  let cursor: string | undefined;

  if (cursorParam !== undefined) {
    if (typeof cursorParam !== "string" || !cursorParam.trim()) {
      res.status(400).json({ error: "Invalid cursor" });
      return;
    }

    try {
      decodeMediaCursor(cursorParam);
    } catch {
      res.status(400).json({ error: "Invalid cursor" });
      return;
    }

    cursor = cursorParam;
  }

  req.pagination = { limit, cursor };
  next();
}
