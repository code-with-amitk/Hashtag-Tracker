import { NextFunction, Request, Response, Router } from "express";
import { toMediaResponseDto } from "../dto/media.dto";
import { validatePagination } from "../middleware/validate-pagination";
import { MediaService } from "../../services/media.service";

export function createHashtagsRouter(mediaService: MediaService): Router {
  const router = Router();

  router.get(
    "/",
    validatePagination,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const pagination = req.pagination!;
        const result = await mediaService.listHashtagMedia(pagination);

        res.json({
          data: result.items.map(toMediaResponseDto),
          pagination: {
            nextCursor: result.nextCursor,
            hasMore: result.hasMore,
          },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
