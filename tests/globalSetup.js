const { execSync } = require("child_process");

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5433/hashtag_tracker_test";

module.exports = async () => {
  execSync("npx node-pg-migrate up -m src/db/migrations", {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });
};
