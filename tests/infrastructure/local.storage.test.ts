import { mkdtemp, readFile, rm } from "fs/promises";
import os from "os";
import path from "path";
import {
  LocalStorage,
  buildMediaStorageKey,
} from "../../src/infrastructure/storage";

describe("LocalStorage", () => {
  let tempDir: string;
  let storage: LocalStorage;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "hashtag-tracker-"));
    storage = new LocalStorage(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("upload creates nested directories and writes the file", async () => {
    const key = buildMediaStorageKey("matcha", "media-123", "jpg");
    const buffer = Buffer.from("image-bytes");

    const storedPath = await storage.upload(key, buffer);

    expect(storedPath).toBe(storage.getPath(key));
    expect(await storage.exists(key)).toBe(true);
    expect(await readFile(storedPath)).toEqual(buffer);
  });

  it("upload is idempotent for the same key", async () => {
    const key = "matcha/media-123.jpg";

    await storage.upload(key, Buffer.from("first"));
    await storage.upload(key, Buffer.from("second"));

    expect(await readFile(storage.getPath(key))).toEqual(Buffer.from("second"));
    expect(await storage.exists(key)).toBe(true);
  });

  it("getPath returns the absolute resolved path", () => {
    const key = "matcha/media-456.jpg";

    expect(storage.getPath(key)).toBe(path.resolve(tempDir, key));
  });

  it("exists returns false for missing files", async () => {
    expect(await storage.exists("missing/file.jpg")).toBe(false);
  });
});
