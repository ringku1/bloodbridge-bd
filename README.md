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
- Both the donor and the requester can initiate the call from their respective screens

### 2. 120-Day Auto-Eligibility Tracker
- When a donation is confirmed, donor is auto-locked (`isAvailable = false`)
- A daily cron job at 6:00 AM BST checks who is eligible again and:
  - Flips `isAvailable = true`
  - Sends a Firebase push notification: "You can donate again!"
- Blood requests auto-expire after 6 hours — a 15-minute cron marks stale OPEN requests as EXPIRED

### 3. Caregiver Escalation System
- **T + 0 min**: Request created → 5 km radius → notify nearby verified donors via FCM push
- **T + 15 min**: No donor accepted → expand to 15 km → notify more donors
- **T + 30 min**: Still no donor → SMS all registered caregivers of the requester
- Jobs are cancelled immediately if a donor accepts
- Caregivers are managed in the app (up to 5 per user, ordered by priority)

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
| File storage | AWS S3 in production; MinIO (local S3-compatible) in dev |
| ORM | Prisma |
| Infrastructure | Docker + docker-compose |
| CI/CD | GitHub Actions + Dependabot |

---

## Project Structure

```
Blood-Bridge/
│
├── .github/
│   ├── workflows/
│   │   └── ci.yml                # CI: lint, Docker build, backend + mobile checks
│   └── dependabot.yml            # Weekly automated dependency update PRs
│
├── LICENSE                       # Proprietary — all rights reserved
│
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.js           # OTP send/verify, JWT issue
│   │   │   ├── donors.js         # Profile, availability, eligibility, my-responses
│   │   │   ├── requests.js       # Create request, accept, confirm donation
│   │   │   ├── verify.js         # NID upload (S3 presigned), admin approval
│   │   │   ├── call.js           # Twilio Proxy session create/end
│   │   │   └── caregivers.js     # Emergency caregiver CRUD (escalation contacts)
│   │   ├── workers/
│   │   │   ├── escalationWorker.js   # Bull: 15/30 min escalation jobs
│   │   │   └── eligibilityWorker.js  # node-cron: daily 120-day reset + 15-min expiry
│   │   ├── services/
│   │   │   ├── smsService.js     # SSL Wireless wrapper (mock in dev)
│   │   │   ├── fcmService.js     # Firebase push notification wrapper (mock in dev)
│   │   │   ├── twilioService.js  # Proxy session management (mock in dev)
│   │   │   ├── s3Service.js      # Presigned URL generation + bucket auto-create
│   │   │   └── geoService.js     # PostGIS ST_DWithin raw SQL (coordinate-validated)
│   │   ├── middleware/
│   │   │   ├── auth.js           # JWT verify → req.user
│   │   │   ├── adminAuth.js      # x-admin-secret header check
│   │   │   └── errorHandler.js   # Central error handler (last middleware)
│   │   ├── config/
│   │   │   ├── prisma.js         # Single shared PrismaClient instance
│   │   │   └── redis.js          # Single shared ioredis instance
│   │   ├── app.js                # Express setup: helmet, CORS, rate limiting, routes
│   │   └── server.js             # Startup validation, HTTP server, graceful shutdown
│   ├── prisma/
│   │   ├── schema.prisma         # DB schema: User, BloodRequest, DonorResponse, Caregiver
│   │   └── migrations/           # Auto-generated migration files
│   ├── docker-compose.yml        # postgres + redis (AOF) + minio + backend
│   ├── Dockerfile                # Multi-stage build (builder → slim runtime)
│   ├── init.sql                  # Enables PostGIS extension on first DB start
│   ├── .env.example
│   └── package.json
│
└── mobile/
    ├── App.js                    # Root navigator (auth gate → 4-tab layout)
    ├── app.json                  # Expo config
    └── src/
        ├── config.js             # API URL + brand colors
        ├── navigation/
        │   └── RootNavigation.js # Global nav ref for push notification deep links
        ├── hooks/
        │   └── usePushNotifications.js  # FCM token registration + tap handler
        ├── store/
        │   ├── authStore.js      # Zustand: token + user (persisted to AsyncStorage)
        │   └── requestStore.js   # Zustand: blood requests + donor accept action
        ├── services/
        │   └── api.js            # Axios instance with JWT interceptor
        ├── screens/
        │   ├── AuthScreen.js          # Phone → OTP → JWT
        │   ├── HomeScreen.js          # Dashboard: eligibility + availability toggle
        │   ├── DonorProfileScreen.js  # Name / blood group / GPS / caregivers link
        │   ├── RequestBloodScreen.js  # Post a blood request
        │   ├── ActiveRequestScreen.js # Requester tracks request + confirm + call/end call
        │   ├── VerificationScreen.js  # NID photo upload flow
        │   ├── DonorRequestScreen.js  # Donor views request detail + accepts (via push tap)
        │   ├── DonorAcceptedScreen.js # Donor tracks accepted requests + call requester
        │   └── CaregiversScreen.js    # Add/remove emergency caregivers
        ├── components/
        │   └── BloodGroupPicker.js    # Reusable blood group button grid
        └── utils/
            └── formatters.js          # Display helpers (A+, dates, timeAgo, etc.)
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
DATABASE_URL=postgresql://user:password@postgres:5432/blooddonor
REDIS_URL=redis://redis:6379
JWT_SECRET=dev_secret_change_in_production
ADMIN_SECRET=dev_admin_secret_change_in_production
USE_MOCK_SMS=true
NODE_ENV=development
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_ENDPOINT=http://minio:9000
```

