# Blood Bridge

> A mobile-first blood donor platform for Bangladesh — built to solve real problems that existing apps (Rokto, Bloodline) do not.

---

## Table of Contents

1. [What This App Does](#what-this-app-does)
2. [Three Core Features](#three-core-features)
3. [Tech Stack](#tech-stack)
4. [Project Structure](#project-structure)
5. [Prerequisites](#prerequisites)
6. [Backend Setup](#backend-setup)
7. [Mobile App Setup](#mobile-app-setup)
8. [Running Everything Together](#running-everything-together)
9. [API Reference](#api-reference)
10. [How to Test](#how-to-test)
11. [Environment Variables](#environment-variables)
12. [Getting Real Credentials](#getting-real-credentials)
13. [Build Order Reference](#build-order-reference)
14. [Common Issues](#common-issues)

---

## What This App Does

Blood Bridge connects people who urgently need blood with nearby verified donors. Unlike existing apps:

- Donors are **verified** via NID (National ID) photo — no fake accounts
- Phone numbers are **never exposed** — calls go through Twilio Proxy masked numbers
- Donors are **automatically locked for 120 days** after donating (WHO guideline)
- If no donor responds in 15–30 minutes, the system **escalates automatically** — expanding the search radius and SMSing emergency caregivers

---

## Three Core Features

### 1. Verified Donor + Masked Contact
- OTP via SMS (SSL Wireless) for phone auth
- NID photo uploaded directly to AWS S3 via presigned URL
- Admin approves via a protected API call
- When donor accepts a request, Twilio Proxy creates two temporary phone numbers — neither party ever sees the other's real number

### 2. 120-Day Auto-Eligibility Tracker
- When a donation is confirmed, donor is auto-locked (`isAvailable = false`)
- A daily cron job at 6:00 AM BST checks who is eligible again and:
  - Flips `isAvailable = true`
  - Sends a Firebase push notification: "You can donate again!"

### 3. Caregiver Escalation System
- **T + 0 min**: Request created → 5km radius → notify nearby donors via FCM push
- **T + 15 min**: No donor accepted → expand to 15km → notify more donors
- **T + 30 min**: Still no donor → SMS all registered caregivers of the requester
- Jobs are cancelled immediately if a donor accepts

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | React Native 0.79 (Expo SDK 54 managed), Zustand, Axios |
| Backend | Node.js + Express |
| Database | PostgreSQL 15 + PostGIS (geospatial radius queries) |
| Cache / Queue | Redis 7 + Bull (delayed job queues, AOF-persisted) |
| Auth | OTP via SSL Wireless (Bangladesh) + JWT |
| Push notifications | Firebase Cloud Messaging (FCM) via firebase-admin |
| Masked calls | Twilio Proxy API |
| File storage | AWS S3 (presigned URLs — direct upload from mobile) |
| ORM | Prisma |
| Infrastructure | Docker + docker-compose |
| CI/CD | GitHub Actions |

---

## Project Structure

```
Blood-Bridge/
│
├── .github/
│   ├── workflows/
│   │   └── ci.yml            # CI: backend tests, mobile audit, Docker build
│   └── dependabot.yml        # Weekly automated dependency update PRs
│
├── LICENSE                   # Proprietary — all rights reserved
│
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.js          # OTP send/verify, JWT issue
│   │   │   ├── donors.js        # Profile, availability, eligibility (Joi validated)
│   │   │   ├── requests.js      # Create request, accept, confirm donation (Joi validated)
│   │   │   ├── verify.js        # NID upload (S3), admin approval
│   │   │   └── call.js          # Twilio Proxy session create/end
│   │   ├── workers/
│   │   │   ├── escalationWorker.js  # Bull: 15/30 min escalation jobs
│   │   │   └── eligibilityWorker.js # node-cron: daily 120-day reset
│   │   ├── services/
│   │   │   ├── smsService.js    # SSL Wireless wrapper (mock in dev)
│   │   │   ├── fcmService.js    # Firebase push notification wrapper
│   │   │   ├── twilioService.js # Proxy session management
│   │   │   ├── s3Service.js     # Presigned URL generation
│   │   │   └── geoService.js    # PostGIS ST_DWithin raw SQL (coordinate-validated)
│   │   ├── middleware/
│   │   │   ├── auth.js          # JWT verify → req.user
│   │   │   ├── adminAuth.js     # x-admin-secret header check
│   │   │   └── errorHandler.js  # Central error handler (last middleware)
│   │   ├── config/
│   │   │   ├── prisma.js        # Single shared PrismaClient instance
│   │   │   └── redis.js         # Single shared ioredis instance
│   │   ├── app.js               # Express setup: helmet, CORS, rate limiting, routes
│   │   └── server.js            # Startup validation, HTTP server, graceful shutdown
│   ├── prisma/
│   │   └── schema.prisma        # DB schema: User, BloodRequest, DonorResponse, Caregiver
│   ├── docker-compose.yml       # postgres + redis (AOF) + backend; auto-migrates on start
│   ├── Dockerfile               # Multi-stage build (builder → runtime)
│   ├── init.sql                 # Enables PostGIS extension on first DB start
│   ├── .env.example
│   └── package.json
│
└── mobile/
    ├── App.js                   # Root navigator (auth gate → tabs)
    ├── app.json                 # Expo config
    └── src/
        ├── config.js            # API URL + brand colors
        ├── hooks/
        │   └── usePushNotifications.js  # FCM token registration
        ├── store/
        │   ├── authStore.js     # Zustand: token + user (persisted)
        │   └── requestStore.js  # Zustand: blood requests
        ├── services/
        │   └── api.js           # Axios instance with JWT interceptor
        ├── screens/
        │   ├── AuthScreen.js         # Phone → OTP → JWT
        │   ├── HomeScreen.js         # Dashboard + eligibility + availability
        │   ├── DonorProfileScreen.js # Name / blood group / GPS
        │   ├── RequestBloodScreen.js # Post a blood request
        │   ├── ActiveRequestScreen.js # Track request + confirm + call
        │   └── VerificationScreen.js  # NID upload flow
        ├── components/
        │   └── BloodGroupPicker.js   # Reusable blood group button grid
        └── utils/
            └── formatters.js         # Display helpers (A+, dates, etc.)
```

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 20 LTS or 24 | https://nodejs.org |
| npm | 9+ | comes with Node.js |
| Docker Desktop | latest | https://docs.docker.com/get-docker/ |
| Expo Go (phone) | latest | Play Store / App Store |
| Android Studio (optional) | latest | for Android emulator |

> **No Expo CLI install needed** — run Expo directly from `node_modules`:
> ```bash
> ./node_modules/expo/bin/cli start
> ```

> **Docker permission (Linux only):**
> ```bash
> sudo usermod -aG docker $USER && newgrp docker
> ```

---

## Backend Setup

### Step 1 — Enter the backend folder

```bash
cd backend
```

### Step 2 — Create your `.env` file

```bash
cp .env.example .env
```

For local development the defaults work immediately:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/blooddonor
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev_secret_change_in_production
ADMIN_SECRET=dev_admin_secret_change_in_production
USE_MOCK_SMS=true
NODE_ENV=development
```

> `USE_MOCK_SMS=true` — OTP is printed to the server terminal instead of sending a real SMS.

### Step 3 — Start PostgreSQL and Redis via Docker

```bash
docker compose up -d postgres redis
```

> Uses `postgis/postgis:15-3.3` (includes PostGIS) and `redis:7-alpine` with AOF persistence.
> `init.sql` automatically enables the PostGIS extension on first start.

### Step 4 — Install dependencies

```bash
npm install
```

### Step 5 — Run Prisma migration (creates all tables)

```bash
npx prisma migrate dev --name init
```

> Creates 4 tables: `User`, `BloodRequest`, `DonorResponse`, `Caregiver`.
>
> **Optional — visual database browser:**
> ```bash
> npx prisma studio
> # Opens at http://localhost:5555
> ```

### Step 6 — Start the backend server

```bash
npm run dev
```

You should see:
```
[Redis] Connected
[DB] PostgreSQL connected
[EligibilityWorker] Scheduled — runs daily at 06:00 AM BST
[EscalationWorker] Ready — listening for escalation jobs
[Server] Listening on port 3000 (development)
```

> **Health checks:**
> - `GET http://localhost:3000/health` → `{ "status": "ok" }` (liveness — is the process up?)
> - `GET http://localhost:3000/health/ready` → `{ "status": "ready" }` (readiness — DB + Redis reachable?)

---

## Mobile App Setup

### Step 1 — Install dependencies

```bash
cd mobile
npm install
```

### Step 2 — Configure the API URL

Open [mobile/src/config.js](mobile/src/config.js) and set the right URL:

```js
// Physical Android/iOS device on the same WiFi as your computer
// Find your PC's IP: ifconfig (Linux/Mac) or ipconfig (Windows)
export const API_BASE_URL = 'http://192.168.0.110:3000/api'; // ← replace with your IP

// Android emulator
// export const API_BASE_URL = 'http://10.0.2.2:3000/api';
```

### Step 3 — Start Expo

```bash
./node_modules/expo/bin/cli start --clear
```

| Target | How | Requirement |
|---|---|---|
| Physical device | Scan QR code with Expo Go | Same WiFi as PC |
| Android emulator | Press `a` | Android Studio + AVD |
| iOS simulator | Press `i` | macOS + Xcode |

---

## Running Everything Together

```bash
# Terminal 1 — backend
cd backend
docker compose up -d postgres redis     # start DB + Redis
npm run dev                             # start Express server

# Terminal 2 — mobile
cd mobile
./node_modules/expo/bin/cli start --clear
```

---

## API Reference

All endpoints are prefixed with `/api`. Protected routes require:
```
Authorization: Bearer <JWT_TOKEN>
```

**Rate limits:**
- All API endpoints: 100 requests per 15 minutes per IP
- OTP endpoints (`/auth/send-otp`, `/auth/verify-otp`): 5 requests per minute per IP
- OTP verification: 3 failed attempts per phone → 15-minute lock

---

### Auth

| Method | Endpoint | Body | Description |
|---|---|---|---|
| POST | `/auth/send-otp` | `{ phone }` | Send OTP. Phone format: `+8801XXXXXXXXX` |
| POST | `/auth/verify-otp` | `{ phone, otp }` | Verify OTP → returns `{ token, user }` |

---

### Donors

| Method | Endpoint | Body | Auth | Description |
|---|---|---|---|---|
| PUT | `/donors/profile` | `{ name?, bloodGroup?, latitude?, longitude?, district? }` | ✅ | Update profile (at least one field required) |
| PUT | `/donors/fcm-token` | `{ fcmToken }` | ✅ | Save Firebase push token |
| PUT | `/donors/availability` | `{ isAvailable }` | ✅ | Toggle availability (guarded by 120-day rule) |
| POST | `/donors/log-donation` | `{ donatedAt? }` | ✅ | Manually log a donation → lock for 120 days |
| GET | `/donors/eligibility` | — | ✅ | Eligibility status + days remaining |

**Blood group values:** `A_POS` `A_NEG` `B_POS` `B_NEG` `O_POS` `O_NEG` `AB_POS` `AB_NEG`

**Coordinate validation:** `latitude` must be −90 to 90, `longitude` must be −180 to 180.

---

### Blood Requests

| Method | Endpoint | Body | Auth | Description |
|---|---|---|---|---|
| POST | `/requests` | `{ bloodGroup, hospitalName, latitude, longitude, unitsNeeded? }` | ✅ | Create request → notifies nearby donors |
| GET | `/requests/active` | — | ✅ | Requester's open requests |
| GET | `/requests/:id` | — | ✅ | Full request with donor responses |
| POST | `/requests/:id/accept` | — | ✅ | Donor accepts request |
| POST | `/requests/:id/confirm` | `{ donorId }` | ✅ | Requester confirms donation happened |

`unitsNeeded` must be 1–10. `donorId` must be a valid UUID.

---

### NID Verification

| Method | Endpoint | Body / Header | Auth | Description |
|---|---|---|---|---|
| GET | `/verify/upload-url` | — | ✅ | Get S3 presigned PUT URL (valid 10 min) |
| POST | `/verify/submit` | `{ s3Key }` | ✅ | Submit NID after upload → status = PENDING |
| GET | `/verify/status` | — | ✅ | Check own verification status |
| PUT | `/verify/admin/:userId` | `{ status }` + `x-admin-secret` header | Admin | Approve/reject NID |
| GET | `/verify/admin/pending` | `x-admin-secret` header | Admin | List PENDING submissions |

---

### Masked Calling

| Method | Endpoint | Body | Auth | Description |
|---|---|---|---|---|
| POST | `/call/initiate` | `{ requestId }` | ✅ | Create Twilio Proxy session → returns proxy numbers |
| DELETE | `/call/:sessionId` | — | ✅ | End proxy session |

---

## How to Test

### Option A — Postman (recommended)

1. Set Collection Variable: `baseUrl = http://localhost:3000/api`
2. Follow the full test flow below

---

#### Full test flow

**Step 1 — Send OTP**
```
POST {{baseUrl}}/auth/send-otp
Body: { "phone": "+8801712345678" }
```
> OTP appears in your backend terminal (mock mode):
> ```
> [SMS MOCK] To: +8801712345678 | OTP: 482910
> ```

**Step 2 — Verify OTP → get JWT**
```
POST {{baseUrl}}/auth/verify-otp
Body: { "phone": "+8801712345678", "otp": "482910" }
```
> Copy the token → save as Collection Variable `token`

**Step 3 — Set up donor profile**
```
PUT {{baseUrl}}/donors/profile
Authorization: Bearer {{token}}
Body: {
  "name": "Rafiq Ahmed",
  "bloodGroup": "B_POS",
  "latitude": 23.8103,
  "longitude": 90.4125,
  "district": "Dhaka"
}
```

**Step 4 — Create a second user (the requester)**
> Repeat Steps 1–3 with a different phone (e.g. `+8801812345678`). Save as `requesterToken`.

**Step 5 — Create a blood request**
```
POST {{baseUrl}}/requests
Authorization: Bearer {{requesterToken}}
Body: {
  "bloodGroup": "B_POS",
  "hospitalName": "Dhaka Medical College Hospital",
  "latitude": 23.7230,
  "longitude": 90.3890,
  "unitsNeeded": 2
}
```

**Step 6 — Donor accepts**
```
POST {{baseUrl}}/requests/<requestId>/accept
Authorization: Bearer {{token}}
```

**Step 7 — Initiate masked call**
```
POST {{baseUrl}}/call/initiate
Authorization: Bearer {{token}}
Body: { "requestId": "<requestId>" }
```
> Returns two proxy phone numbers. Neither party's real number is shared.

**Step 8 — Requester confirms donation**
```
POST {{baseUrl}}/requests/<requestId>/confirm
Authorization: Bearer {{requesterToken}}
Body: { "donorId": "<donorUserId>" }
```
> Donor is now locked for 120 days. Verify:
> ```
> GET {{baseUrl}}/donors/eligibility
> Authorization: Bearer {{token}}
> ```

**Step 9 — Admin: approve NID**
```
PUT {{baseUrl}}/verify/admin/<userId>
Headers: x-admin-secret: <value from ADMIN_SECRET in .env>
Body: { "status": "VERIFIED" }
```

---

### Option B — curl

```bash
# Send OTP
curl -X POST http://localhost:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+8801712345678"}'

# Verify OTP (use OTP from server console)
curl -X POST http://localhost:3000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+8801712345678", "otp": "XXXXXX"}'

# Health check (liveness)
curl http://localhost:3000/health

# Readiness check (verifies DB + Redis are reachable)
curl http://localhost:3000/health/ready
```

---

### Option C — Prisma Studio

```bash
cd backend
npx prisma studio
```
Opens a visual table browser at **http://localhost:5555**.

---

## Environment Variables

| Variable | Required | Default (dev) | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | `postgresql://user:password@localhost:5432/blooddonor` | PostgreSQL connection string |
| `REDIS_URL` | ✅ | `redis://localhost:6379` | Redis connection URL |
| `JWT_SECRET` | ✅ | *(set a random string)* | Signs JWT tokens — keep secret. Generate: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `JWT_EXPIRES_IN` | — | `30d` | JWT expiry duration |
| `ADMIN_SECRET` | ✅ | *(set any string, 32+ chars in prod)* | Shared secret for admin endpoints (`x-admin-secret` header) |
| `ALLOWED_ORIGINS` | Prod | *(not set = allow all)* | Comma-separated list of allowed CORS origins, e.g. `https://yourapp.com` |
| `USE_MOCK_SMS` | — | `true` | `true` = print OTP to console; `false` = real SSL Wireless SMS |
| `SSL_WIRELESS_API_KEY` | Prod | — | SSL Wireless API key |
| `SSL_WIRELESS_SID` | Prod | — | SSL Wireless sender ID |
| `FIREBASE_PROJECT_ID` | Prod | — | Firebase project ID |
| `FIREBASE_PRIVATE_KEY` | Prod | — | Firebase service account private key |
| `FIREBASE_CLIENT_EMAIL` | Prod | — | Firebase service account email |
| `TWILIO_ACCOUNT_SID` | Prod | — | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Prod | — | Twilio auth token |
| `TWILIO_PROXY_SERVICE_SID` | Prod | — | Twilio Proxy service SID |
| `AWS_ACCESS_KEY_ID` | Prod | — | AWS IAM access key |
| `AWS_SECRET_ACCESS_KEY` | Prod | — | AWS IAM secret key |
| `AWS_REGION` | Prod | `ap-southeast-1` | S3 bucket region |
| `AWS_S3_BUCKET` | Prod | — | S3 bucket name for NID photos |
| `PORT` | — | `3000` | Server port |
| `NODE_ENV` | — | `development` | `development` or `production` |

> **Production startup validation:** The server refuses to start if `DATABASE_URL`, `REDIS_URL`, or `JWT_SECRET` are missing. In `NODE_ENV=production`, it also rejects placeholder values and enforces `ADMIN_SECRET` ≥ 32 characters.

---

## Getting Real Credentials

### SSL Wireless (OTP SMS — Bangladesh)
1. Register at [sslwireless.com](https://sslwireless.com)
2. Get `API_KEY` and `SID` from the dashboard
3. Set `USE_MOCK_SMS=false` in `.env`

### Firebase (Push Notifications)
1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create a project → **Project Settings → Service Accounts**
3. Click **Generate new private key** → download JSON
4. Copy `project_id`, `private_key`, `client_email` to `.env`
5. Add your app's `google-services.json` (Android) to `mobile/`

### Twilio Proxy (Masked Calls)
1. Sign up at [twilio.com](https://twilio.com)
2. Go to **Proxy → Services → Create a Service**
3. Add phone numbers to the proxy pool
4. Copy Account SID, Auth Token, Proxy Service SID to `.env`

### AWS S3 (NID Photo Storage)
1. Go to [AWS Console → IAM](https://console.aws.amazon.com/iam)
2. Create a user → attach **AmazonS3FullAccess** policy (or scope it to your bucket)
3. Generate access keys → copy to `.env`
4. Create an S3 bucket in `ap-southeast-1`

---

## Build Order Reference

| Step | What was built | Key files |
|---|---|---|
| 1 | Docker + infrastructure | `docker-compose.yml`, `Dockerfile`, `init.sql` |
| 2 | Prisma schema + migration | `prisma/schema.prisma` |
| 3 | Auth routes (OTP + JWT) | `routes/auth.js`, `services/smsService.js` |
| 4 | Donor profile routes | `routes/donors.js` |
| 5 | Blood requests + PostGIS + FCM | `routes/requests.js`, `services/geoService.js`, `services/fcmService.js` |
| 6 | Eligibility cron (120-day reset) | `workers/eligibilityWorker.js` |
| 7 | Bull escalation queue | `workers/escalationWorker.js` |
| 8 | NID verification + S3 + admin | `routes/verify.js`, `services/s3Service.js` |
| 9 | Twilio Proxy masked calling | `routes/call.js`, `services/twilioService.js` |
| 10 | React Native mobile app | `mobile/` |
| 11 | Production hardening | `app.js` (CORS, rate limiting), `auth.js` (OTP lock), `server.js` (startup validation, graceful shutdown), `Dockerfile` (multi-stage), `docker-compose.yml` (Redis AOF), `.github/workflows/ci.yml`, `.github/dependabot.yml` |

---

## Common Issues

**`prisma migrate dev` fails with "connection refused"**
→ Docker isn't running or postgres isn't healthy yet.
```bash
docker compose ps
docker compose logs postgres
```

**Backend crashes with `FirebaseAppError: Invalid PEM`**
→ Firebase credentials are still placeholders. The app runs in FCM mock mode automatically.

**OTP not appearing**
→ Make sure `USE_MOCK_SMS=true` is in `.env` and watch the **backend terminal**.

**`npx expo start` gives `expo: not found`**
→ Run directly from node_modules:
```bash
./node_modules/expo/bin/cli start --clear
```

**Expo Go shows "Project is incompatible with this version"**
→ This project uses **SDK 54**. Update Expo Go on your phone.

**Metro bundler crashes with `ENOENT`**
```bash
./node_modules/expo/bin/cli start --clear
```

**Mobile app can't reach backend**
→ Check `API_BASE_URL` in `mobile/src/config.js`. Use your PC's LAN IP, not `localhost`, for a physical device.

**PostGIS queries return `donorsNotified: 0`**
→ Two possible causes:
1. Donor's `verifiedStatus` is not `VERIFIED` — approve them via the admin endpoint
2. Donor is outside the 5km initial radius — use a hospital closer to the donor's saved location

**`relation "User" does not exist`**
→ Run migrations:
```bash
cd backend && npx prisma migrate dev --name init
```

**Server refuses to start with "placeholder values" error**
→ In `NODE_ENV=production`, `JWT_SECRET` and `ADMIN_SECRET` must not contain words like `change_this` or `your_`. Generate real secrets and update `.env`.

**Rate limit hit during testing (429 response)**
→ In development this is unlikely (100 req/15 min). If you hit the OTP limiter (5/min), wait 1 minute. The OTP phone-level lock (3 failures) resets when you call `send-otp` again.
