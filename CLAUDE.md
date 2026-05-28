# Blood Donor App — Project Brief for Claude Code

> This file gives you full context on what we are building, why, and how.
> Read it entirely before writing any code.

---

## What we are building

A mobile-first blood donor app for Bangladesh that solves three real problems existing apps (Rokto, Bloodline) do not:

1. **Verified donors** — email + password sign-in, email verification, and NID photo upload. Only users who are both email-verified and NID-verified appear in donor search results. Phone number is an optional profile field, shared in chat via a "Share Number?" button (no auto-call, no masked-number service).
2. **120-day auto-eligibility tracker** — when a donation is confirmed, the donor is auto-marked unavailable. A daily cron flips them back to available after 120 days and sends a push notification.
3. **Caregiver escalation system** — if no donor accepts within 15 minutes, radius expands and more donors are notified. At 30 minutes, an SMS goes to the requester's registered caregivers and nearby organizations.

Plus a browse page (donors see all open requests across the country and accept ones matching their blood group), a temporary 1-hour Redis-backed chat after match, and a server-side favourites list.

---

## Tech stack

### Mobile (frontend)

- **React Native** (Expo managed workflow)
- **Zustand** for state management
- **Expo Location** for GPS
- **Expo Push Notification Service** for push notifications
- **Axios** for HTTP requests

### Backend

- **Node.js + Express**
- **JWT** for auth tokens (email + password)
- **bcryptjs** for password hashing
- **Nodemailer + Gmail SMTP** for email OTPs and password reset
- **SSL Wireless** SMS gateway — only for caregiver SMS at level-2 escalation
- **Backblaze B2** (S3-compatible) for NID photo storage (presigned URLs)
- **Multer** for file upload middleware

### Database

- **PostgreSQL** with **PostGIS** extension for geospatial radius queries
- **Redis** for OTP / reset-token cache and the 1-hour chat (ioredis)
- **Prisma ORM** for schema and queries

### Infrastructure

- **Docker + docker-compose** (postgres, redis, minio, backend) for local dev
- **Vercel** — API + admin dashboard (stateless serverless)
- **Neon** — PostgreSQL + PostGIS (production)
- **Redis Cloud** — Redis (production)
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
│   │   │   ├── auth.js          # signup, login, email OTP, forgot/reset password
│   │   │   ├── donors.js        # profile, availability, phone, favourites
│   │   │   ├── requests.js      # post, browse, accept, confirm
│   │   │   ├── verify.js        # NID upload, verification status, admin review
│   │   │   ├── chat.js          # 1-hour Redis-backed chat
│   │   │   ├── caregivers.js    # caregiver phone list
│   │   │   ├── admin.js         # dashboard stats / users / requests
│   │   │   └── cron.js          # protected cron endpoints called by Cloudflare Worker
│   │   ├── services/
│   │   │   ├── emailService.js  # Nodemailer + Gmail SMTP wrapper
│   │   │   ├── smsService.js    # SSL Wireless wrapper (caregiver SMS only)
│   │   │   ├── fcmService.js    # Expo push notification wrapper
│   │   │   ├── s3Service.js     # Presigned URL generation
│   │   │   └── geoService.js    # PostGIS query helpers
│   │   ├── middleware/
│   │   │   ├── auth.js          # JWT verify middleware
│   │   │   ├── adminAuth.js     # x-admin-secret check
│   │   │   └── errorHandler.js  # central error handler
│   │   ├── app.js
│   │   └── server.js
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── .env.example
│   ├── docker-compose.yml
│   └── package.json
│
├── cloudflare-worker/
│   ├── index.js                 # Cloudflare Worker: calls /api/cron/* on schedule
│   └── wrangler.toml            # Cron triggers: every min, every 15 min, daily 00:00 UTC
│
├── admin/                       # Next.js 15 admin dashboard (app router)
│   ├── app/
│   │   ├── (main)/dashboard,users,requests,verifications/
│   │   ├── login/
│   │   └── reset/               # Public password-reset page (linked from email)
│   └── middleware.js
│
└── mobile/
    ├── src/
    │   ├── screens/
    │   │   ├── SignInScreen.js
    │   │   ├── SignUpScreen.js
    │   │   ├── ForgotPasswordScreen.js
    │   │   ├── HomeScreen.js
    │   │   ├── BrowseRequestsScreen.js
    │   │   ├── RequestBloodScreen.js
    │   │   ├── ActiveRequestScreen.js
    │   │   ├── DonorAcceptedScreen.js
    │   │   ├── DonorRequestScreen.js
    │   │   ├── DonorProfileScreen.js
    │   │   ├── VerificationScreen.js
    │   │   ├── CaregiversScreen.js
    │   │   ├── FavouritesScreen.js
    │   │   └── ChatScreen.js
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