> `USE_MOCK_SMS=true` — OTP is printed to the server terminal instead of sending a real SMS.
> Firebase / Twilio keys can be left blank in dev — both services run in mock mode automatically.

### Step 3 — Start all services via Docker

```bash
docker compose up -d
```

This starts PostgreSQL (with PostGIS), Redis (AOF persistence), MinIO (local S3), and the backend API. The backend automatically runs migrations and creates the MinIO bucket on startup.

```
[DB] PostgreSQL connected
[S3] Bucket "blood-bridge-nid-photos" ready
[EligibilityWorker] Scheduled — runs daily at 06:00 AM BST (00:00 UTC)
[EscalationWorker] Ready — listening for escalation jobs
[Server] Listening on port 3000 (development)
```

> **Health checks:**
> - `GET http://localhost:3000/health` → `{ "status": "ok" }` (liveness — is the process up?)
> - `GET http://localhost:3000/health/ready` → `{ "status": "ready" }` (readiness — DB + Redis reachable?)

> **MinIO console:** `http://localhost:9001` — login: `minioadmin` / `minioadmin`

### Running backend outside Docker (optional)

```bash
# Start only the dependencies
docker compose up -d postgres redis minio

# In .env, change hosts from service names to localhost:
# DATABASE_URL=postgresql://user:password@localhost:5432/blooddonor
# REDIS_URL=redis://localhost:6379
# AWS_ENDPOINT=http://localhost:9000

npm install
npx prisma migrate dev --name init
npm run dev
```

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
# Terminal 1 — backend (Docker)
cd backend
docker compose up -d

# Terminal 2 — mobile
cd mobile
./node_modules/expo/bin/cli start --clear
```

---

## Mobile Navigation

```
App
├── (not logged in)  AuthScreen
└── (logged in)      Bottom Tab Navigator
      ├── 🏠 Home     HomeScreen              — eligibility card, availability toggle
      ├── 🩸 Request  RequestBloodScreen      — create a blood request
      │               ActiveRequestScreen     — track request, confirm donation, call donor
      ├── 💉 Donate   DonorAcceptedScreen     — donor's accepted requests, call requester
      └── 👤 Profile  DonorProfileScreen      — name, blood group, GPS
                      VerificationScreen      — NID photo upload
                      CaregiversScreen        — add/remove emergency SMS contacts

Push notification tap → DonorRequestScreen   — donor views request detail + Accept button
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
| GET | `/donors/my-responses` | — | ✅ | Donor's accepted and donated requests |

**Blood group values:** `A_POS` `A_NEG` `B_POS` `B_NEG` `O_POS` `O_NEG` `AB_POS` `AB_NEG`

