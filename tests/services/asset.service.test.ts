import { mkdtemp, readFile, rm } from "fs/promises";
import os from "os";
import path from "path";
import {
  AssetDownloadError,
  AssetService,
} from "../../src/services/asset.service";
import { LocalStorage } from "../../src/infrastructure/storage";
import { FetchFn } from "../../src/integrations/meta";

describe("AssetService", () => {
  let tempDir: string;
  let storage: LocalStorage;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "hashtag-tracker-asset-"));
    storage = new LocalStorage(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("downloads media and stores it locally", async () => {
    const fetchFn: FetchFn = async () =>
      new Response(Buffer.from("image-data"), { status: 200 });

    const service = new AssetService(storage, fetchFn);
    const storedPath = await service.downloadAndStore({
      hashtagName: "matcha",
      mediaId: "media-123",
      mediaUrl: "https://cdn.example.com/media-123.jpg",
      mediaType: "IMAGE",
    });

    expect(storedPath).toBe(storage.getPath("matcha/media-123.jpg"));
    expect(await readFile(storedPath)).toEqual(Buffer.from("image-data"));
  });

  it("throws AssetDownloadError when download fails", async () => {
    const fetchFn: FetchFn = async () =>
      new Response("not found", { status: 404 });

    const service = new AssetService(storage, fetchFn);

    await expect(
      service.downloadAndStore({
        hashtagName: "matcha",
        mediaId: "media-404",
        mediaUrl: "https://cdn.example.com/missing.jpg",
        mediaType: "IMAGE",
      })
    ).rejects.toBeInstanceOf(AssetDownloadError);
  });

  it("throws AssetDownloadError on network failure", async () => {
    const fetchFn: FetchFn = async () => {
      throw new Error("network down");
    };

    const service = new AssetService(storage, fetchFn);

    await expect(
      service.downloadAndStore({
        hashtagName: "matcha",
        mediaId: "media-net",
        mediaUrl: "https://cdn.example.com/media-net.jpg",
        mediaType: "IMAGE",
      })
    ).rejects.toMatchObject({
      mediaId: "media-net",
    });
  });
});