enum BloodGroup     { A_POS A_NEG B_POS B_NEG O_POS O_NEG AB_POS AB_NEG }
enum VerifiedStatus { UNVERIFIED PENDING VERIFIED }
enum RequestStatus  { OPEN MATCHED FULFILLED EXPIRED }
enum ResponseStatus { NOTIFIED ACCEPTED REJECTED DONATED }

model User {
  id              String         @id @default(uuid())
  email           String         @unique
  emailVerified   Boolean        @default(false)
  passwordHash    String
  phone           String?        // optional, shared in chat via "Share Number"
  name            String?
  nidPhotoUrl     String?
  verifiedStatus  VerifiedStatus @default(UNVERIFIED)
  bloodGroup      BloodGroup?
  latitude        Float?
  longitude       Float?
  district        String?
  isAvailable     Boolean        @default(true)
  lastDonatedAt   DateTime?
  eligibleAgainAt DateTime?
  fcmToken        String?
  createdAt       DateTime       @default(now())

  requests     BloodRequest[]   @relation("RequesterRequests")
  responses    DonorResponse[]
  caregivers   Caregiver[]
  favourites   Favourite[]      @relation("FavouriteBy")
  favouritedBy Favourite[]      @relation("FavouritedBy")
}

model BloodRequest {
  id              String        @id @default(uuid())
  requesterId     String
  requester       User          @relation("RequesterRequests", fields: [requesterId], references: [id])
  bloodGroup      BloodGroup
  hospitalName    String
  latitude        Float
  longitude       Float
  unitsNeeded     Int           @default(1)
  status          RequestStatus @default(OPEN)
  escalationLevel Int           @default(0)
  escalatedAt     DateTime?
  expiresAt       DateTime
  createdAt       DateTime      @default(now())

  responses DonorResponse[]
}

model DonorResponse {
  id                 String         @id @default(uuid())
  requestId          String
  request            BloodRequest   @relation(fields: [requestId], references: [id], onDelete: Cascade)
  donorId            String
  donor              User           @relation(fields: [donorId], references: [id], onDelete: Cascade)
  status             ResponseStatus @default(NOTIFIED)
  notifiedAt         DateTime       @default(now())
  respondedAt        DateTime?
  donatedConfirmedAt DateTime?

  @@unique([requestId, donorId])
}

model Caregiver {
  id       String @id @default(uuid())
  userId   String
  user     User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  name     String
  phone    String
  priority Int    @default(1)

  @@unique([userId, phone])
}