**Coordinate validation:** `latitude` must be −90 to 90, `longitude` must be −180 to 180.

---

### Blood Requests

| Method | Endpoint | Body | Auth | Description |
|---|---|---|---|---|
| POST | `/requests` | `{ bloodGroup, hospitalName, latitude, longitude, unitsNeeded? }` | ✅ | Create request → notifies nearby donors |
| GET | `/requests/active` | — | ✅ | Requester's OPEN and MATCHED requests |
| GET | `/requests/:id` | — | ✅ | Full request with donor responses |
| POST | `/requests/:id/accept` | — | ✅ | Donor accepts request → status → MATCHED |
| POST | `/requests/:id/confirm` | `{ donorId }` | ✅ | Requester confirms donation → locks donor 120 days |

`unitsNeeded` must be 1–10. `donorId` must be a valid UUID of a donor who has status `ACCEPTED`.

Blood requests expire after 6 hours — a background job marks them `EXPIRED` every 15 minutes.

---

### NID Verification

| Method | Endpoint | Body / Header | Auth | Description |
|---|---|---|---|---|
| GET | `/verify/upload-url` | — | ✅ | Get S3 presigned PUT URL (valid 10 min) |
| POST | `/verify/submit` | `{ s3Key }` | ✅ | Submit NID after upload → status = PENDING |
| GET | `/verify/status` | — | ✅ | Check own verification status |
| PUT | `/verify/admin/:userId` | `{ status }` + `x-admin-secret` header | Admin | Approve/reject NID |
| GET | `/verify/admin/pending` | `x-admin-secret` header | Admin | List PENDING submissions with presigned photo URLs |

---

### Masked Calling

| Method | Endpoint | Body | Auth | Description |
|---|---|---|---|---|
| POST | `/call/initiate` | `{ requestId }` | ✅ | Create or retrieve proxy session → returns `{ donorProxyNumber, requesterProxyNumber }` |
| DELETE | `/call/:sessionId` | — | ✅ | End proxy session |

Both the donor and requester can call `POST /call/initiate`. The requester dials `donorProxyNumber`; the donor dials `requesterProxyNumber`. Neither sees the other's real phone number.

---

### Caregivers

| Method | Endpoint | Body | Auth | Description |
|---|---|---|---|---|
| GET | `/caregivers` | — | ✅ | List my caregivers (ordered by priority) |
| POST | `/caregivers` | `{ name, phone, priority? }` | ✅ | Add caregiver (max 5 per account) |
| DELETE | `/caregivers/:id` | — | ✅ | Remove a caregiver |

`phone` must be a valid Bangladeshi E.164 number: `+8801XXXXXXXXX`. `priority` defaults to 1 (lower = notified first).

---

## How to Test

### Option A — Postman (recommended)

1. Set Collection Variable: `baseUrl = http://localhost:3000/api`
2. Follow the full test flow below

---

#### Full test flow

**Step 1 — Send OTP (donor)**
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
> Copy the token → save as `donorToken`

**Step 3 — Set up donor profile**
```
PUT {{baseUrl}}/donors/profile
Authorization: Bearer {{donorToken}}
Body: {
  "name": "Rafiq Ahmed",
  "bloodGroup": "B_POS",
  "latitude": 23.8103,
  "longitude": 90.4125,
  "district": "Dhaka"
}
```

**Step 4 — Add a caregiver (optional — for escalation testing)**
```
POST {{baseUrl}}/caregivers
Authorization: Bearer {{donorToken}}
Body: {
  "name": "Karim Ahmed",
  "phone": "+8801811111111",
  "priority": 1
}
```

**Step 5 — Create a second user (the requester)**
> Repeat Steps 1–2 with a different phone (e.g. `+8801812345678`). Save token as `requesterToken`.

**Step 6 — Create a blood request**
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
> `donorsNotified` in the response tells you how many donors were found within 5 km.

**Step 7 — Donor accepts**
```
POST {{baseUrl}}/requests/<requestId>/accept
Authorization: Bearer {{donorToken}}
```

