# Image Storage Optimization

## Problem

The `Message` table in Supabase (staging: `muzvtmkpaflxwqohpmbb`) had grown to **708 MB**, with **98.6% of storage consumed by base64-encoded images** (669 MB across just 339 messages).

Image generation responses (DALL-E, gpt-image-1) and user-uploaded images store the full base64-encoded image data inline in the `content` JSON column as `data:{mimeType};base64,{data}`. A single 1024x1024 PNG can be 1–4 MB in base64.

## Key Findings

### Storage breakdown

| Category                | Messages | Total Storage | % of Total |
| ----------------------- | -------- | ------------- | ---------- |
| Base64 Image (embedded) | 339      | 669 MB        | 98.57%     |
| Standard (small)        | 11,481   | 8,610 kB      | 1.24%      |
| Tool Calls + Citations  | 26       | 569 kB        | 0.08%      |
| All other categories    | 341      | 665 kB        | 0.11%      |

### Distribution

| Metric | Value                   |
| ------ | ----------------------- |
| Total  | 12,187 messages, 678 MB |
| Median | 471 bytes               |
| P90    | 2,023 bytes             |
| P99    | 2,076 kB                |
| Max    | 3,535 kB                |

The top 10% of messages (P90+) consume **99.0%** of total storage. The problem is extremely concentrated: 339 base64 image messages account for nearly all of it.

### By role

| Role      | Messages | Total Storage |
| --------- | -------- | ------------- |
| assistant | 6,695    | 676 MB        |
| user      | 5,492    | 2,746 kB      |

Almost all the heavy storage is in `assistant` messages — image generation outputs.

## Solution: External Image Storage

Replace inline base64 image data with URL references stored in an external object store.

### Architecture

```
Before:
  Message.content → [{ type: "image_url", image_url: { url: "data:image/png;base64,..." } }]
  (1-4 MB per image, stored in PostgreSQL JSONB)

After:
  Message.content → [{ type: "image_url", image_url: { url: "https://utfs.io/f/..." } }]
  (< 200 bytes per reference, image stored externally)
```

### Implementation (Ironlabs-chat)

Image generation service (`generation.service.ts`) now:

1. Receives base64 image from provider (OpenAI, Google)
2. Compresses via **sharp** (WebP lossless) — reduces size by ~40-60%
3. Uploads compressed image to **UploadThing** via `UTApi`
4. Stores only the UploadThing URL in `Message.content`

### Expected Impact

| Metric         | Before   | After (est.) |
| -------------- | -------- | ------------ |
| Message table  | 708 MB   | ~10 MB       |
| Per-image cost | 1-4 MB   | ~200 bytes   |
| DB backup size | ~700 MB  | ~10 MB       |
| Query speed    | Degraded | Normal       |

### Storage Provider: UploadThing

- Already used in the Ironlabs-chat codebase for file uploads
- Requires `UPLOADTHING_TOKEN` env var
- `UTApi` for server-side programmatic uploads
- Files served from `utfs.io` CDN

## Analysis Tooling

The storage analysis was done with a Python script that connects directly to the Supabase PostgreSQL database.

**Location:** `scripts/storage-analysis/`

```
scripts/storage-analysis/
├── analyze_storage.py       # Main analysis script
├── requirements.txt         # psycopg2
└── reports/
    ├── storage_analysis.md  # Categorized analysis
    └── storage_report.md    # Raw size distributions + top users
```

### Running the analysis

```bash
pip install -r scripts/storage-analysis/requirements.txt
# Set DATABASE_URL or edit the script's connection string
python scripts/storage-analysis/analyze_storage.py
```

### Key SQL patterns used

```sql
-- Row size (avoids ambiguous pg_size_pretty overload)
SELECT pg_column_size(m)::bigint AS row_size FROM "Message" m;

-- Content JSON inspection
SELECT content::text FROM "Message" WHERE pg_column_size(content)::bigint > 1000000;
```

**Note:** Use `pg_column_size()::bigint` cast — without it, `pg_size_pretty` has ambiguous function overloads on some Supabase Postgres versions.

## Gotchas

1. **`UPLOADTHING_TOKEN` not in `.env` by default** — Use `vercel link` to pull it, or copy from the Vercel dashboard. Note that `vercel link` creates `.env.local` that overrides Clerk keys — delete `.env.local` and only copy needed vars to `.env`.

2. **Base64 overhead** — Base64 encoding increases data size by ~33% over the raw binary. A 1 MB PNG becomes ~1.33 MB in base64, plus JSON escaping overhead.

3. **Migration of existing data** — Existing 339 base64 messages would need a one-time migration script to extract images, upload to UploadThing, and replace content with URL references.

4. **Image expiry** — UploadThing URLs are permanent (no expiry). If switching to S3/Supabase Storage, ensure signed URLs have adequate TTL or use public buckets.

5. **Content block types** — The `Message.content` column uses a typed JSON schema with content blocks. The `image_url` block type already supports both `data:` URLs and `https:` URLs, so consumers (frontend, API) don't need changes.
