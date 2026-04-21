# 🩸 Blood Bridge

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
- Admin approves via a simple API call
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
| Database | PostgreSQL + PostGIS (geospatial radius queries) |
| Cache / Queue | Redis + Bull (delayed job queues) |
| Auth | OTP via SSL Wireless (Bangladesh) + JWT |
| Push notifications | Firebase Cloud Messaging (FCM) via firebase-admin |
| Masked calls | Twilio Proxy API |
| File storage | AWS S3 (presigned URLs — direct upload from mobile) |
| ORM | Prisma |
| Infrastructure | Docker + docker-compose |

---

## Project Structure

```
Blood-Bridge/
│
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.js          # OTP send/verify, JWT issue
│   │   │   ├── donors.js        # Profile, availability, eligibility
│   │   │   ├── requests.js      # Create request, accept, confirm donation
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
│   │   │   └── geoService.js   # PostGIS ST_DWithin raw SQL
│   │   ├── middleware/
│   │   │   ├── auth.js          # JWT verify → req.user
│   │   │   ├── adminAuth.js     # x-admin-secret header check
│   │   │   └── errorHandler.js  # Central error handler (last middleware)
│   │   ├── config/
│   │   │   ├── prisma.js        # Single shared PrismaClient instance
│   │   │   └── redis.js         # Single shared ioredis instance
│   │   ├── app.js               # Express setup (routes + middleware)
│   │   └── server.js            # HTTP server + workers start
│   ├── prisma/
│   │   └── schema.prisma        # DB schema (User, BloodRequest, DonorResponse, Caregiver)
│   ├── docker-compose.yml
│   ├── Dockerfile
│   ├── init.sql                 # Enables PostGIS on first DB start
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

Make sure the following are installed before you begin:

| Tool | Version | Install |
|---|---|---|
| Node.js | 20 LTS or 24 | https://nodejs.org |
| npm | 9+ | comes with Node.js |
| Docker Desktop | latest | https://docs.docker.com/get-docker/ |
| Expo Go (phone) | latest | Play Store / App Store |
| Android Studio (optional) | latest | for Android emulator |

> **Node.js version note:** Node 20 LTS and Node 24 both work. If you use Node 24, make sure Expo SDK is 54+ (this project uses SDK 54).
>
> **No Expo CLI install needed** — Expo is run directly from `node_modules`:
> ```bash
> ./node_modules/expo/bin/cli start
> ```
>
> **Check versions:**
> ```bash
> node --version
> docker --version
> docker compose version
> ```

> **Docker permission (Linux only):** If you get `permission denied` on docker commands, run once:
> ```bash
> sudo usermod -aG docker $USER && newgrp docker
> ```

---

## Backend Setup

### Step 1 — Clone and enter the backend

```bash
cd backend
```

### Step 2 — Create your `.env` file

```bash
cp .env.example .env
```

For local development, the defaults in `.env.example` work immediately:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/blooddonor
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev_secret_change_in_production
USE_MOCK_SMS=true        # ← OTP prints to server console, no real SMS sent
NODE_ENV=development
```

### Step 3 — Start PostgreSQL and Redis via Docker

```bash
docker compose up -d postgres redis
```

> This pulls the `postgis/postgis:15-3.3` image (includes PostGIS) and `redis:7-alpine`.
> The `init.sql` file automatically enables the PostGIS extension on first start.
>
> **Check containers are running:**
> ```bash
> docker-compose ps
> ```

### Step 4 — Install dependencies

```bash
npm install
```

### Step 5 — Run Prisma migration (creates all tables)

```bash
npx prisma migrate dev --name init
```

> This creates all 4 tables: `User`, `BloodRequest`, `DonorResponse`, `Caregiver`.
>
> **Verify in Prisma Studio (optional visual DB browser):**
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

> **Health check:** Open http://localhost:3000/health → `{ "status": "ok" }`

---

## Mobile App Setup

### Step 1 — Enter the mobile folder and install

```bash
cd mobile
npm install
```

### Step 2 — Configure the API URL

Open `src/config.js` and set the right URL for your setup:

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

A QR code appears in the terminal. Choose:

| Target | How | Requirement |
|---|---|---|
| Physical device | Scan QR code with Expo Go | Expo Go app + same WiFi as PC |
| Android emulator | Press `a` | Android Studio + AVD |
| iOS simulator | Press `i` | macOS + Xcode |

