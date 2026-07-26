import "dotenv/config";
import { Server } from "http";
import { createApp } from "./api/app";
import {
  createDependencies,
  shutdownApplication,
  startApplication,
} from "./bootstrap";
import { loadConfig } from "./config";

async function main(): Promise<void> {
  const config = loadConfig();
  const deps = createDependencies(config);
  await startApplication(deps);

  const app = createApp({
    mediaService: deps.mediaService,
    queue: deps.queue,
    hashtagRepository: deps.hashtagRepository,
    config: deps.config,
  });
  const server: Server = app.listen(config.port, () => {
    console.log(`Hashtag Tracker listening on port ${config.port}`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`${signal} received — shutting down gracefully...`);
    server.close();
    await shutdownApplication(deps);
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

main().catch((error: unknown) => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});
