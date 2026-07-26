# Hashtag Tracking

## Overview

Built for tracking Instagram hashtag media.

Your task is to design and implement a scalable ingestion pipeline: fetch media from Meta, store it in Postgres, upload assets to storage, avoid duplicates, and expose a paginated read API.

Meta's `top_media` and `recent_media` endpoints are paginated. A single hashtag can return a large volume of media across pages — plan your ingestion to handle pagination and up to **500 media items per sync**.

We do not expect a production-ready system in the time available. We are looking for clear engineering judgment and a clean implementation.

## Requirements

Build a system that tracks the `matcha` hashtag. The system should:

- Be built using Express, TypeScript, and Postgres.
- Create all database tables through migrations.
- Track the hashtag `matcha`.
- Fetch and store top media for the hashtag.
- Periodically, every 3 hours, fetch and store recent media for the hashtag.
- Store media metadata in the database, such as:
    - media ID, caption, media type, media URL, permalink and more
    - Note: the above are suggestions; we want to see what you keep and leave out of the database and why. Feel free to add or remove fields.
- Download/upload media assets into storage.
- Avoid duplicate media records.
- Expose one paginated API to fetch stored hashtag media.

## Resources

Use the following credentials for the APIs below:

- Instagram page token: 
`EAAMQTKttZCYkBR7muu4YLpVqSMWGt55Nved9vFHo5u6ON7q3jiItnQPxInpsZAeh8kcI3yvUwul1aFV6GrZAIdJOWJjZCVt10gsquZBrH2vMlbOhU5fZBeRNn2NVfi8DTYTeYZBoNCiWjAUcS35gUqvLaMBzjNscnQAasthBBGk3t2PbvYVuagRnHs5bsnJ7kVZC0iIClZCtw6LbPxH7U2yVqoqr1`
- Instagram business id (`user_id`): `17841413741308252`

Get the hashtag ID:

```bash
curl "<https://graph.facebook.com/v24.0/ig_hashtag_search?user_id=${user_id}&q=matcha&access_token=${access_token}>"
```

Get top media (use the hashtag id from the previous call):

```bash
curl "<https://graph.facebook.com/v24.0/${hashtag_id}/top_media?user_id=${user_id}&fields=id,media_type,timestamp,permalink,media_url,caption,like_count,comments_count&limit=25&access_token=${access_token}>"
```

Get recent media (use the hashtag id from the previous call):

```bash
curl "<https://graph.facebook.com/v24.0/${hashtag_id}/recent_media?user_id=${user_id}&fields=id,media_type,timestamp,permalink,media_url,caption,like_count,comments_count&limit=25&access_token=${access_token}>"
```

## Queue, Cron, And Storage

- In-memory queue
- Node cron
- Local file storage

Example local setup:

```jsx
queue.enqueue("SYNC_RECENT_HASHTAG_MEDIA", {
  hashtag: "matcha",
  hashtagId: "..."
});
```
```
cron.schedule("0 */3 * * *", async () => {
  await queue.enqueue("SYNC_RECENT_HASHTAG_MEDIA", {
    hashtag: "matcha",
    hashtagId: "..."
  });
});
```

The important part is that your code should be structured so local implementations can later be replaced with AWS implementations.

## API Requirement

Create one paginated API on the path `GET /hashtags` to return stored media in descending order of creation time.

## Deliverables

Share:

- Working code — share GitHub access to `saral-kalwani`, `pranav-getsaral`, and `nivekithan-saral`
- Create an `instructions.md` in the root with:
    - Setup instructions under the header `setup`
    - If any, environment variables under the header `vars`
    - If any, tradeoffs or shortcuts under the header `tradeoffs`
- Optionally, include exported AI chat history in an `ai-usage/` folder or share links in `instructions.md`