> Install Expo Go: [Android](https://play.google.com/store/apps/details?id=host.exp.exponent) · [iOS](https://apps.apple.com/app/expo-go/id982107779)

---

## Running Everything Together

Here is the full startup sequence every time you want to develop:

```bash
# Terminal 1 — backend
cd backend
docker compose up -d postgres redis            # start DB + Redis (idempotent)
npm run dev                                    # start Express server

# Terminal 2 — mobile
cd mobile
./node_modules/expo/bin/cli start --clear      # start Expo dev server
```

---

## API Reference

All endpoints are prefixed with `/api`. Auth-protected routes require:
```
Authorization: Bearer <JWT_TOKEN>
```

---

### Auth

| Method | Endpoint | Body | Description |
|---|---|---|---|
| POST | `/auth/send-otp` | `{ phone }` | Send OTP to phone. Use `+8801XXXXXXXXX` format |
| POST | `/auth/verify-otp` | `{ phone, otp }` | Verify OTP → returns `{ token, user }` |

---

### Donors

| Method | Endpoint | Body | Auth | Description |
|---|---|---|---|---|
| PUT | `/donors/profile` | `{ name, bloodGroup, latitude, longitude, district }` | ✅ | Update donor profile |
| PUT | `/donors/fcm-token` | `{ fcmToken }` | ✅ | Save Firebase push token |
| PUT | `/donors/availability` | `{ isAvailable }` | ✅ | Toggle availability (guarded by 120-day rule) |
| POST | `/donors/log-donation` | `{ donatedAt? }` | ✅ | Manually log a donation → lock for 120 days |
| GET | `/donors/eligibility` | — | ✅ | Get eligibility status + days remaining |

**Blood group values:** `A_POS` `A_NEG` `B_POS` `B_NEG` `O_POS` `O_NEG` `AB_POS` `AB_NEG`

---

### Blood Requests

| Method | Endpoint | Body | Auth | Description |
|---|---|---|---|---|
| POST | `/requests` | `{ bloodGroup, hospitalName, latitude, longitude, unitsNeeded }` | ✅ | Create request → notifies nearby donors |
| GET | `/requests/active` | — | ✅ | Get requester's open requests |
| GET | `/requests/:id` | — | ✅ | Get full request with donor responses |
| POST | `/requests/:id/accept` | — | ✅ | Donor accepts request |
| POST | `/requests/:id/confirm` | `{ donorId }` | ✅ | Requester confirms donation happened |

---

### NID Verification

| Method | Endpoint | Body / Header | Auth | Description |
|---|---|---|---|---|
| GET | `/verify/upload-url` | — | ✅ | Get S3 presigned PUT URL (valid 10 min) |
| POST | `/verify/submit` | `{ s3Key }` | ✅ | Submit NID after upload → status = PENDING |
| GET | `/verify/status` | — | ✅ | Check own verification status |
| PUT | `/verify/admin/:userId` | `{ status }` + `x-admin-secret` header | Admin | Approve/reject NID |
| GET | `/verify/admin/pending` | `x-admin-secret` header | Admin | List all PENDING submissions |

---

### Masked Calling

| Method | Endpoint | Body | Auth | Description |
|---|---|---|---|---|
| POST | `/call/initiate` | `{ requestId }` | ✅ | Create Twilio Proxy session → returns proxy numbers |
| DELETE | `/call/:sessionId` | — | ✅ | End proxy session |

---

## How to Test

### Option A — Postman (recommended)

1. Download [Postman](https://www.postman.com/downloads/)
2. Create a new Collection called **Blood Bridge**
3. Set a Collection Variable: `baseUrl = http://localhost:3000/api`
4. Follow the test flow below:

---

#### Full test flow (step by step)

**Step 1 — Send OTP**
```
POST {{baseUrl}}/auth/send-otp
Body: { "phone": "+8801712345678" }
```
> OTP appears in your **backend terminal** (mock mode):
> ```
> ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
> [SMS MOCK]  To     : +8801712345678
> [SMS MOCK]  Message: Your Blood Bridge OTP is: 482910
> ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
> ```

**Step 2 — Verify OTP → get JWT**
```
POST {{baseUrl}}/auth/verify-otp
Body: { "phone": "+8801712345678", "otp": "482910" }
```
> Response: `{ "token": "eyJ...", "user": { ... } }`
> Copy the token → set as Collection Variable `token = eyJ...`

**Step 3 — Set up profile**
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
> Repeat Steps 1–3 with a different phone number (e.g. `+8801812345678`).
> Save this token as `requesterToken`.

**Step 5 — Create a blood request (as requester)**
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
> Watch the backend terminal — the donor (if within 5km) gets FCM push. With mock, you'll see the geo query log.

**Step 6 — Donor accepts the request**
```
POST {{baseUrl}}/requests/<requestId>/accept
Authorization: Bearer {{token}}   ← donor's token
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
> Donor is now locked for 120 days. Check:
> ```
> GET {{baseUrl}}/donors/eligibility
> Authorization: Bearer {{token}}
> ```

**Step 9 — Admin: approve NID**
```
PUT {{baseUrl}}/verify/admin/<userId>
Headers: x-admin-secret: change_this_admin_secret_in_production
Body: { "status": "VERIFIED" }
```

---

### Option B — curl (quick terminal test)

```bash
# Send OTP
curl -X POST http://localhost:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+8801712345678"}'

# Verify OTP (use OTP from server console)
curl -X POST http://localhost:3000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+8801712345678", "otp": "XXXXXX"}'

# Health check
curl http://localhost:3000/health
```

---

### Option C — Prisma Studio (database browser)

```bash
cd backend
npx prisma studio
```
Opens a visual table browser at **http://localhost:5555**. You can view/edit all rows directly — useful for debugging.

---

## Environment Variables

Full list of `.env` variables and their purpose:

| Variable | Required | Default (dev) | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | `postgresql://user:password@localhost:5432/blooddonor` | PostgreSQL connection string |
| `REDIS_URL` | ✅ | `redis://localhost:6379` | Redis connection URL |
| `JWT_SECRET` | ✅ | *(set a random string)* | Signs JWT tokens — keep secret |
| `JWT_EXPIRES_IN` | — | `30d` | JWT expiry duration |
| `USE_MOCK_SMS` | — | `true` | `true` = print OTP to console, `false` = real SSL Wireless SMS |
| `SSL_WIRELESS_API_KEY` | Prod | — | SSL Wireless API key |
| `SSL_WIRELESS_SID` | Prod | — | SSL Wireless sender ID |
| `FIREBASE_PROJECT_ID` | Prod | — | Firebase project ID (for push notifications) |
| `FIREBASE_PRIVATE_KEY` | Prod | — | Firebase service account private key |
| `FIREBASE_CLIENT_EMAIL` | Prod | — | Firebase service account email |
| `TWILIO_ACCOUNT_SID` | Prod | — | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Prod | — | Twilio auth token |
| `TWILIO_PROXY_SERVICE_SID` | Prod | — | Twilio Proxy service SID |
| `AWS_ACCESS_KEY_ID` | Prod | — | AWS IAM access key |
| `AWS_SECRET_ACCESS_KEY` | Prod | — | AWS IAM secret key |
| `AWS_REGION` | Prod | `ap-southeast-1` | S3 bucket region (Singapore) |
| `AWS_S3_BUCKET` | Prod | — | S3 bucket name for NID photos |
| `ADMIN_SECRET` | ✅ | *(set any string)* | Shared secret for admin endpoints (`x-admin-secret` header) |
| `PORT` | — | `3000` | Backend server port |
| `NODE_ENV` | — | `development` | `development` or `production` |

---

## Getting Real Credentials

When you're ready to move beyond mock/dev mode:

### SSL Wireless (OTP SMS — Bangladesh)
1. Register at [sslwireless.com](https://sslwireless.com)
2. Get `API_KEY` and `SID` from dashboard
3. Set `USE_MOCK_SMS=false` in `.env`

### Firebase (Push Notifications)
1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create a project → **Project Settings → Service Accounts**
3. Click **Generate new private key** → download JSON
4. Copy `project_id`, `private_key`, `client_email` to `.env`
5. In the mobile app: add your app's `google-services.json` (Android) to `mobile/`

### Twilio Proxy (Masked Calls)
1. Sign up at [twilio.com](https://twilio.com)
2. Go to **Proxy → Services → Create a Service**
3. Add phone numbers to the proxy pool (buy Bangladesh numbers if available, else US)
4. Copy Account SID, Auth Token, Proxy Service SID to `.env`

### AWS S3 (NID Photo Storage)
1. Go to [AWS Console → IAM](https://console.aws.amazon.com/iam)
2. Create a user → attach **AmazonS3FullAccess** policy (or a scoped policy)
3. Generate access keys → copy to `.env`
4. Create an S3 bucket in `ap-southeast-1` region
5. Set bucket name in `.env`

---

## Build Order Reference

The project was built in this order (each step is a separate git commit):

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
| 10 | React Native mobile app | `mobile/` (all screens, stores, navigation) |

---

## Common Issues

**`prisma migrate dev` fails with "connection refused"**
→ Docker isn't running, or postgres container isn't healthy yet.
```bash
docker compose ps             # check status
docker compose logs postgres  # check for errors
```

**Backend crashes with `FirebaseAppError: Invalid PEM`**
→ Firebase credentials in `.env` are still placeholders. This is fine — the app runs in FCM mock mode automatically (push notifications print to console instead of being sent).

**OTP not appearing**
→ Make sure `USE_MOCK_SMS=true` is in `.env` and watch the **backend terminal** (not the mobile app).

**`npx expo start` gives `expo: not found`**
→ Run Expo directly from node_modules:
```bash
./node_modules/expo/bin/cli start --clear
```

**Expo Go shows "Project is incompatible with this version"**
→ Your Expo Go version and `package.json` SDK version don't match. This project uses **SDK 54**. Update Expo Go on your phone to the latest version.

**Metro bundler crashes with `ENOENT: no such file or directory`**
→ A temp file was deleted mid-start. Use `--clear` flag:
```bash
./node_modules/expo/bin/cli start --clear
```

**Mobile app can't reach backend**
→ Check `API_BASE_URL` in `mobile/src/config.js`. Use your PC's LAN IP (not localhost) for a physical device. Find it with `ifconfig` (Linux/Mac) or `ipconfig` (Windows).

**PostGIS queries return `donorsNotified: 0`**
→ Two possible reasons:
1. Donor's `verifiedStatus` is not `VERIFIED` — approve them via the admin endpoint
2. Donor is outside the 5km initial radius — either move the donor's location or use a hospital closer to the donor

**`relation "User" does not exist`**
→ Run `npx prisma migrate dev --name init` from the `backend/` directory.
