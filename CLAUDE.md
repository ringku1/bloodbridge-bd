# Blood Donor App — Project Brief for Claude Code

> This file gives you full context on what we are building, why, and how.
> Read it entirely before writing any code.

---

## What we are building

A mobile-first blood donor app for Bangladesh that solves three real problems existing apps (Rokto, Bloodline) do not:

1. **Verified donor + masked contact** — OTP-verified phone auth, NID photo upload for donor verification, Twilio Proxy masked calling so neither requester nor donor ever sees each other's real phone number.
2. **120-day auto-eligibility tracker** — when a donation is confirmed, the donor is auto-marked unavailable. A daily cron flips them back to available after 120 days and sends a push notification.
3. **Caregiver escalation system** — if no donor accepts within 15 minutes, radius expands and more donors are notified. At 30 minutes, an SMS goes to the requester's registered caregivers and nearby organizations.

---

## Tech stack

### Mobile (frontend)

- **React Native** (Expo managed workflow)
- **Zustand** for state management
- **React Native Maps** + Google Maps API for geolocation
- **Expo Push Notification Service** for push notifications
- **Axios** for HTTP requests

### Backend

- **Node.js + Express**
- **JWT** for auth tokens
- **OTP via SMS** — SSL Wireless (Bangladesh SMS gateway)
- **Twilio Proxy API** for masked phone calls
- **Backblaze B2** (S3-compatible) for NID photo storage (presigned URLs)
- **Multer** for file upload middleware

### Database

- **PostgreSQL** with **PostGIS** extension for geospatial radius queries
- **Redis** for OTP caching (ioredis)
- **Prisma ORM** for schema and queries

### Infrastructure

- **Docker + docker-compose** (postgres, redis, minio, backend as services) for local dev
- **Vercel** — API (stateless Express serverless functions)
- **Neon** — PostgreSQL + PostGIS (production)
- **Redis Cloud** — Redis OTP cache (production)
- **Cloudflare Workers** — cron scheduler (escalation, expiry, eligibility); free, no credit card
- **Backblaze B2** — NID photo storage (production, free 10 GB, no credit card)
- **GitHub Actions** for CI/CD

---

## Folder structure

```
/
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.js          # OTP send/verify, JWT issue
│   │   │   ├── donors.js        # Profile, availability, blood group
│   │   │   ├── requests.js      # Post request, get nearby, update status
│   │   │   ├── verify.js        # NID upload, verification status
│   │   │   ├── call.js          # Twilio Proxy session create/end
│   │   │   └── cron.js          # Protected cron endpoints called by Cloudflare Worker
│   │   ├── services/
│   │   │   ├── smsService.js    # SSL Wireless wrapper
│   │   │   ├── fcmService.js    # Expo push notification wrapper
│   │   │   ├── twilioService.js # Proxy session management
│   │   │   ├── s3Service.js     # Presigned URL generation
│   │   │   └── geoService.js    # PostGIS query helpers
│   │   ├── middleware/
│   │   │   ├── auth.js          # JWT verify middleware
│   │   │   └── upload.js        # Multer config
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   ├── app.js
│   │   └── server.js
│   ├── .env.example
│   ├── docker-compose.yml
│   └── package.json
│
├── cloudflare-worker/
│   ├── index.js                 # Cloudflare Worker: calls /api/cron/* on schedule
│   └── wrangler.toml            # Cron triggers: every min, every 15 min, daily 00:00 UTC
│
└── mobile/
    ├── src/
    │   ├── screens/
    │   │   ├── AuthScreen.js
    │   │   ├── HomeScreen.js
    │   │   ├── RequestBloodScreen.js
    │   │   ├── DonorProfileScreen.js
    │   │   ├── ActiveRequestScreen.js
    │   │   └── VerificationScreen.js
    │   ├── components/
    │   ├── store/               # Zustand stores
    │   ├── services/            # Axios API calls
    │   └── utils/
    ├── app.json
    └── package.json
```

---

## Database schema (Prisma)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum BloodGroup {
  A_POS
  A_NEG
  B_POS
  B_NEG
  O_POS
  O_NEG
  AB_POS
  AB_NEG
}

enum VerifiedStatus {
  UNVERIFIED
  PENDING
  VERIFIED
}

enum RequestStatus {
  OPEN
  MATCHED
  FULFILLED
  EXPIRED
}

enum ResponseStatus {
  NOTIFIED
  ACCEPTED
  REJECTED
  DONATED
}

model User {
  id               String         @id @default(uuid())
  phone            String         @unique
  phoneVerified    Boolean        @default(false)
  name             String?
  nidPhotoUrl      String?
  verifiedStatus   VerifiedStatus @default(UNVERIFIED)
  bloodGroup       BloodGroup?
  latitude         Float?
  longitude        Float?
  district         String?
  isAvailable      Boolean        @default(true)
  lastDonatedAt    DateTime?
  eligibleAgainAt  DateTime?
  fcmToken         String?
  createdAt        DateTime       @default(now())

  requests         BloodRequest[] @relation("RequesterRequests")
  responses        DonorResponse[]
  caregivers       Caregiver[]
}

