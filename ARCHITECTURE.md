# Blood Bridge — Complete Codebase Walkthrough

> This is the single-document, line-by-line, file-by-file guide to every part of the Blood Bridge project. Use it as a reference when you're editing the code yourself. Every section was assembled from a real read of the source — no guesses, no hallucinated APIs.

---

## How to use this document

- **Top-down reading:** start with §1 (Backend Foundations) and work through to §6 (Admin + Infrastructure). The sections build on each other.
- **As a reference:** jump to any section using the table of contents. Every section names the exact files and line numbers it discusses, so you can open the file alongside.
- **Search-friendly:** use Ctrl-F for things like "POST /api/requests/accept", "isLocked", "useAuthStore", "ST_DWithin" — they're all explained somewhere here.

## Table of contents

1. [Backend Foundations](#1-backend-foundations) — Express app, middleware, health, server, Prisma, Redis, env
2. [Backend Services](#2-backend-services) — email, SMS, push, S3, geo
3. [Backend Routes](#3-backend-routes) — every HTTP endpoint
4. [Mobile Foundations](#4-mobile-foundations) — App.js navigation, stores, axios, hooks, components
5. [Mobile Screens](#5-mobile-screens) — every screen, state, render, validation
6. [Admin + Infrastructure](#6-admin--infrastructure) — admin dashboard, Cloudflare worker, Prisma schema, Docker, CI/CD, icon generator

---

# 1. Backend Foundations

This section covers the files that the rest of the backend depends on: the Express app setup, HTTP server bootstrapping, shared database/Redis clients, and the three middlewares (auth, adminAuth, errorHandler). Files: `backend/src/app.js`, `backend/src/server.js`, `backend/src/config/prisma.js`, `backend/src/config/redis.js`, `backend/src/middleware/*.js`, `backend/package.json`, `backend/.env.example`.

## 1.1 app.js — the Express app

**Purpose:** Create and configure the Express application — security headers, CORS, four rate limiters, body parsing, health endpoints, and route mounting. This file has no side effects (no `listen()`), so tests can import `app` directly.

**Critical middleware order** (declared at top, lines 6–7):

```
helmet → cors → rate-limit → morgan → body parser → routes → error handler
```

Reversing any of these breaks something — for example, if rate-limit came before CORS, the rate-limit error response wouldn't have the right CORS headers.

### Helmet (lines 32–39)
Sets HTTP security headers: HSTS (1-year), Referrer-Policy `no-referrer`, plus defaults like `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`. Protects against clickjacking, MIME sniffing, XSS.

### CORS (lines 44–59)
Reads `ALLOWED_ORIGINS` env var. In production, only those domains are allowed; in dev (empty), all origins are allowed. Custom headers `x-admin-secret` and `x-cron-secret` are explicitly allowed.

### Four rate limiters

| Limiter | Window | Max | Applied to | Reason |
|---|---|---|---|---|
| `apiLimiter` (64–70) | 15 min | 100 | All `/api/*` | DDoS / scraping |
| `otpLimiter` (74–81) | 1 min | 5 | `/auth/login`, `/auth/send-email-otp`, `/auth/forgot-password` | Brute-force protection. `skipSuccessfulRequests: true` so only failures count |
| `adminLimiter` (85–91) | 15 min | 20 | `/admin/*`, `/verify/admin/*` | Slow ADMIN_SECRET guessing |
| `chatLimiter` (94–100) | 1 min | 60 | `/chat/*` | Anti-spam in the 1-hr chat |

### Body parsing (lines 117–118)
`express.json({ limit: '10kb' })` — keeps memory-exhaustion attacks impossible (legitimate request bodies are <500 bytes).

### Health endpoints

**`GET /health`** (line 123) — pure liveness: `{ status: 'ok' }`. Used by Kubernetes liveness probe. No DB hit.

**`GET /health/ready`** (lines 125–135) — readiness: runs `prisma.$queryRaw\`SELECT 1\`` and `redis.ping()` in parallel. Returns 200 if both succeed, 503 otherwise. Used by Vercel before routing traffic and by Kubernetes readiness probes.

### Routes (lines 138–145)
```
/api/auth /api/donors /api/requests /api/verify /api/chat /api/caregivers /api/admin /api/cron
```

### Error handler (line 148)
`app.use(errorHandler)` — must be LAST because Express identifies error handlers by their 4-parameter signature `(err, req, res, next)`.

## 1.2 server.js — startup validation + graceful shutdown

**Purpose:** Boot the HTTP server, validate environment variables, connect to Postgres/Redis, ensure the S3 bucket exists, and handle graceful shutdown.

### `validateEnvironment()` (lines 22–46)

Three sequential checks:

1. **Missing required** (all environments): If `JWT_SECRET`, `DATABASE_URL`, `REDIS_URL`, or `CRON_SECRET` are missing, throw before doing anything else.
   Example failure: `Missing required environment variables: JWT_SECRET, CRON_SECRET`
2. **Placeholder values in production**: matches case-insensitive `change_this`, `your_`, `changeme`, `secret_here`. Refuses to start.
   Example: `Refusing to start: JWT_SECRET, ADMIN_SECRET still contain placeholder values in production.`
3. **ADMIN_SECRET length** (production only): must be ≥32 chars.

### `startServer()` (lines 48–95)

1. `validateEnvironment()`
2. `await prisma.$connect()` → logs `[DB] PostgreSQL connected`
3. `await ensureBucketExists()` → creates MinIO/Backblaze bucket if missing
4. `app.listen(PORT)` → logs `[Server] Listening on port 3000 (development)`
5. Registers SIGTERM + SIGINT handlers

### Graceful shutdown (lines 66–86)

On SIGTERM (Docker) or SIGINT (Ctrl-C):
1. Set a 30-second force-exit timer (Docker waits 30s before SIGKILL)
2. `server.close()` — stop accepting new connections
3. `prisma.$disconnect()` — clean DB pool teardown
4. `redis.quit()` — close Redis connection
5. `process.exit(0)` — clean exit code

## 1.3 config/prisma.js + config/redis.js — singletons

**`prisma`** — single shared `PrismaClient` instance. Logging is `['query', 'error', 'warn']` in dev, just `['error']` in production. Why singleton? Each `new PrismaClient()` opens its own connection pool — without a singleton, every route handler would exhaust Postgres connections.

**`redis`** — single shared `ioredis` instance. Reads `REDIS_URL`, defaults to `redis://localhost:6379`. `maxRetriesPerRequest: 3` with exponential-backoff retry strategy. Two event listeners log connect + error.

## 1.4 middleware/auth.js — JWT verification

```js
async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.slice(7); // strip 'Bearer '
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    omit:  { passwordHash: true },   // keeps the hash out of req.user
  });
  req.user = user;
  next();
}
```

Why **re-fetch the user on every request** instead of trusting the JWT payload? So that if an admin bans a user (or the user changes their bloodGroup), the change takes effect immediately — without waiting for the token to expire 30 days later.

Why **`omit: { passwordHash: true }`**? Defense in depth — even if a route accidentally did `res.json(req.user)` or `console.log(req.user)`, the bcrypt hash would never leak because Postgres never sent it back. Requires `previewFeatures = ["omitApi"]` in `schema.prisma`'s generator block (preview in Prisma 5.16-5.x, GA in 6.x).

Error mapping: `JsonWebTokenError` → 401 "Invalid token"; `TokenExpiredError` → 401 "Token expired"; anything else → `next(err)` to the error handler.

## 1.5 middleware/adminAuth.js — shared secret

```js
function adminAuth(req, res, next) {
  if (req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden: invalid admin secret' });
  }
  next();
}
```

Simple constant-time string compare. The admin dashboard sets this header on every request via an axios interceptor.

## 1.6 middleware/errorHandler.js — central error handling

Catches errors via the 4-parameter signature `(err, req, res, next)`:
- `err.code === 'P2025'` (Prisma "record not found") → 404
- `err.code === 'P2002'` (Prisma "unique violation") → 409
- everything else → `err.status || 500` with `err.message`

In dev, logs the full stack trace. In production, logs only the message (don't leak internals).

## 1.7 package.json + .env.example

See file headers for the full dependency list and env-var documentation. Key dependencies: `@prisma/client`, `express`, `bcryptjs`, `jsonwebtoken`, `ioredis`, `nodemailer`, `expo-server-sdk`, `@aws-sdk/client-s3`, `axios`, `helmet`, `cors`, `express-rate-limit`, `morgan`, `joi`, `dotenv`, `uuid`. DevDeps: `nodemon`, `prisma`.

---

# 2. Backend Services

Each service wraps one external integration. Files: `backend/src/services/{emailService,smsService,fcmService,s3Service,geoService}.js`.

## 2.1 emailService.js — Gmail SMTP via Nodemailer

**Singleton transporter** (`getTransporter()`, lines 16–26). Reads `GMAIL_USER` and `GMAIL_APP_PASSWORD`. App passwords are generated at https://myaccount.google.com/apppasswords after enabling 2FA — they're not your normal Gmail password.

### `send(to, subject, html)`
- If `USE_MOCK_EMAIL=true`: strip HTML tags, log body to console, return `{ mock: true }`
- If credentials missing: log error, return undefined
- Otherwise: call `transporter.sendMail({ from: 'Blood Bridge <user>', to, subject, html })`. Throws on SMTP failure so the caller can return a 500.

### `sendOtp(to, code, purpose)`
Templated email with the 6-digit code in 28px bold letterspaced text. The label is purpose-specific:
```
verify          → 'verify your email'
change_email    → 'confirm your new email'
change_password → 'change your password'
```

### `sendPasswordReset(to, link)`
Templated email with a big red button (`background:#DC2626`) linking to the reset URL.

## 2.2 smsService.js — SSL Wireless (caregiver SMS only)

**Endpoint:** `https://sms.sslwireless.com/pushapi/dynamic/server.php` — a GET request (not POST) with query params:

| Param | Value |
|---|---|
| `api_token` | `SSL_WIRELESS_API_KEY` |
| `sid` | `SSL_WIRELESS_SID` |
| `sms` | message body |
| `msisdn` | phone in E.164 format (`+8801XXXXXXXXX`) |
| `csmsid` | `BB_${Date.now()}` — for SSL's deduplication |

Mock mode prints `[SMS MOCK]` to the console. Throws on network failure.

**Only used for caregiver escalation at level 2 (T+30 min).** Auth uses email OTPs, not SMS.

## 2.3 fcmService.js — Expo Push Notification Service

Expo Push is credential-free: the mobile app calls `Notifications.getExpoPushTokenAsync()`, gets back an `ExponentPushToken[...]`, stores it via `PUT /api/donors/fcm-token`. The backend's job is just to call Expo's API.

### `send(pushToken, notification)`
- If token is missing or notification is null → return early (no-op)
- If `Expo.isExpoPushToken(pushToken)` returns false → log as `[PUSH MOCK]` and return. This handles dev tokens or stale FCM tokens gracefully — no error.
- Otherwise: call `expo.sendPushNotificationsAsync([{ to, title, body, data, sound: 'default', priority: 'high' }])`. Check tickets for `status === 'error'`. **Never throws** — a failed push must not crash the request flow.

### `sendToMany(pushTokens, notification)`
- Filters out null/invalid tokens
- Chunks via `expo.chunkPushNotifications()` (Expo's limit is 100 per request)
- Sends all chunks in parallel with `Promise.allSettled` so a single bad chunk doesn't kill the rest

## 2.4 s3Service.js — presigned URLs to S3-compatible storage

Two S3 clients: `s3` (internal — uses `AWS_ENDPOINT`, e.g. `http://minio:9000` in Docker) and `s3Public` (public-facing — uses `MINIO_PUBLIC_URL` or `AWS_ENDPOINT`). The public client is used for generating presigned URLs so that the URL's signed hostname is reachable by the mobile device.

### `ensureBucketExists()`
Called from `server.js` at startup. Tries `HeadBucketCommand`; if 404, creates the bucket. On other errors (credentials wrong, storage not ready), logs a warning but does not throw.

### `generateUploadUrl(userId)` → `{ uploadUrl, s3Key }`
- Generates an S3 key like `nid-photos/${userId}/${uuid}.jpg`
- Builds a `PutObjectCommand` with `ContentType: 'image/jpeg'`
- Signs with `getSignedUrl(s3Public, command, { expiresIn: 600 })` — 10-minute validity
- Returns both the URL (mobile PUTs the photo to it) and the key (mobile then calls `POST /verify/submit { s3Key }`)

### `uploadBuffer(userId, buffer, contentType)`
Alternative flow when the mobile app POSTs the file as multipart/form-data instead of PUT-ing to presigned URL. Reads `req.file.buffer`, calls `PutObjectCommand` directly.

### `generateViewUrl(s3Key)` → 7-day presigned GET URL
For admins viewing NID photos.

### `getObjectResult(s3Key)`
Returns a readable stream — used by the admin "proxy" route that streams photos through the backend so that the admin dashboard browser doesn't need direct S3 access.

## 2.5 geoService.js — PostGIS radius search

Single function: `findNearbyDonors({ lat, lng, bloodGroup, radiusKm })`.

Validation: lat ∈ [-90,90], lng ∈ [-180,180], radiusKm ∈ [0.1,100], bloodGroup must be one of the 8 enum values.

The SQL (via `prisma.$queryRaw`):

```sql
SELECT id, name, "fcmToken", latitude, longitude, district, "bloodGroup",
       ST_Distance(
         ST_MakePoint(longitude, latitude)::geography,
         ST_MakePoint(${lng}, ${lat})::geography
       ) AS distance_meters
FROM "User"
WHERE "isAvailable"    = true
  AND "emailVerified"  = true
  AND "verifiedStatus" = 'VERIFIED'::"VerifiedStatus"
  AND "bloodGroup"     = ${bloodGroup}::"BloodGroup"
  AND latitude         IS NOT NULL
  AND longitude        IS NOT NULL
  AND ST_DWithin(
        ST_MakePoint(longitude, latitude)::geography,
        ST_MakePoint(${lng}, ${lat})::geography,
        ${radiusMeters}
      )
ORDER BY distance_meters ASC
LIMIT 20
```

**Why every clause matters:**
- `ST_MakePoint(lon, lat)` — PostGIS uses **(longitude, latitude)** order, NOT (lat, lon). Common gotcha.
- `::geography` — casts the geometry to the spherical "geography" type so distance is measured in meters on a sphere (correct for GPS), not degrees on a flat plane.
- `ST_DWithin` — boolean: are these points within X meters?
- `ST_Distance` — actual distance, used for ORDER BY (closest first)
- `LIMIT 20` — caps result size; the initial radius push notifies at most 20 nearest donors.

---

# 3. Backend Routes

Every HTTP endpoint, what it does, what it validates, what it writes. Files: `backend/src/routes/{auth,donors,requests,verify,chat,caregivers,admin,cron}.js`.

## 3.1 auth.js — signup, login, email OTPs, forgot/reset password

### `POST /api/auth/signup` — public
Body: `{ email, password, name?, bloodGroup? }`. Validates: email regex, password ≥ 8 chars, bloodGroup in enum (if present). Hashes password with `bcrypt.hash(password, 10)`. Creates user with `emailVerified = false`, `verifiedStatus = 'UNVERIFIED'`, `isAvailable = true`. Returns `{ token, user }` (publicUser only — no passwordHash).

### `POST /api/auth/login` — public
Body: `{ email, password }`. Fetches user, `bcrypt.compare`. Returns `{ token, user }` or 401.

### `POST /api/auth/send-email-otp` — auth required
Body: `{ purpose: 'verify' | 'change_email' | 'change_password' }`. Generates 6-digit code, stores in `email_otp:${userId}:${purpose}` with 10-min TTL, sends via `emailService.sendOtp`.

### `POST /api/auth/verify-email-otp` — auth required
Body: `{ purpose, code, newEmail?, newPassword? }`. Validates code matches Redis. Deletes Redis key immediately. Then:
- `verify` → `emailVerified = true`
- `change_email` → updates email, resets `emailVerified = false` (the OTP was sent to the OLD address, so the new one isn't proven)
- `change_password` → bcrypt-hashes newPassword, updates

### `POST /api/auth/forgot-password` — public
**Always returns 200** to prevent email enumeration. Rate-limited 3/hour/email via `forgot_attempts:${email}` Redis counter. If user exists, generates `crypto.randomBytes(32).toString('hex')`, stores in `pwd_reset:${token}` (30-min TTL), emails the reset link.

### `POST /api/auth/reset-password` — public
Body: `{ token, newPassword }`. Looks up token in Redis, deletes immediately, updates passwordHash.

## 3.2 donors.js — profile + favourites + eligibility

All routes auth-required.

| Method | Path | What |
|---|---|---|
| PUT | `/profile` | Update name/bloodGroup/lat/lng/district. Joi-validated. ≥1 field required. |
| PUT | `/availability` | Set `isAvailable`. **Guards against re-enabling during 120-day wait** (returns 400 if `eligibleAgainAt > now`). |
| PUT | `/fcm-token` | Mobile sends Expo push token here on every app startup. |
| POST | `/log-donation` | Body `{ donatedAt? }`. Manual donation log. Sets `isAvailable=false`, `lastDonatedAt`, `eligibleAgainAt = donatedAt + 120 days`. |
| GET | `/eligibility` | Returns `{ isAvailable, eligibleAgainAt, daysRemaining, message }`. |
| GET | `/my-responses` | Returns this donor's ACCEPTED/DONATED responses, with the request and requester nested. |
| PUT | `/phone` | Set optional profile phone (used by Share Number button in chat). |
| GET | `/favourites` | List favourited users with verification info. |
| POST | `/favourites/:userId` | Idempotent add (catches P2002 unique-violation as success). Self-favouriting blocked (400). |
| DELETE | `/favourites/:userId` | Remove. |

## 3.3 requests.js — the blood-request lifecycle

### `POST /` — create request
Body: `{ bloodGroup, hospitalName, latitude, longitude, unitsNeeded? }`. Validates with Joi. `expiresAt = now + 6h`. Creates `BloodRequest`, then `geoService.findNearbyDonors({ radiusKm: 5 })`, then `prisma.donorResponse.createMany` with `skipDuplicates: true`, then `fcmService.sendToMany`. Returns `{ request, donorsNotified }`.

### `GET /browse` — donor-side, all OPEN requests
Paginated 50/page (`?offset=N`). Includes `requester: { id, name, district }`. Mobile filters in UI; backend enforces on accept.

### `GET /active` — requester-side
`{ requesterId, status: { in: ['OPEN', 'MATCHED'] } }` with responses + donors. Defined BEFORE `/:id` route.

### `GET /:id` — full detail
Includes requester + responses + donors.

### `POST /:id/accept` — the critical guarded endpoint
Checks in order:
1. Request exists
2. Status is OPEN (409 if not)
3. `req.user.bloodGroup === request.bloodGroup` (400 if not)
4. `req.user.isAvailable === true` (403 if not)
5. `eligibleAgainAt == null || eligibleAgainAt <= now` (403 if locked)
6. No existing `ACCEPTED` response on another `MATCHED` request (409 — "complete that donation first")

Then a Prisma `$transaction([])` upserts the DonorResponse to ACCEPTED and updates the request to MATCHED. Once MATCHED, the escalation cron skips this request.

### `POST /:id/confirm` — requester confirms donation
Body: `{ donorId }`. Validates: caller is requester, request status === MATCHED, donorResponse status === ACCEPTED. Then atomic transaction sets:
- DonorResponse: `status = DONATED, donatedConfirmedAt = now`
- BloodRequest: `status = FULFILLED`
- User (donor): `isAvailable = false, lastDonatedAt = now, eligibleAgainAt = now + 120 days`

## 3.4 verify.js — NID verification

| Method | Path | What |
|---|---|---|
| GET | `/upload-url` | Returns `{ uploadUrl, s3Key }` (presigned PUT, 10-min). Mobile uploads directly to S3. |
| POST | `/upload` | Multipart `photo` field, max 10 MB, image/* only (multer). Returns `{ s3Key }`. Used by mobile when direct-to-S3 has issues. |
| POST | `/submit` | Body `{ s3Key }`. **Validates key starts with `nid-photos/${userId}/`** to prevent users from claiming another user's photo. Sets `verifiedStatus = PENDING`. |
| GET | `/status` | Own status. |
| GET | `/admin/pending` | Admin: list PENDING users FIFO (oldest first). **Route order matters** — defined BEFORE `/admin/:userId`. |
| PUT | `/admin/:userId` | Admin: set status to VERIFIED/UNVERIFIED. Sends FCM if status is decided. Returns the user + a presigned `nidPhotoViewUrl`. |
| GET | `/admin/:userId/nid-photo` | Admin: proxy stream of the photo. Used in dev where MINIO_PUBLIC_URL would be unreachable from the browser. |

## 3.5 chat.js — 1-hour Redis-backed chat

Redis key: `chat:${requestId}` (LIST type, TTL 3600s set on first message only).

`verifyParticipant(requestId, userId)` (lines 25–33) checks that the caller is the donor or the requester on an ACCEPTED DonorResponse. Used by both endpoints.

### `POST /:requestId`
Body: `{ text }` (1–500 chars). RPUSH the message JSON. If key didn't exist before, set 3600s TTL — so the 1-hour clock starts on the first message.

### `GET /:requestId?since=N`
Returns `{ messages, total, ttlSeconds, expired }`. Uses `LLEN` for total, `LRANGE since -1` to fetch only new messages. Mobile polls every 4 seconds, sending `since = currentTotal`. When `ttl === -2` (key gone), returns `expired: false, messages: []` (treat as "not started yet" — see fix in §5).

## 3.6 caregivers.js — emergency SMS contacts

GET / POST / DELETE — max 5 per user, phone validated against `/^\+880[1-9]\d{9}$/`, priority sorted ascending.

## 3.7 admin.js — dashboard data

All routes admin-only.

| Endpoint | What |
|---|---|
| `GET /stats` | Returns 5 counters in parallel: totalUsers, pendingVerifications, activeRequests, totalDonations, totalRequests |
| `GET /users` | Paginated list. Filters: verifiedStatus, bloodGroup, search (name or email, case-insensitive). Returns `_count: { responses, requests }`. |
| `GET /requests` | Paginated list. Filters: status, bloodGroup. Includes requester + response count. |

## 3.8 cron.js — Cloudflare-Worker-triggered jobs

Auth: `x-cron-secret` header must match `CRON_SECRET`. Same shared secret is configured on the Cloudflare Worker.

### `POST /escalate` — every minute

Two levels, each guarded by **optimistic locking**:

```js
const claimed = await prisma.bloodRequest.updateMany({
  where: { id: request.id, escalationLevel: 0, status: 'OPEN' },
  data:  { escalationLevel: 1, escalatedAt: now },
});
if (claimed.count === 0) continue; // another invocation already grabbed it
```

- **Level 1 (T+15 min):** find OPEN requests with `escalationLevel=0` and `createdAt <= now - 15min`. Try to claim. On success, find donors within **15 km**, push-notify them.
- **Level 2 (T+30 min):** find OPEN requests with `escalationLevel=1` and `createdAt <= now - 30min`. Try to claim. On success, SMS all the requester's registered caregivers (in priority order).

Why this works: when a donor accepts, the request status becomes MATCHED → the cron's `status: 'OPEN'` filter excludes it → escalation stops automatically. No explicit cancellation needed.

### `POST /expiry` — every 15 minutes
`updateMany` where `status = OPEN, expiresAt <= now` → set status to EXPIRED.

### `POST /eligibility` — daily 00:00 UTC (06:00 BST)
Find users where `isAvailable = false AND eligibleAgainAt <= now`. Update to `isAvailable = true, eligibleAgainAt = null`. Send push to each: "You can donate again!"

---

# 4. Mobile Foundations

Files: `mobile/App.js`, `mobile/app.json`, `mobile/eas.json`, `mobile/src/config.js`, `mobile/src/services/api.js`, `mobile/src/store/{authStore,requestStore}.js`, `mobile/src/utils/formatters.js`, `mobile/src/navigation/RootNavigation.js`, `mobile/src/hooks/usePushNotifications.js`, `mobile/src/components/BloodGroupPicker.js`.

## 4.1 App.js — the navigation tree

```
App.js
└── RootNavigator (conditional on token)
    │
    ├── [no token]  AuthNavigator
    │                 ├── SignIn
    │                 ├── SignUp
    │                 └── ForgotPassword
    │
    └── [token]     Root Stack
                      ├── MainTabs (bottom tabs)
                      │     ├── 🏠 Home     → HomeScreen
                      │     ├── 🔍 Browse   → BrowseRequestsScreen
                      │     ├── 🩸 Request  → RequestStack
                      │     │                  ├── RequestBlood
                      │     │                  └── ActiveRequest
                      │     ├── 💉 Donate   → DonorAcceptedScreen
                      │     └── 👤 Profile  → ProfileStack
                      │                        ├── DonorProfile
                      │                        ├── Verification
                      │                        ├── Caregivers
                      │                        └── Favourites
                      ├── DonorRequest (modal — opened from push notification)
                      └── Chat (modal — 1-hr temp chat)
```

`RootNavigator` reads the token from Zustand. When `logout()` is called, token becomes null and React re-renders to AuthNavigator. `ErrorBoundary` (a class component) catches React crashes and shows a retry screen.

## 4.2 app.json + eas.json

`app.json`:
- `name: "Blood Bridge"`, `slug: "blood-bridge"`, `version: "1.0.0"`, `sdkVersion: "54.0.0"`
- `orientation: "portrait"`, `userInterfaceStyle: "light"`
- `icon`, `splash`, `android.adaptiveIcon` paths into `./assets/`
- Android permissions: `ACCESS_FINE_LOCATION`, `CAMERA`, `READ_MEDIA_IMAGES`, etc.
- iOS infoPlist usage descriptions for location/camera/gallery
- `plugins`: `expo-notifications` (with `color: '#DC2626'`), `expo-location`, `expo-image-picker`
- `extra.eas.projectId` links the local project to EAS for cloud builds

`eas.json` build profiles: `preview` → APK, `production` → AAB (for Play Store).

## 4.3 config.js — API_BASE_URL + COLORS

`API_BASE_URL = 'https://blood-bridge-dev.vercel.app/api'` (production). Commented alternatives for Android emulator (`http://10.0.2.2:3000/api`) and physical-device-on-LAN (`http://192.168.x.x:3000/api`).

`COLORS` palette: `primary #DC2626`, `primaryDark #B91C1C`, `primaryLight #FEE2E2`, `success #16A34A`, `warning #D97706`, `info #2563EB`, `text #111827`, `textMuted #6B7280`, `border #E5E7EB`, `background #F9FAFB`, `white`.

## 4.4 services/api.js — axios with three interceptors

```js
const api = axios.create({ baseURL: API_BASE_URL, timeout: 10000 });
```

**Request interceptor 1** (lines 30–33): if URL contains `/verify/upload`, bump timeout to 60s (slow mobile uploads).

**Request interceptor 2** (lines 38–47): reads `useAuthStore.getState().token` at *request time* (not at setup time) and attaches `Authorization: Bearer ${token}`. `require()` is used to dodge a circular dependency.

**Response interceptor** (lines 50–61): on 401 → `useAuthStore.getState().logout()`. The navigation switch happens automatically because App.js renders based on the token state.

## 4.5 store/authStore.js — Zustand + persist

```js
{
  token: null,
  user:  null,
  login:      (token, user) => set({ token, user }),
  logout:     () => set({ token: null, user: null }),
  updateUser: (updates) => set((s) => ({ user: { ...s.user, ...updates } })),
}
```

`persist` middleware stores the state in AsyncStorage under the key `blood-bridge-auth`. On app launch, state is rehydrated → token is restored → RootNavigator renders MainTabs without requiring a re-login.

## 4.6 store/requestStore.js — NOT persisted

`activeRequests`, `currentRequest`, `loading`, `error`. Actions: `fetchActiveRequests`, `fetchRequest(id)`, `createRequest(data)` (optimistically prepends to local list), `clearError`.

## 4.7 utils/formatters.js — display helpers

- `BLOOD_GROUPS` array — `[{ value: 'A_POS', label: 'A+' }, …]`
- `formatBloodGroup('A_POS')` → `'A+'`; `null` → `'—'`
- `formatDate(iso)` → `'22 Apr 2026'` (en-GB locale)
- `timeAgo(iso)` → `'just now' | 'Xm ago' | 'Xh ago' | 'Xd ago'`
- `formatRequestStatus(status)` → `{ label, color }` mapping OPEN/MATCHED/FULFILLED/EXPIRED to colors

## 4.8 navigation/RootNavigation.js — out-of-tree navigation

```js
export const navigationRef = createNavigationContainerRef();
export function navigate(name, params) {
  if (navigationRef.isReady()) navigationRef.navigate(name, params);
}
```

`navigationRef` is passed to `<NavigationContainer>` in App.js. The exported `navigate()` function lets non-React code (like push notification handlers) navigate without needing access to the React context.

## 4.9 hooks/usePushNotifications.js — Expo push setup

```js
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true, // show even when app is foregrounded
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function usePushNotifications() {
  const token = useAuthStore((s) => s.token);
  useEffect(() => {
    if (!token) return;
    registerForPushNotifications();
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.requestId) navigate('DonorRequest', { requestId: data.requestId });
    });
    return () => sub.remove();
  }, [token]);
}
```

Registration: Android notification channel → permission request → `Notifications.getExpoPushTokenAsync({ projectId })` → `api.put('/donors/fcm-token', { fcmToken })`.

## 4.10 components/BloodGroupPicker.js — 2×4 grid

Props: `value`, `onChange(value)`, `error?`. Maps over `BLOOD_GROUPS`, renders TouchableOpacity for each. Selected: red bg + red text. Error (when not selected): red border.

---

# 5. Mobile Screens

All 14 screens under `mobile/src/screens/`.

## 5.1 Auth flow — SignIn / SignUp / ForgotPassword

**SignInScreen:** email + password, inline validation on blur (clears on type), password eye toggle (`🙈/👁`), submit disabled until both fields have values. POST `/auth/login` → `useAuthStore.login(token, user)`.

**SignUpScreen:** email + password + name + bloodGroup (via BloodGroupPicker). Live password strength helper: red "too short (3/8)" → green "✓ Looks good" at ≥8. Eye toggle. Submit disabled until all valid + bloodGroup chosen. POST `/auth/signup` → `login(...)`.

**ForgotPasswordScreen:** email only. Inline validation. POST `/auth/forgot-password`. After success, shows the success screen embedding the entered email in bold. Even if the backend returned an error, the UI shows success (no email enumeration).

## 5.2 HomeScreen — dashboard

State: `eligibility` (fetched), `loading`, `toggling`, `fetchError`, `lastFetchedAt`. `useFocusEffect` re-fetches every time the tab is focused.

Key derivation: `isLocked = !isAvailable || (eligibleAgainAt && new Date(eligibleAgainAt) > Date.now())`.

Render:
- Profile card with name, district, blood group badge
- Verification banner if `verifiedStatus !== 'VERIFIED'`
- Error banner with Retry link if eligibility fetch failed
- Eligibility card: green ("You can donate!") or red with countdown
- Availability toggle — disabled when locked, with explanatory text
- Two CTA buttons: Request Blood, Browse Open Requests
- Lock hint near Browse when locked

## 5.3 BrowseRequestsScreen

Lists all OPEN requests across BD. State: `requests`, `loading`, `refreshing`, `lastFetchedAt`.

`isLocked` derivation same as HomeScreen. When locked, all Accept buttons replaced with "Locked until X" chip. Non-matching blood groups → dimmed card (`cardDimmed` style) + greyed badge + "Not your blood group" chip.

**Optimistic update on accept** (line 76): `setRequests(rs => rs.filter(r => r.id !== request.id))` immediately, then `fetchRequests()` to confirm.

## 5.4 RequestBloodScreen

Form: bloodGroup (picker), hospitalName, location (GPS button), unitsNeeded (+/- stepper, bounded 1–10). `requestForegroundPermissionsAsync` → `getCurrentPositionAsync({ accuracy: Balanced })`. Coordinates shown to 5 decimals. Submit calls `useRequestStore.createRequest(...)`.

## 5.5 ActiveRequestScreen — requester's view

State: `activeRequests` (from store), `confirmingId`, `favourites: Set`.

**Favourites optimistic update + rollback pattern:**
```js
const next = new Set(favourites);
if (next.has(id)) next.delete(id); else next.add(id);
setFavourites(next);            // optimistic
try { await api.post/delete... }
catch { setFavourites(favourites); }  // rollback
```

Confirm donation: Alert.alert → POST `/requests/:id/confirm { donorId }` → re-fetch.

Escalation banner shown when `escalationLevel > 0`. Waiting banner replaces "no donors yet" plain text.

## 5.6 DonorRequestScreen — push-notification deep link

Receives `requestId` in route params from the push notification handler. Fetches the request. Derives `matches = userBloodGroup === request.bloodGroup` and `isLocked`.

Render branches:
- OPEN + matches + not locked → green "✓ You can donate" banner + 3-step "What happens next" + Accept button
- OPEN + matches + locked → red lock banner instead of Accept
- OPEN + not matches → red "Requires X donors" banner, no Accept
- Not OPEN → status-specific closed copy ("Already matched", "Donation completed", "This request has expired")

## 5.7 DonorAcceptedScreen — donor's view

Fetches `/donors/my-responses` (ACCEPTED + DONATED). Per card: Chat button + Favourite heart toggle. DONATED state shows confirmation banner instead of action buttons. Same favourites optimistic pattern.

## 5.8 DonorProfileScreen — the heaviest screen

State: name, bloodGroup, district, lat, lng, phone, initialPhone (for change detection), loading, locating.

OTP modal state: `modalOpen` ('verify' | 'change_email' | 'change_password' | null), otp, newEmail (+ error), newPassword (+ showNewPassword), modalLoading, resendSeconds, `resendTimerRef`, `mountedRef`.

**Three flows, one modal:**
- Modal content branches on `modalOpen`
- `verify` → just the OTP input
- `change_email` → new email field (with inline regex validation) + OTP
- `change_password` → new password (with eye toggle, length helper) + OTP

**Resend countdown:** On `startOtpFlow`, sets `resendSeconds = 60` and an interval that decrements every second. `mountedRef` guards every setState so a tick fired after unmount is a no-op. Cleanup useEffect clears the interval.

**Phone save:** Separate Save button next to phone field; disabled when `phone.trim() === initialPhone.trim()` (no change).

Profile save: name + bloodGroup + district + lat + lng. Location button: permission → coords → state.

Navigation: Favourites + Caregivers + Logout (with confirmation alert).

## 5.9 VerificationScreen — NID upload

State: `status` (from user.verifiedStatus initially), `uploading`, `pickedAsset` (from ImagePicker — has uri, mimeType, fileSize).

Two-step flow:
1. Tap "📷 Choose NID Photo" → `ImagePicker.launchImageLibraryAsync({ quality: 0.8 })` → set pickedAsset
2. Tap "✓ Confirm & Upload" → FormData → POST `/verify/upload` → POST `/verify/submit { s3Key }` → status becomes PENDING

The FormData upload uses `transformRequest: (data) => data` to bypass axios's default JSON serialization.

`useFocusEffect` re-fetches status when the screen regains focus — so admin approvals appear without restarting the app.

## 5.10 CaregiversScreen

Max 5 caregivers. Modal form: name + phone (regex `/^\+880[1-9]\d{9}$/`). Priority badge (index + 1). Long-press or trailing × button to delete (with confirmation Alert).

## 5.11 FavouritesScreen

Lists `/donors/favourites`. Each row: avatar with 2-letter initials, name, bloodGroup + district, optional "✓ VERIFIED" green pill (only when both `emailVerified` AND `verifiedStatus === 'VERIFIED'`), trailing × button (with hitSlop for easier tapping).

## 5.12 ChatScreen — 1-hour temporary chat

Most complex screen. State: messages, inputText, sending, expired, ttlSeconds, loading, newMessages, atBottom. Refs: totalRef, listRef, pollRef, mountedRef.

**Polling:** `poll()` is a useCallback that GETs `/chat/${requestId}?since=${totalRef.current}`. Guards setState behind `mountedRef.current`. If `data.expired`, sets expired and clears the interval. New messages append; if at bottom, auto-scroll, else increment `newMessages` for the badge.

`setInterval(poll, 4000)` in useEffect, cleared on unmount.

**Header chip countdown:**
```js
useEffect(() => {
  const showChip = expired || (ttlSeconds !== null && ttlSeconds > 0);
  navigation.setOptions({
    headerRight: () => showChip ? <Chip>{expired ? 'Expired' : `🕐 ${formatTtl(ttlSeconds)}`}</Chip> : null,
  });
}, [ttlSeconds, expired, navigation]);
```

**Share Number flow:** Combined single Alert. If no phone in profile → alert with "Open profile" action. If phone exists → confirm Alert. On confirm, POSTs `"📞 My number: +880..."` as a regular chat message.

**Scroll tracking:** `handleScroll` detects "near bottom" (within 40px). When at bottom AND newMessages > 0, badge clears.

Input has `maxLength = MAX_MESSAGE_LEN`, character counter shown next to Send button.

---

# 6. Admin + Infrastructure

## 6.1 Admin dashboard (Next.js 15)

`admin/middleware.js` (lines 3–20): protected routes. `/reset` is public (linked from password reset emails). `/login` redirects to `/dashboard` if cookie present. Everything else requires the `admin_secret` cookie.

`admin/lib/api.js`: axios with two interceptors — request injects `x-admin-secret` from cookie; response on 401 removes cookie and redirects to `/login`.

`admin/app/login/page.js`: dark-themed form. Verifies the secret by GETting `/admin/stats` with the header; on success, saves cookie (7-day expiry) and redirects.

`admin/app/reset/page.js`: public reset page. Reads `?token=` from URL. Validates password ≥8 chars + confirm matches. POSTs `/auth/reset-password` and shows success.

`admin/app/(main)/dashboard/page.js`: 4 StatCards (Total Users, Pending Verifications, Active Requests, Total Donations) from `/admin/stats`.

`admin/app/(main)/users/page.js`: paginated user table. Filters: search (name/email, Enter to submit), verifiedStatus, bloodGroup. Columns: name, email (with ✓ if verified), blood, district, status badge, availability badge, request count, joined date.

`admin/app/(main)/requests/page.js`: paginated requests. Filters: status, bloodGroup. Columns include escalation level (0 gray, 1 orange, 2+ red) and expiresAt (red if past).

`admin/app/(main)/verifications/page.js`: PENDING NID review. "View Photo" fetches `/verify/admin/${userId}/nid-photo` as a blob, shows in a modal. "Approve" / "Reject" PUT to `/verify/admin/${userId}` with status — removes from local list on success.

`admin/components/Sidebar.js`: dark-themed sidebar. `usePathname` to highlight active link. Logout removes cookie and redirects.

`admin/components/Badge.js`: status → Tailwind class mapping (VERIFIED green, PENDING yellow, OPEN blue, MATCHED purple, FULFILLED green, EXPIRED gray, etc.).

## 6.2 Cloudflare Worker (cron scheduler)

`cloudflare-worker/wrangler.toml`:
```toml
name = "blood-bridge-cron"
main = "index.js"
compatibility_date = "2024-01-01"

[triggers]
crons = [
  "* * * * *",       # every minute → escalate
  "*/15 * * * *",    # every 15 min → expiry
  "0 0 * * *",       # daily 00:00 UTC → eligibility
]
```

`cloudflare-worker/index.js`: `scheduled(event, env, ctx)` handler. Matches `event.cron` to pick which endpoint to call. POSTs to `${API_BASE_URL}/cron/{escalate|expiry|eligibility}` with the `x-cron-secret` header. Logs response status + body. Env vars `API_BASE_URL` and `CRON_SECRET` are set in the Cloudflare Workers dashboard.

## 6.3 Prisma schema — every model

The generator block opts in to the `omitApi` preview feature so queries can drop sensitive columns at the SQL level (see §1.4 for the use in `authMiddleware`):

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["omitApi"]
}
```

`omitApi` is a preview feature in Prisma 5.16-5.x and GA in 6.x. The project floors `@prisma/client` and `prisma` at `^5.22.0` in `backend/package.json` so fresh installs always have it.

### User
```
id              String  @id @default(uuid())
email           String  @unique
emailVerified   Boolean @default(false)
passwordHash    String
phone           String?         // optional, shared via chat
name            String?
nidPhotoUrl     String?
verifiedStatus  enum(UNVERIFIED|PENDING|VERIFIED) @default(UNVERIFIED)
bloodGroup      enum?
latitude        Float?
longitude       Float?
district        String?
isAvailable     Boolean @default(true)
lastDonatedAt   DateTime?
eligibleAgainAt DateTime?
fcmToken        String?
createdAt       DateTime @default(now())

@@index([verifiedStatus])
@@index([isAvailable, verifiedStatus])  // compound index for PostGIS query
```

Plus relations: `requests` (RequesterRequests one-to-many), `responses` (one-to-many), `caregivers` (one-to-many), `favourites` (self-relation as the favouriter), `favouritedBy` (self-relation as the favourited).

### BloodRequest
```
id, requesterId → User, bloodGroup, hospitalName, latitude, longitude,
unitsNeeded (default 1), status (default OPEN),
escalationLevel (default 0), escalatedAt, expiresAt, createdAt

@@index([status])
@@index([requesterId])
@@index([status, escalationLevel])  // compound for cron escalation
```

### DonorResponse
```
id, requestId → BloodRequest (Cascade), donorId → User (Cascade),
status (default NOTIFIED), notifiedAt, respondedAt, donatedConfirmedAt

@@unique([requestId, donorId])  // one response per donor per request
@@index([donorId])
@@index([requestId])
```

### Caregiver
```
id, userId → User (Cascade), name, phone, priority (default 1)

@@unique([userId, phone])
```

### Favourite (self-relation)
```
id, userId → User (Cascade, "FavouriteBy"), favouriteId → User (Cascade, "FavouritedBy"),
createdAt

@@unique([userId, favouriteId])
@@index([userId])
```

### Migration
Single SQL file at `backend/prisma/migrations/20260520000000_init/migration.sql` — creates all enums, tables, indices, foreign keys with appropriate ON DELETE CASCADE policies.

## 6.4 Docker setup

`backend/docker-compose.yml` services:

| Service | Image | Port | Volume | Healthcheck |
|---|---|---|---|---|
| postgres | `postgis/postgis:15-3.3` | 5432 | pgdata + init.sql | `pg_isready` |
| redis | `redis:7-alpine` | 6379 | redisdata | `redis-cli ping`. `--appendonly yes` for AOF |
| minio | `minio/minio:latest` | 9000 + 9001 | miniodata | `mc ready local` |
| backend | local Dockerfile | 3000 | — | depends_on healthchecks |

Backend startup command: `sh -c "npx prisma migrate deploy && npm start"` — applies pending migrations, then boots.

`backend/Dockerfile`: multi-stage `node:20-slim` (Alpine fails Prisma). Builder stage runs `npm ci` (which triggers `prisma generate` via postinstall). Runtime stage copies node_modules + prisma + src. HEALTHCHECK polls `/health` every 30s.

`backend/init.sql`: `CREATE EXTENSION IF NOT EXISTS postgis;` — runs once on container creation via `/docker-entrypoint-initdb.d/`.

## 6.5 CI/CD pipelines

`.github/workflows/ci.yml` — runs on every push + PR to main:
- **backend** job: spins up postgres (`postgis/postgis:15-3.3`) + redis as services, installs deps, runs `npm audit --audit-level=high --omit=dev`, `prisma generate`, `prisma migrate deploy`, `npm test --if-present`.
- **mobile** job: install + audit.
- **admin** job: install + audit + `npm run build` (Next.js compile + type-check) with `NEXT_PUBLIC_API_URL` set.
- **docker** job (depends on backend): `docker build -t blood-bridge-backend:ci .`

`.github/workflows/deploy.yml` — manual `workflow_dispatch` with a `target` dropdown (`backend | admin | cloudflare-worker | all`). Three jobs gated by `inputs.target`:
- `deploy-backend` / `deploy-admin`: `npx vercel --prod --yes --token $VERCEL_TOKEN` with the corresponding project ID
- `deploy-worker`: `cd cloudflare-worker && npm ci && npx wrangler deploy` with CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID

Required GitHub Secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_BACKEND_PROJECT_ID`, `VERCEL_ADMIN_PROJECT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

Branch protection on `main` (set via `gh api`):
- Direct pushes blocked
- CI checks must pass (Backend, Mobile, Admin contexts)
- No force-push, no deletion

## 6.6 Icon generator

`mobile/scripts/generate-icons.py` — Python + PIL.

`cubic_bezier_points(start, c1, c2, end, steps)`: parametric Bezier sampling.

`teardrop_polygon(canvas_size)`:
- Renders at 4× scale (4096×4096 for 1024 output) for antialiasing
- Bottom = circle ("bowl")
- Top = two cubic Bezier curves from apex to the circle tangents
- Bottom arc traced via trig (sweep from π to 0)
- Polygon points: left curve + bottom arc + reversed right curve
- Resized to target with LANCZOS

Three outputs:
- `icon.png` — 1024×1024 red rounded square + white teardrop (iOS + fallback)
- `adaptive-icon.png` — 1024×1024 WHITE teardrop on TRANSPARENT (Android adaptive foreground; the system composites it over the red `backgroundColor`)
- `splash.png` — 1284×2778 red full-bleed + white teardrop + "Blood Bridge" wordmark

`report_colors()` analyzes the output and prints the top dominant colors as a sanity check.

Run: `python3 mobile/scripts/generate-icons.py`.

---

## Closing notes — how the pieces connect

A typical request flow, end-to-end:

1. User opens app → App.js renders RootNavigator → token check → renders MainTabs.
2. `usePushNotifications` hook registers the Expo push token to `/donors/fcm-token`.
3. User taps "Request Blood" → fills form → mobile POSTs to `/requests`.
4. Backend route validates Joi schema → `prisma.bloodRequest.create()` → `geoService.findNearbyDonors({ radiusKm: 5 })` (PostGIS query) → `prisma.donorResponse.createMany` → `fcmService.sendToMany` to all nearby donor tokens.
5. Expo Push delivers notification to each donor's phone.
6. Donor taps notification → `usePushNotifications` listener → `navigate('DonorRequest', { requestId })` (out-of-tree).
7. DonorRequestScreen GETs `/requests/:id`, checks blood-group match + isLocked, shows Accept.
8. Donor taps Accept → POST `/requests/:id/accept`. Backend's five guards run (status, blood group, isAvailable, eligibleAgainAt, concurrent ACCEPTED). On pass, transaction sets request MATCHED + response ACCEPTED.
9. Both donor and requester open ChatScreen → polls `/chat/${requestId}` every 4 seconds.
10. Requester confirms donation → POST `/requests/:id/confirm`. Transaction sets request FULFILLED + response DONATED + donor `isAvailable=false, eligibleAgainAt = now + 120 days`.
11. The Cloudflare Worker, running every minute, calls `/cron/escalate`. Since this request is no longer OPEN, escalation skips it.
12. 120 days later, the daily `/cron/eligibility` job flips the donor back to `isAvailable=true` and pushes "You can donate again!"

That's the whole app, line by line. Whenever you're editing, refer back to this document for the file/function you're touching — every section names exact line numbers and shows the actual code.
