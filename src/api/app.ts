import express, { Express } from "express";
import { errorHandler } from "./middleware/error-handler";
import { createHashtagsRouter } from "./routes/hashtags.routes";
import { createSyncRouter, SyncRouteDependencies } from "./routes/sync.routes";
import { MediaService } from "../services/media.service";

export interface AppDependencies extends SyncRouteDependencies {
  mediaService: MediaService;
}

export function createApp(deps: AppDependencies): Express {
  const app = express();

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/hashtags", createHashtagsRouter(deps.mediaService));
  app.use("/sync", createSyncRouter(deps));

  app.use(errorHandler);

  return app;
}
