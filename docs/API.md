# XS Studio — Backend API Contract (v1)

Base URL: configured in the app (e.g. `https://studio.yourdomain.com`). All bodies are JSON unless noted.
Auth: `Authorization: Bearer <jwt>` on every route except `GET /health`, `POST /auth/login`, and signed file URLs.
Dates are ISO‑8601 strings. Event dates are local Las Vegas calendar dates `YYYY-MM-DD`.
Errors: non‑2xx with `{ "error": { "code": string, "message": string } }`.

## Health / system
- `GET /health` → `{ ok: true, version }`
- `GET /system/status` → `{ anthropic: bool, imageProvider: string|null, cutoutProvider: string|null, renderer: bool, model: string }`

## Auth & users
- `POST /auth/login` `{ email, password }` → `{ token, user }`
- `GET /me` → `User`
- `GET /users` (admin) → `User[]`
- `POST /users` (admin) `{ email, name, password, role: "admin"|"editor"|"viewer" }` → `User`
- `DELETE /users/:id` (admin)

`User = { id, email, name, role, createdAt }`

## Studio (agent conversations)
- `POST /create` `{ prompt, attachmentAssetIds?: string[] }` → `{ thread: Thread, runId }` — one‑shot: new thread + first message + starts the agent.
- `GET /threads` → `Thread[]` (newest first)
- `POST /threads` `{ title? }` → `Thread`
- `GET /threads/:id` → `{ thread: Thread, messages: Message[], outputs: Output[] }`
- `DELETE /threads/:id`
- `POST /threads/:id/messages` `{ text, attachmentAssetIds?: string[] }` → `{ message: Message, runId }` — starts an agent run.
- `GET /runs/:id` → `Run`
- `POST /runs/:id/cancel` → `Run`
- `GET /runs/:id/events` → **Server‑Sent Events** stream. On connect the server replays every event of the run so far, then streams live ones. Stream closes after `done`.

`Thread = { id, title, createdAt, updatedAt, lastRunState?: RunState, lastRunId?: string, coverUrl?: string }`
`Message = { id, threadId, role: "user"|"assistant", text, attachmentAssetIds: string[], outputIds: string[], createdAt }`
`Run = { id, threadId, state: RunState, error?: string, createdAt, finishedAt? }`
`RunState = "queued"|"running"|"needs_input"|"completed"|"failed"|"cancelled"`

### SSE event types (`event:` line, JSON `data:` line)
| event | data |
|---|---|
| `status` | `{ state: RunState }` |
| `progress` | `{ text }` — short human status line ("Checking the XS calendar for this weekend…") |
| `tool` | `{ id, name, label, phase: "start"|"end", ok?: bool, detail?: string }` |
| `delta` | `{ text }` — streamed assistant prose |
| `output` | `{ output: Output }` — a finished deliverable (poster, caption, etc.) |
| `message` | `{ message: Message }` — final assistant message persisted |
| `error` | `{ message }` |
| `done` | `{ state: RunState }` |

## Outputs (Library)
- `GET /outputs?kind=&status=&q=&limit=50&before=<iso>` → `Output[]`
- `GET /outputs/:id` → `Output`
- `PATCH /outputs/:id` `{ status?: "draft"|"approved"|"rejected", favorite?: bool, title?, text? }` → `Output`
- `DELETE /outputs/:id`
- `POST /outputs/:id/rerender` `{ fields?: Record<string,string>, format?: FormatId, template?: string }` → `Output` (new version, deterministic — no AI; used by the in‑app editor)

`Output = { id, threadId?, runId?, kind: OutputKind, title, format?: Format, template?: string, fields?: Record<string,string>, editableFields?: EditableField[], imageUrl?: string, thumbUrl?: string, text?: string, status, favorite: bool, parentId?: string, createdAt, meta: object }`
`OutputKind = "flyer"|"story"|"lineup"|"announcement"|"caption"|"copy"|"recap"`
`Format = { id: FormatId, label, width, height }`
`FormatId = "feed_4x5"|"story_9x16"|"square_1x1"|"landscape_16x9"|"print_18x24"`
`EditableField = { key, label, multiline: bool }`

## Assets
- `GET /assets?kind=&artist=&q=` → `Asset[]`
- `POST /assets` **multipart/form-data**: `file` (image), `kind`, `artist?`, `title?`, `tags?` (comma separated) → `Asset`
- `PATCH /assets/:id` `{ title?, artist?, tags?: string[], kind? }` → `Asset`
- `DELETE /assets/:id`

`Asset = { id, kind: AssetKind, title, artist?: string, tags: string[], url, thumbUrl, width, height, hasAlpha: bool, analysis?: string, createdAt }`
`AssetKind = "artist_photo"|"artist_cutout"|"logo"|"venue_photo"|"crowd_photo"|"texture"|"brand_reference"`

## Events (XS calendar — source of truth for dates)
- `GET /events?from=YYYY-MM-DD&to=YYYY-MM-DD` → `Event[]`
- `POST /events` `EventInput` → `Event`
- `PATCH /events/:id` `Partial<EventInput>` → `Event`
- `DELETE /events/:id`
- `POST /events/parse` `{ text }` → `{ events: EventInput[] }` — Claude parses pasted lineup text (email, calendar export). Preview only; client then POSTs the ones to keep.

`EventInput = { artist, date: "YYYY-MM-DD", venue: "XS"|"XS Nightswim"|"Encore Beach Club"|"EBC at Night"|"Other", eventType: "regular"|"residency"|"special"|"holiday", supportingActs?: string[], doorsTime?: "22:30", ticketUrl?, tablesUrl?, notes?, status: "confirmed"|"tentative"|"cancelled" }`
`Event = EventInput & { id, createdAt, updatedAt }`

## Brand system
- `GET /brand` → `{ profile: BrandProfile, dna: string|null, dnaUpdatedAt?: string, referenceCount: number }`
- `PUT /brand/profile` `Partial<BrandProfile>` → `BrandProfile` (team overrides: phone, URLs, legal line, hashtags…)
- `POST /brand/references` **multipart** `file` → `Asset` (kind `brand_reference`, analysed by Claude vision in the background)
- `POST /brand/dna/rebuild` → `{ dna }` — re-synthesises the Brand DNA from all analysed references.

## Templates
- `GET /templates` → `{ id, name, description, kinds: OutputKind[], fields: EditableField[], previewUrl? }[]`

## Files
URLs in responses are absolute, signed and time‑limited (`/files/<key>?exp=..&sig=..`); they need no auth header (works with `AsyncImage`).