**Step 8 — Initiate masked call**
```
POST {{baseUrl}}/call/initiate
Authorization: Bearer {{donorToken}}
Body: { "requestId": "<requestId>" }
```
> Returns `donorProxyNumber` (requester calls this) and `requesterProxyNumber` (donor calls this).

**Step 9 — Requester confirms donation**
```
POST {{baseUrl}}/requests/<requestId>/confirm
Authorization: Bearer {{requesterToken}}
Body: { "donorId": "<donorUserId>" }
```
> Donor is now locked for 120 days. Verify:
> ```
> GET {{baseUrl}}/donors/eligibility
> Authorization: Bearer {{donorToken}}
> ```

**Step 10 — Admin: approve NID**
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

### Option D — Mobile App (end-to-end)

1. Start Docker: `cd backend && docker compose up -d`
2. Start Expo: `cd mobile && ./node_modules/expo/bin/cli start --clear`
3. Scan the QR code with Expo Go
4. Log in with any Bangladeshi number — OTP appears in Docker logs:
   ```bash
   docker compose logs -f backend | grep "OTP"
   ```
5. Set your profile (Profile tab → Edit)
6. Add emergency caregivers (Profile tab → Manage Emergency Caregivers)
7. Create a blood request (Request tab)
8. From a second device / second Expo session, log in as a donor near the same GPS location
9. Donor receives a push notification → taps it → DonorRequestScreen → Accept
10. Requester sees the donor in Active Requests → Call → Confirm

---

## Local Testing Coverage

All features work locally with zero real external accounts:

| Feature | Local behaviour |
|---|---|
| OTP auth | `USE_MOCK_SMS=true` — OTP prints to Docker logs |
| Push notifications | No Firebase creds → notifications print to Docker logs |
| NID photo upload | MinIO running in Docker — view at `http://localhost:9001` (login: `minioadmin` / `minioadmin`) |
| Masked calling | No Twilio creds → returns fake proxy numbers, logs to Docker |
| PostGIS radius search | Runs fully in the postgres Docker container |
| Eligibility cron | Runs inside the backend container at 06:00 UTC daily |
| Request expiry cron | Runs every 15 minutes — marks OPEN requests EXPIRED after 6 hours |
| Escalation queue | Redis + Bull running in Docker — jobs fire after 15 / 30 min |
| Caregiver SMS | Mock mode → SMS text printed to Docker logs |

---

## Environment Variables

| Variable | Required | Default (dev) | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | `postgresql://user:password@postgres:5432/blooddonor` | PostgreSQL connection string |
| `REDIS_URL` | ✅ | `redis://redis:6379` | Redis connection URL |
| `JWT_SECRET` | ✅ | *(set a random string)* | Signs JWT tokens. Generate: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `JWT_EXPIRES_IN` | — | `30d` | JWT expiry duration |
| `ADMIN_SECRET` | ✅ | *(32+ chars in prod)* | Shared secret for admin endpoints (`x-admin-secret` header) |
| `ALLOWED_ORIGINS` | Prod | *(unset = allow all)* | Comma-separated CORS whitelist, e.g. `https://yourapp.com` |
| `USE_MOCK_SMS` | — | `true` | `true` = print OTP to console; `false` = real SSL Wireless SMS |
| `SSL_WIRELESS_API_KEY` | Prod | — | SSL Wireless API key |
| `SSL_WIRELESS_SID` | Prod | — | SSL Wireless sender ID |
| `FIREBASE_PROJECT_ID` | Prod | — | Firebase project ID |
| `FIREBASE_PRIVATE_KEY` | Prod | — | Firebase service account private key (PEM) |
| `FIREBASE_CLIENT_EMAIL` | Prod | — | Firebase service account email |
| `TWILIO_ACCOUNT_SID` | Prod | — | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Prod | — | Twilio auth token |
| `TWILIO_PROXY_SERVICE_SID` | Prod | — | Twilio Proxy service SID |
| `AWS_ACCESS_KEY_ID` | ✅ | `minioadmin` (dev) | AWS IAM key — use `minioadmin` for local MinIO |
| `AWS_SECRET_ACCESS_KEY` | ✅ | `minioadmin` (dev) | AWS IAM secret — use `minioadmin` for local MinIO |
| `AWS_REGION` | ✅ | `us-east-1` (dev) | `us-east-1` for MinIO; `ap-southeast-1` for real AWS |
| `AWS_S3_BUCKET` | ✅ | `blood-bridge-nid-photos` | Bucket name (auto-created in MinIO on first start) |
| `AWS_ENDPOINT` | Dev only | `http://minio:9000` | Points the S3 SDK at MinIO. **Remove this line in production** |
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
4. Remove `AWS_ENDPOINT` from `.env` (that was MinIO-only)
5. Create an S3 bucket in `ap-southeast-1`

