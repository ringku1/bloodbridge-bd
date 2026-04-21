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
- **Firebase Cloud Messaging (FCM)** for push notifications
- **Axios** for HTTP requests

### Backend
- **Node.js + Express**
- **JWT** for auth tokens
- **OTP via SMS** — SSL Wireless (Bangladesh SMS gateway)
- **Bull** (Redis-backed job queue) for escalation scheduling
- **node-cron** for the daily eligibility reset job
- **Twilio Proxy API** for masked phone calls
- **AWS S3** for NID photo storage (presigned URLs)
- **Multer** for file upload middleware

### Database
- **PostgreSQL** with **PostGIS** extension for geospatial radius queries
- **Redis** for Bull queues and caching
- **Prisma ORM** for schema and queries

### Infrastructure
- **Docker + docker-compose** (postgres, redis, backend as services)
- **GitHub Actions** for CI/CD
- **Railway or AWS EC2** for hosting

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
│   │   │   └── call.js          # Twilio Proxy session create/end
│   │   ├── workers/
│   │   │   ├── escalationWorker.js   # Bull worker: expand radius, SMS caregiver
│   │   │   └── eligibilityWorker.js  # Daily cron: flip is_available = true
│   │   ├── services/
│   │   │   ├── smsService.js    # SSL Wireless wrapper
│   │   │   ├── fcmService.js    # Firebase push notification wrapper
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
const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function createProxySession(donorPhone, requesterPhone) {
  const service = await client.proxy.v1.services(process.env.TWILIO_PROXY_SERVICE_SID);
  const session = await service.sessions.create({ uniqueName: `session_${Date.now()}`, ttl: 7200 });
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
  }
});
```

### Daily cron job (eligibilityWorker.js)
Runs at 6:00 AM every day. Finds all donors whose `eligibleAgainAt <= now` and flips `isAvailable = true`, then sends FCM push.

```js
const cron = require('node-cron');

cron.schedule('0 6 * * *', async () => {
  const donors = await prisma.user.findMany({
    where: {
      isAvailable: false,
      eligibleAgainAt: { lte: new Date() },
    },
  });

  await prisma.user.updateMany({
    where: { id: { in: donors.map(d => d.id) } },
    data: { isAvailable: true },
  });

  for (const donor of donors) {
    if (donor.fcmToken) {
      await fcmService.send(donor.fcmToken, {
        title: 'You can donate again!',
        body: 'Your 120-day wait is over. You are now eligible to donate blood.',
      });
    }
  }
});
```

---

## Feature 3: Caregiver escalation system

### Bull queue setup
When a blood request is created, two delayed jobs are scheduled:

```js
const Queue = require('bull');
const escalationQueue = new Queue('escalation', { redis: { host: 'redis', port: 6379 } });

// After creating blood request:
await escalationQueue.add({ requestId, level: 1 }, { delay: 15 * 60 * 1000 }); // 15 min
await escalationQueue.add({ requestId, level: 2 }, { delay: 30 * 60 * 1000 }); // 30 min
```

### Worker logic (escalationWorker.js)

```js
escalationQueue.process(async (job) => {
  const { requestId, level } = job.data;

  const request = await prisma.bloodRequest.findUnique({
    where: { id: requestId },
    include: { requester: { include: { caregivers: true } } }
  });

  // Skip if already matched or fulfilled
  if (request.status !== 'OPEN') return;

  if (level === 1) {
    // Expand radius: find donors within 15km instead of 5km
    const donors = await geoService.findNearbyDonors({
      lat: request.latitude,
      lng: request.longitude,
      bloodGroup: request.bloodGroup,
      radiusKm: 15,
    });
    await fcmService.sendToMany(donors.map(d => d.fcmToken), { ... });
    await prisma.bloodRequest.update({
      where: { id: requestId },
      data: { escalationLevel: 1, escalatedAt: new Date() }
    });
  }

  if (level === 2) {
    // SMS caregivers
    const caregivers = request.requester.caregivers;
    for (const cg of caregivers) {
      await smsService.send(cg.phone, `Urgent: ${request.requester.name} needs ${request.bloodGroup} blood at ${request.hospitalName}. No donor found yet. Please help.`);
    }
    await prisma.bloodRequest.update({
      where: { id: requestId },
      data: { escalationLevel: 2, escalatedAt: new Date() }
    });
  }
});
```

### Cancelling jobs when donor accepts
Store job IDs when scheduling so they can be removed:

```js
const job1 = await escalationQueue.add({ requestId, level: 1 }, { delay: 900000 });
const job2 = await escalationQueue.add({ requestId, level: 2 }, { delay: 1800000 });

// Store job IDs in Redis keyed by requestId
await redis.set(`escalation_jobs:${requestId}`, JSON.stringify([job1.id, job2.id]));

// When donor accepts:
const jobIds = JSON.parse(await redis.get(`escalation_jobs:${requestId}`));
for (const id of jobIds) {
  const job = await escalationQueue.getJob(id);
  if (job) await job.remove();
}
```

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
DATABASE_URL=postgresql://user:password@localhost:5432/blooddonor

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=30d

# OTP (SSL Wireless - Bangladesh)
SSL_WIRELESS_API_KEY=your_api_key
SSL_WIRELESS_SID=your_sid

# Firebase
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY=your_private_key
FIREBASE_CLIENT_EMAIL=your_client_email

# Twilio Proxy
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PROXY_SERVICE_SID=your_proxy_service_sid

# AWS S3
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=ap-southeast-1
AWS_S3_BUCKET=blood-donor-nid-photos
```

---

## docker-compose.yml

```yaml
version: '3.8'
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
5. Blood request — create, PostGIS radius search, FCM push
6. Eligibility cron — daily reset job
7. Bull queue — escalation jobs, worker logic
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