model BloodRequest {
  id               String        @id @default(uuid())
  requesterId      String
  requester        User          @relation("RequesterRequests", fields: [requesterId], references: [id])
  bloodGroup       BloodGroup
  hospitalName     String
  latitude         Float
  longitude        Float
  unitsNeeded      Int           @default(1)
  status           RequestStatus @default(OPEN)
  escalationLevel  Int           @default(0)
  escalatedAt      DateTime?
  expiresAt        DateTime
  createdAt        DateTime      @default(now())

  responses        DonorResponse[]
}

model DonorResponse {
  id                   String         @id @default(uuid())
  requestId            String
  request              BloodRequest   @relation(fields: [requestId], references: [id])
  donorId              String
  donor                User           @relation(fields: [donorId], references: [id])
  status               ResponseStatus @default(NOTIFIED)
  proxySessionId       String?
  notifiedAt           DateTime       @default(now())
  respondedAt          DateTime?
  donatedConfirmedAt   DateTime?

  @@unique([requestId, donorId])
}

model Caregiver {
  id       String @id @default(uuid())
  userId   String
  user     User   @relation(fields: [userId], references: [id])
  name     String
  phone    String
  priority Int    @default(1)
}
```

> Note: Geospatial queries use raw SQL with PostGIS `ST_DWithin`. Prisma does not natively support PostGIS, so use `prisma.$queryRaw` for radius searches.

---

## Key API endpoints

### Auth

```
POST /api/auth/send-otp        body: { phone }
POST /api/auth/verify-otp      body: { phone, otp } → returns JWT
```

### Donor

```
PUT  /api/donors/profile       body: { name, bloodGroup, latitude, longitude, district }
PUT  /api/donors/fcm-token     body: { fcmToken }
POST /api/donors/log-donation  body: { donatedAt } → sets isAvailable=false, eligibleAgainAt
GET  /api/donors/eligibility   → { isAvailable, eligibleAgainAt, daysRemaining }
```

### Verification

```
GET  /api/verify/upload-url    → S3 presigned URL for NID photo upload
POST /api/verify/submit        body: { s3Key } → sets verifiedStatus=PENDING
GET  /api/verify/status        → { verifiedStatus }
```

### Blood requests

```
POST /api/requests             body: { bloodGroup, hospitalName, latitude, longitude, unitsNeeded }
GET  /api/requests/:id         → full request with responses
POST /api/requests/:id/accept  → donor accepts, creates Twilio Proxy session
POST /api/requests/:id/confirm → confirms donation happened
GET  /api/requests/active      → requester sees their open requests
```

### Masked calling

```
POST /api/call/initiate        body: { requestId } → returns { proxyNumberForDonor, proxyNumberForRequester }
DELETE /api/call/:sessionId    → ends proxy session
```

---

## Feature 1: Verified donor + masked contact

### How verification works

1. User hits `GET /api/verify/upload-url` → backend generates an S3 presigned PUT URL
2. Mobile uploads NID photo directly to S3 (no backend proxy, saves bandwidth)
3. User hits `POST /api/verify/submit` with the S3 key
4. Admin dashboard manually reviews and sets `verifiedStatus = VERIFIED`
5. Only verified donors appear in radius search results (filter: `verifiedStatus = 'VERIFIED'`)

### How masked calling works

1. When donor accepts a request, backend calls `twilioService.createProxySession(donorPhone, requesterPhone)`
2. Twilio returns two proxy numbers (one per participant)
3. Both numbers stored in `DonorResponse.proxySessionId`
4. Session auto-expires after 2 hours
5. Neither party sees the other's real number at any point

```js
// twilioService.js skeleton
const client = require("twilio")(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN,
);