model Favourite {
  id          String @id @default(uuid())
  userId      String
  user        User   @relation("FavouriteBy",   fields: [userId],      references: [id], onDelete: Cascade)
  favouriteId String
  favourite   User   @relation("FavouritedBy",  fields: [favouriteId], references: [id], onDelete: Cascade)
  createdAt   DateTime @default(now())

  @@unique([userId, favouriteId])
}
```

> Geospatial queries use raw SQL with PostGIS `ST_DWithin`. Prisma does not natively support PostGIS, so use `prisma.$queryRaw` for radius searches.

---

## Key API endpoints

### Auth (no auth header required for signup/login/forgot/reset)

```
POST /api/auth/signup            body: { email, password, name, bloodGroup } → { token, user }
POST /api/auth/login             body: { email, password }                   → { token, user }
POST /api/auth/forgot-password   body: { email }                             → always 200
POST /api/auth/reset-password    body: { token, newPassword }                → message
```

### Auth (JWT required)

```
POST /api/auth/send-email-otp    body: { purpose: 'verify' | 'change_email' | 'change_password' }
POST /api/auth/verify-email-otp  body: { purpose, code, newEmail?, newPassword? }
```

### Donor

```
PUT  /api/donors/profile         body: { name, bloodGroup, latitude, longitude, district }
PUT  /api/donors/phone           body: { phone | null }   — optional profile phone
PUT  /api/donors/fcm-token       body: { fcmToken }
PUT  /api/donors/availability    body: { isAvailable }
POST /api/donors/log-donation    body: { donatedAt? } → sets isAvailable=false, eligibleAgainAt
GET  /api/donors/eligibility     → { isAvailable, eligibleAgainAt, daysRemaining }
GET  /api/donors/my-responses    → requests this donor has accepted/donated
GET  /api/donors/favourites      → list of users this user has favourited
POST /api/donors/favourites/:userId    → idempotent add
DELETE /api/donors/favourites/:userId  → remove
```

### Verification (NID)

```
GET  /api/verify/upload-url      → S3 presigned URL for NID photo upload
POST /api/verify/submit          body: { s3Key } → sets verifiedStatus=PENDING
GET  /api/verify/status          → { verifiedStatus }
```

### Blood requests

```
POST /api/requests               body: { bloodGroup, hospitalName, latitude, longitude, unitsNeeded }
GET  /api/requests/browse        → all OPEN requests across BD (donor-side browse)
GET  /api/requests/active        → requester sees their open requests
GET  /api/requests/:id           → full request with responses
POST /api/requests/:id/accept    → donor accepts (enforces blood-group match)
POST /api/requests/:id/confirm   body: { donorId } → confirms donation, locks donor 120 days
```

### Chat (1-hour temporary, Redis-backed)

```
POST /api/chat/:requestId        body: { text }
GET  /api/chat/:requestId?since=N
```

### Admin (x-admin-secret header)

```
GET  /api/admin/stats
GET  /api/admin/users
GET  /api/admin/requests
GET  /api/verify/admin/pending
PUT  /api/verify/admin/:userId   body: { status }
```

### Cron (x-cron-secret header — called by Cloudflare Worker)

```
POST /api/cron/escalate          every minute
POST /api/cron/expiry            every 15 minutes
POST /api/cron/eligibility       daily 00:00 UTC
```

---

## Feature 1: Verified donors

### Signup & email verification

1. User signs up with email + password → server bcrypt-hashes password, creates user with `emailVerified = false` → returns JWT.
2. From the profile screen, user taps "Verify email" → `POST /api/auth/send-email-otp { purpose: 'verify' }`.
3. Backend generates a 6-digit code, stores in Redis `email_otp:<userId>:verify` (10-min TTL), and emails it via Nodemailer + Gmail SMTP.
4. User enters code → `POST /api/auth/verify-email-otp { purpose: 'verify', code }` → flips `emailVerified = true`.

### NID verification

1. User hits `GET /api/verify/upload-url` → backend generates an S3 presigned PUT URL.
2. Mobile uploads NID photo directly to S3.
3. User hits `POST /api/verify/submit { s3Key }` → sets `verifiedStatus = PENDING`.
4. Admin reviews from dashboard → sets `verifiedStatus = VERIFIED`.

### Donor search filter

Donors appear in PostGIS radius search results only if **both** flags are true:
```sql
WHERE "isAvailable" = true
  AND "emailVerified" = true
  AND "verifiedStatus" = 'VERIFIED'::"VerifiedStatus"
