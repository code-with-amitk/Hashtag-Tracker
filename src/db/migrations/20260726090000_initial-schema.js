/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.createExtension("pgcrypto", { ifNotExists: true });

  pgm.createTable("hashtags", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    name: { type: "varchar(255)", notNull: true, unique: true },
    instagram_hashtag_id: { type: "varchar(64)", notNull: true, unique: true },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.createTable("media", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    instagram_media_id: { type: "varchar(64)", notNull: true, unique: true },
    hashtag_id: {
      type: "uuid",
      notNull: true,
      references: "hashtags",
      onDelete: "CASCADE",
    },
    media_type: { type: "varchar(32)", notNull: true },
    caption: { type: "text" },
    permalink: { type: "text", notNull: true },
    media_url: { type: "text", notNull: true },
    stored_asset_path: { type: "text" },
    like_count: { type: "integer", notNull: true, default: 0 },
    comments_count: { type: "integer", notNull: true, default: 0 },
    instagram_timestamp: { type: "timestamptz", notNull: true },
    source: { type: "varchar(16)", notNull: true },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.createIndex("media", ["hashtag_id", { name: "created_at", sort: "DESC" }], {
    name: "media_hashtag_id_created_at_desc_idx",
  });

  pgm.createIndex(
    "media",
    ["hashtag_id", { name: "instagram_timestamp", sort: "DESC" }],
    { name: "media_hashtag_id_instagram_timestamp_desc_idx" }
  );

  pgm.createTable("sync_runs", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    hashtag_id: {
      type: "uuid",
      notNull: true,
      references: "hashtags",
      onDelete: "CASCADE",
    },
    sync_type: { type: "varchar(16)", notNull: true },
    status: { type: "varchar(16)", notNull: true, default: "pending" },
    items_fetched: { type: "integer", notNull: true, default: 0 },
    items_inserted: { type: "integer", notNull: true, default: 0 },
    items_skipped: { type: "integer", notNull: true, default: 0 },
    items_failed: { type: "integer", notNull: true, default: 0 },
    error_message: { type: "text" },
    started_at: { type: "timestamptz" },
    completed_at: { type: "timestamptz" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.createIndex("sync_runs", ["hashtag_id", "created_at"], {
    name: "sync_runs_hashtag_id_created_at_idx",
  });
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropTable("sync_runs");
  pgm.dropTable("media");
  pgm.dropTable("hashtags");
};
