import { Pool } from "pg";
import { Hashtag } from "../../types";
import { mapHashtagRow } from "./mappers";

export class HashtagRepository {
  constructor(private readonly pool: Pool) {}

  async findByName(name: string): Promise<Hashtag | null> {
    const result = await this.pool.query(
      `SELECT id, name, instagram_hashtag_id, created_at, updated_at
       FROM hashtags
       WHERE name = $1`,
      [name]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return mapHashtagRow(result.rows[0]);
  }

  async findById(id: string): Promise<Hashtag | null> {
    const result = await this.pool.query(
      `SELECT id, name, instagram_hashtag_id, created_at, updated_at
       FROM hashtags
       WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return mapHashtagRow(result.rows[0]);
  }

  async findOrCreate(
    name: string,
    instagramHashtagId: string
  ): Promise<Hashtag> {
    const result = await this.pool.query(
      `INSERT INTO hashtags (name, instagram_hashtag_id)
       VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE
       SET instagram_hashtag_id = EXCLUDED.instagram_hashtag_id,
           updated_at = NOW()
       RETURNING id, name, instagram_hashtag_id, created_at, updated_at`,
      [name, instagramHashtagId]
    );

    return mapHashtagRow(result.rows[0]);
  }
}
