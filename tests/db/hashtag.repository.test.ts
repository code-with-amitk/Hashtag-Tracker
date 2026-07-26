import { HashtagRepository } from "../../src/db/repositories/hashtag.repository";
import { getTestPool } from "../helpers/db";

describe("HashtagRepository", () => {
  const repository = () => new HashtagRepository(getTestPool());

  it("findOrCreate inserts a new hashtag", async () => {
    const hashtag = await repository().findOrCreate("matcha", "ig-hashtag-123");

    expect(hashtag.name).toBe("matcha");
    expect(hashtag.instagramHashtagId).toBe("ig-hashtag-123");
    expect(hashtag.id).toBeTruthy();
  });

  it("findOrCreate is idempotent for the same name", async () => {
    const first = await repository().findOrCreate("matcha", "ig-hashtag-123");
    const second = await repository().findOrCreate("matcha", "ig-hashtag-456");

    expect(second.id).toBe(first.id);
    expect(second.instagramHashtagId).toBe("ig-hashtag-456");
  });

  it("findByName returns null when hashtag does not exist", async () => {
    const result = await repository().findByName("unknown");

    expect(result).toBeNull();
  });

  it("findByName returns an existing hashtag", async () => {
    const created = await repository().findOrCreate("matcha", "ig-hashtag-123");
    const found = await repository().findByName("matcha");

    expect(found).toEqual(created);
  });
});
