import { execSync } from "child_process";

export function runMigrations(databaseUrl: string = process.env.DATABASE_URL!): void {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run migrations");
  }

  execSync("npx node-pg-migrate up -m src/db/migrations", {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });
}