---

## Build Order Reference

| Step | What was built | Key files |
|---|---|---|
| 1 | Docker + infrastructure | `docker-compose.yml`, `Dockerfile`, `init.sql` |
| 2 | Prisma schema + migration | `prisma/schema.prisma` |
| 3 | Auth routes (OTP + JWT) | `routes/auth.js`, `services/smsService.js` |
| 4 | Donor profile routes | `routes/donors.js` |
| 5 | Blood requests + PostGIS + FCM | `routes/requests.js`, `services/geoService.js`, `services/fcmService.js` |
| 6 | Eligibility cron (120-day reset + expiry) | `workers/eligibilityWorker.js` |
| 7 | Bull escalation queue | `workers/escalationWorker.js` |
| 8 | NID verification + S3 + admin | `routes/verify.js`, `services/s3Service.js` |
| 9 | Twilio Proxy masked calling | `routes/call.js`, `services/twilioService.js` |
| 10 | Caregiver management | `routes/caregivers.js` |
| 11 | React Native mobile app | `mobile/` |
| 12 | Production hardening | `app.js` (CORS, rate limiting), `auth.js` (OTP lock), `server.js` (startup validation, graceful shutdown), `Dockerfile` (multi-stage), `docker-compose.yml` (Redis AOF, MinIO), `.github/` |

---

## Common Issues

**`docker compose up -d` fails — port already in use**
→ Another service (Redis, Postgres) is running locally. Stop it:
```bash
sudo systemctl stop redis-server postgresql
```

**`prisma migrate dev` fails with "connection refused"**
→ Docker isn't running or postgres isn't healthy yet.
```bash
docker compose ps
docker compose logs postgres
```

**Backend crashes with `FirebaseAppError: Invalid PEM`**
→ Firebase credentials are still placeholders. Leave them blank — the app runs in FCM mock mode automatically when no valid credentials are present.

**OTP not appearing**
→ Make sure `USE_MOCK_SMS=true` is in `.env` and watch the **backend logs**:
```bash
docker compose logs -f backend | grep "OTP\|SMS"
```

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
→ Check `API_BASE_URL` in `mobile/src/config.js`. Use your PC's LAN IP, not `localhost`, for a physical device:
```bash
# Linux/Mac
ifconfig | grep "inet " | grep -v 127.0.0.1

# Windows
ipconfig | findstr "IPv4"
```

**`donorsNotified: 0` when creating a request**
→ Two possible causes:
1. Donor's `verifiedStatus` is not `VERIFIED` — approve via the admin endpoint
2. Donor is outside the 5 km initial radius — move donor GPS coordinates closer to the hospital

**Caregiver SMS not sending at T+30 min**
→ In dev, check Docker logs for `[SMS MOCK]` lines. If no caregivers are registered, the escalation level 2 job fires but finds no contacts — add caregivers in the Profile tab.

**`relation "User" does not exist`**
→ Run migrations:
```bash
cd backend && npx prisma migrate dev --name init
```

**Server refuses to start with "placeholder values" error**
→ In `NODE_ENV=production`, `JWT_SECRET` and `ADMIN_SECRET` must not contain words like `change_this` or `your_`. Generate real secrets and update `.env`.

**Rate limit hit during testing (429 response)**
→ In development this is unlikely (100 req/15 min). If you hit the OTP limiter (5/min), wait 1 minute. The OTP phone-level lock (3 failures) resets after 15 minutes.
