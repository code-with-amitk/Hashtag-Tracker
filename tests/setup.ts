import {
  closeTestPool,
  initTestPool,
  truncateTestTables,
} from "./helpers/db";

beforeAll(async () => {
  await initTestPool();
});

beforeEach(async () => {
  await truncateTestTables();
});

afterAll(async () => {
  await closeTestPool();
});