async function createProxySession(donorPhone, requesterPhone) {
  const service = await client.proxy.v1.services(
    process.env.TWILIO_PROXY_SERVICE_SID,
  );
  const session = await service.sessions.create({
    uniqueName: `session_${Date.now()}`,
    ttl: 7200,
  });
  await session.participants.create({ identifier: donorPhone });
  await session.participants.create({ identifier: requesterPhone });
  return session.sid;
}
```

---

## Feature 2: 120-day auto-eligibility tracker

### Donation confirmation trigger

When `POST /api/requests/:id/confirm` is called:

```js
await prisma.user.update({
  where: { id: donorId },
  data: {
    isAvailable: false,
    lastDonatedAt: new Date(),
    eligibleAgainAt: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000),
  },
});
```

### Cron endpoint (routes/cron.js)

Called by the Cloudflare Worker daily at 00:00 UTC (= 06:00 AM BST).
Finds all donors whose `eligibleAgainAt <= now`, resets them, and sends Expo push notifications.

```
POST /api/cron/eligibility
Header: x-cron-secret: <CRON_SECRET>
```

---

## Feature 3: Caregiver escalation system

### How it works (no Bull queue)

Escalation is driven by a **Cloudflare Worker** calling `POST /api/cron/escalate` every minute.

The cron handler queries the DB directly:
- **Level 1** (T+15m): finds OPEN requests with `escalationLevel=0` and `createdAt <= now-15min`
  → expands radius to 15km, notifies new donors
- **Level 2** (T+30m): finds OPEN requests with `escalationLevel=1` and `createdAt <= now-30min`
  → SMS all registered caregivers

**Optimistic locking** prevents double-processing when the Worker fires multiple times close together:

```js
// Only claim the row if escalationLevel is still what we expect
const claimed = await prisma.bloodRequest.updateMany({
  where: { id: request.id, escalationLevel: 0, status: 'OPEN' },
  data:  { escalationLevel: 1, escalatedAt: now },
});
if (claimed.count === 0) continue; // already claimed by a concurrent invocation
```

### Why escalation stops automatically when a donor accepts

When a donor accepts, `requests.js` sets the request status to `MATCHED`. The cron query filters on `status: 'OPEN'`, so matched/fulfilled/expired requests are never picked up — no explicit cancellation step needed.

---

## PostGIS radius query

Since Prisma does not support PostGIS natively, use raw SQL:

```js
// geoService.js
async function findNearbyDonors({ lat, lng, bloodGroup, radiusKm }) {
  const radiusMeters = radiusKm * 1000;
  return prisma.$queryRaw`
    SELECT id, name, fcm_token, latitude, longitude,
           ST_Distance(
             ST_MakePoint(longitude, latitude)::geography,
             ST_MakePoint(${lng}, ${lat})::geography
           ) AS distance_meters
    FROM "User"
    WHERE is_available = true
      AND verified_status = 'VERIFIED'
      AND blood_group = ${bloodGroup}::"BloodGroup"
      AND ST_DWithin(
            ST_MakePoint(longitude, latitude)::geography,
            ST_MakePoint(${lng}, ${lat})::geography,
            ${radiusMeters}
          )
    ORDER BY distance_meters ASC
    LIMIT 20
  `;
}
```

> Enable PostGIS in your database with: `CREATE EXTENSION IF NOT EXISTS postgis;`

---

## Environment variables (.env.example)

```env
# Database
DATABASE_URL=postgresql://user:password@postgres:5432/blooddonor

# Redis (OTP cache only — no Bull queues)
REDIS_URL=redis://redis:6379

# JWT
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=30d

# Admin
ADMIN_SECRET=your_admin_secret_here

# Cron (Cloudflare Worker shared secret)
CRON_SECRET=your_cron_secret_here

# OTP (SSL Wireless - Bangladesh)
USE_MOCK_SMS=true
SSL_WIRELESS_API_KEY=your_api_key
SSL_WIRELESS_SID=your_sid

# Twilio Proxy
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PROXY_SERVICE_SID=your_proxy_service_sid

# File storage (MinIO in dev, Backblaze B2 in prod)
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_REGION=us-east-1
AWS_S3_BUCKET=blood-bridge-nid-photos
AWS_ENDPOINT=http://minio:9000
```

---

## docker-compose.yml

```yaml
version: "3.8"
services:
  postgres:
    image: postgis/postgis:15-3.3
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
      POSTGRES_DB: blooddonor
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  backend:
    build: ./backend
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - redis
    env_file:
      - ./backend/.env

volumes:
  pgdata:
```

> Use `postgis/postgis` image (not plain `postgres`) so PostGIS extension is available.

---

## Coding conventions

- Use `async/await` everywhere, no raw `.then()` chains
- Wrap all route handlers in a `try/catch` and use a central error handler middleware
- Use Prisma transactions (`prisma.$transaction`) when multiple DB writes must be atomic (e.g. confirm donation → update user + donor_response in one transaction)
- Never log raw phone numbers or JWT tokens to console
- All phone numbers stored in E.164 format: `+8801XXXXXXXXX`
- Blood group enum values in DB: `A_POS`, `A_NEG`, `B_POS`, `B_NEG`, `O_POS`, `O_NEG`, `AB_POS`, `AB_NEG`
- Distance always in meters internally; convert to km only for display

---

## Build order (recommended)

1. Docker setup — postgres + redis running locally
2. Prisma schema + migration + PostGIS extension
3. Auth routes — OTP send/verify, JWT issue
4. Donor profile — update blood group, location
5. Blood request — create, PostGIS radius search, Expo push
6. Cron routes — eligibility reset, request expiry, escalation (routes/cron.js)
7. Cloudflare Worker — cron scheduler (cloudflare-worker/)
8. NID verification — S3 presigned upload, admin status update
9. Twilio Proxy — masked call session on donor accept
10. Mobile app — screens wired to backend APIs

---

## What NOT to build (scope boundaries)

- No payment processing
- No blood bank inventory management (only volunteer donors)
- No web admin panel in this phase (manual DB review for NID verification is fine initially)
- No chat/messaging — only masked phone calls via Twilio Proxy
- No social features (likes, shares, donor leaderboard) in v1