```

### Phone sharing in chat

There is no masked-calling service. When users want to exchange phone numbers, one of them taps **"Share Number?"** in the 1-hour chat — a confirmation modal appears, and on confirm a normal chat message containing the number is posted. The recipient sees it as a regular message.

---

## Feature 2: 120-day auto-eligibility tracker

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

The Cloudflare Worker calls `POST /api/cron/eligibility` daily at 00:00 UTC (= 06:00 BST) which finds all donors whose `eligibleAgainAt <= now`, resets them to available, and sends Expo push notifications.

---

## Feature 3: Caregiver escalation

Escalation is driven by a **Cloudflare Worker** calling `POST /api/cron/escalate` every minute.

- **Level 1** (T+15m): finds OPEN requests with `escalationLevel=0` and `createdAt <= now-15min` → expands radius to 15km, notifies new donors.
- **Level 2** (T+30m): finds OPEN requests with `escalationLevel=1` and `createdAt <= now-30min` → SMS all registered caregivers (via SSL Wireless).

**Optimistic locking** prevents double-processing:

```js
const claimed = await prisma.bloodRequest.updateMany({
  where: { id: request.id, escalationLevel: 0, status: 'OPEN' },
  data:  { escalationLevel: 1, escalatedAt: now },
});
if (claimed.count === 0) continue;
```

When a donor accepts, status becomes `MATCHED` and the cron's `status: 'OPEN'` filter excludes it — no explicit cancellation needed.

---

## PostGIS radius query

```js
// geoService.js
async function findNearbyDonors({ lat, lng, bloodGroup, radiusKm }) {
  const radiusMeters = radiusKm * 1000;
  return prisma.$queryRaw`
    SELECT id, name, "fcmToken", latitude, longitude,
           ST_Distance(
             ST_MakePoint(longitude, latitude)::geography,
             ST_MakePoint(${lng}, ${lat})::geography
           ) AS distance_meters
    FROM "User"
    WHERE "isAvailable"   = true
      AND "emailVerified" = true
      AND "verifiedStatus" = 'VERIFIED'::"VerifiedStatus"
      AND "bloodGroup"    = ${bloodGroup}::"BloodGroup"
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

> Enable PostGIS with: `CREATE EXTENSION IF NOT EXISTS postgis;`

---

## Environment variables (.env.example)

```env
# Database
DATABASE_URL=postgresql://user:password@postgres:5432/blooddonor

# Redis (OTPs, reset tokens, 1-hour chat)
REDIS_URL=redis://redis:6379

# JWT
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=30d

# Admin dashboard
ADMIN_SECRET=your_admin_secret_here

# Cron (Cloudflare Worker shared secret)
CRON_SECRET=your_cron_secret_here

# Caregiver SMS (SSL Wireless, Bangladesh) — used only for level-2 escalation
USE_MOCK_SMS=true
SSL_WIRELESS_API_KEY=your_api_key
SSL_WIRELESS_SID=your_sid
SSL_WIRELESS_SENDER=BloodBridge

# Email (Gmail SMTP via Nodemailer)
USE_MOCK_EMAIL=true
GMAIL_USER=
GMAIL_APP_PASSWORD=
FRONTEND_RESET_URL=https://blood-bridge-admin.vercel.app/reset

# File storage (MinIO in dev, Backblaze B2 in prod)
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_REGION=us-east-1
AWS_S3_BUCKET=blood-bridge-nid-photos
AWS_ENDPOINT=http://minio:9000
```

---

## Coding conventions

- Use `async/await` everywhere, no raw `.then()` chains
- Wrap all route handlers in `try/catch` and use the central error handler middleware
- Use Prisma transactions (`prisma.$transaction`) when multiple DB writes must be atomic
- Never log raw email addresses, JWT tokens, or password hashes
- All phone numbers stored in E.164 format: `+8801XXXXXXXXX` (optional field)
- Blood group enum values: `A_POS`, `A_NEG`, `B_POS`, `B_NEG`, `O_POS`, `O_NEG`, `AB_POS`, `AB_NEG`
- Distance always in meters internally; convert to km only for display

---

## Build order (recommended)

1. Docker setup — postgres + redis running locally
2. Prisma schema + migration + PostGIS extension
3. Auth routes — signup, login, email OTPs, forgot/reset password
4. Donor profile — name, blood group, location, phone, favourites
5. Blood request — create, browse, accept (with blood-group guard), confirm
6. NID verification — S3 presigned upload, admin review
7. Chat — 1-hour Redis list with "Share Number?" button
8. Cron routes — eligibility reset, request expiry, escalation
9. Cloudflare Worker — cron scheduler
10. Mobile app — screens wired to backend APIs

---

## What NOT to build (scope boundaries)

- No payment processing
- No blood bank inventory (only volunteer donors)
- No persistent chat — the 1-hour Redis chat is intentional (expires automatically, nothing stored in the DB)
- No masked calling / Twilio Proxy — phone is shared voluntarily inside chat
- No social features (likes, shares, leaderboards) in v1
