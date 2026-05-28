# Blood Bridge

> A mobile-first blood donor platform for Bangladesh — built to solve real problems that existing apps (Rokto, Bloodline) do not.

---

## Table of Contents

1. [What This App Does](#what-this-app-does)
2. [Core Features](#core-features)
3. [Tech Stack](#tech-stack)
4. [Project Structure](#project-structure)
5. [Prerequisites](#prerequisites)
6. [Backend Setup](#backend-setup)
7. [Mobile App Setup](#mobile-app-setup)
8. [Admin Dashboard Setup](#admin-dashboard-setup)
9. [Running Everything Together](#running-everything-together)
10. [API Reference](#api-reference)
11. [How to Test](#how-to-test)
12. [Environment Variables](#environment-variables)
13. [Getting Real Credentials](#getting-real-credentials)
14. [Production Deployment](#production-deployment)
15. [Common Issues](#common-issues)

---

## What This App Does

Blood Bridge connects people who urgently need blood with nearby verified donors. Unlike existing apps:

- Donors sign in with **email + password** — no SMS OTP, no carrier dependency.
- Donors are **verified** via email confirmation **and** NID (National ID) photo — only doubly-verified accounts appear in donor search.
- Donors are **automatically locked for 120 days** after donating (WHO guideline).
- If no donor responds in 15–30 minutes, the system **escalates automatically** — expanding the search radius and SMSing emergency caregivers.
- Donors can **browse all open requests** across the country and accept the ones that match their blood group.
- A **1-hour temporary chat** opens between requester and donor after a match. A **"Share Number?"** button lets either party voluntarily share their phone in chat — no masked calling service required.
- Users can **favourite** other users for quick reconnection.

---

## Core Features

### 1. Email-based auth with verified donors
- Sign up with email + password (bcrypt hashed). Sign in returns a 30-day JWT.
- **Email verification:** 6-digit OTP sent to the user's inbox via Gmail SMTP (Nodemailer). 10-minute TTL stored in Redis.
- **Change email / change password:** also gated by an email-OTP step.
- **Forgot password:** rate-limited (3/hr per email), 30-minute one-time reset link sent via email. Reset form lives at `/reset` on the admin dashboard.
- **NID photo verification:** uploaded to S3 (Backblaze B2 in production, MinIO in local dev) via presigned URL, then admin-approved from the dashboard.
- **Donor search filter:** only users with `emailVerified = true` AND `verifiedStatus = VERIFIED` appear in the PostGIS radius search.

### 2. 120-day auto-eligibility tracker
- When a donation is confirmed, donor is auto-locked (`isAvailable = false`).
- A daily cron at 6:00 AM BST checks who is eligible again and:
  - Flips `isAvailable = true`, clears `eligibleAgainAt`
  - Sends an Expo push notification: "You can donate again!"
- Blood requests auto-expire after 6 hours — a 15-minute cron marks stale OPEN requests as EXPIRED.

### 3. Caregiver escalation system
- **T + 0 min:** Request created → 5 km radius → notify nearby verified donors via Expo push.
- **T + 15 min:** No donor accepted → expand to 15 km → notify more donors.
- **T + 30 min:** Still no donor → SMS all registered caregivers (SSL Wireless).
- Escalation stops automatically when a donor accepts — the cron skips any request that is no longer OPEN.
- Caregivers are managed in the app (up to 5 per user, ordered by priority).

### 4. Browse + favourites
- Donors see all OPEN requests across BD via `GET /api/requests/browse` (paginated, 50/page).
- The Accept button is greyed out for non-matching blood groups; backend enforces the same rule at `POST /api/requests/:id/accept`.
- Favourites are a server-side `Favourite` table — `GET/POST/DELETE /api/donors/favourites[/:userId]`. Long-press a row in the Favourites screen to remove.

### 5. Temporary 1-hour chat + Share Number
- After a match, donor and requester get a private chat window that disappears after 1 hour.
- Messages stored in a Redis LIST with a 1-hour TTL — no chat history persists after expiry.
- Mobile app polls every 4 seconds for new messages using an index-based `since=N` parameter (efficient: only fetches new messages).
- **Share Number?** button reads `user.phone` from the auth store, shows a confirmation modal, and posts a regular chat message containing the phone number — no Twilio, no masked numbers.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | React Native 0.81 (Expo SDK 54 managed), Zustand, Axios |
| Backend | Node.js + Express, bcryptjs, Nodemailer, ioredis, Prisma |
| Database | PostgreSQL 15 + PostGIS (geospatial radius queries) |
| Cache | Redis 7 (email OTPs, reset tokens, 1-hour chat) |
| Scheduled jobs | Cloudflare Workers (free cron triggers, no credit card) |
| Auth | Email + password, JWT, email OTPs via Gmail SMTP |
| Push notifications | Expo Push Notification Service (via expo-server-sdk) |
| SMS | SSL Wireless (caregiver escalation only) |
| File storage | Backblaze B2 in production (S3-compatible, free 10 GB); MinIO in dev |
| Admin dashboard | Next.js 15 (app router) |
| Infrastructure | Docker + docker-compose |
| CI/CD | GitHub Actions + Dependabot |

---

## Project Structure

```
Blood-Bridge/
│
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                # CI: audit, migrate, test, Docker build
│   │   └── deploy.yml            # Manual deploy: backend | admin | cloudflare-worker | all
│   └── dependabot.yml            # Weekly automated dependency PRs
│
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.js           # signup, login, email OTP, forgot/reset password
│   │   │   ├── donors.js         # profile, availability, phone, favourites
│   │   │   ├── requests.js       # post, browse, accept, confirm
│   │   │   ├── verify.js         # NID upload, admin review
│   │   │   ├── chat.js           # 1-hour Redis-backed chat
│   │   │   ├── caregivers.js     # caregiver CRUD (max 5 per user)
│   │   │   ├── admin.js          # dashboard stats + user/request lists
│   │   │   └── cron.js           # protected cron endpoints
│   │   ├── services/
│   │   │   ├── emailService.js   # Nodemailer + Gmail SMTP wrapper
│   │   │   ├── smsService.js     # SSL Wireless wrapper (caregiver SMS only)
│   │   │   ├── fcmService.js     # Expo push wrapper
│   │   │   ├── s3Service.js      # Presigned URL generation
│   │   │   └── geoService.js     # PostGIS ST_DWithin raw SQL
│   │   ├── middleware/
│   │   │   ├── auth.js           # JWT verify → req.user
│   │   │   ├── adminAuth.js      # x-admin-secret check
│   │   │   └── errorHandler.js
│   │   ├── config/
│   │   │   ├── prisma.js
│   │   │   └── redis.js
│   │   ├── app.js
│   │   └── server.js
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── docker-compose.yml        # postgres + redis + minio + backend
│   ├── Dockerfile
│   ├── init.sql                  # enables PostGIS on first DB start
│   ├── .env.example
│   └── package.json
│
├── cloudflare-worker/
│   ├── index.js
│   ├── wrangler.toml
│   └── package.json
│
├── admin/                        # Next.js 15 admin dashboard
│   ├── app/
│   │   ├── login/page.js
│   │   ├── reset/page.js         # Public password-reset page (linked from email)
│   │   └── (main)/
│   │       ├── layout.js
│   │       ├── dashboard/page.js
│   │       ├── verifications/page.js
│   │       ├── users/page.js
│   │       └── requests/page.js
│   ├── components/{Sidebar.js,Badge.js}
│   ├── lib/api.js
│   ├── middleware.js
│   └── .env.local
│
└── mobile/
    ├── App.js
    ├── app.json
    └── src/
        ├── config.js
        ├── navigation/RootNavigation.js
        ├── hooks/usePushNotifications.js
        ├── store/
        │   ├── authStore.js
        │   └── requestStore.js
        ├── services/api.js
        ├── screens/
        │   ├── SignInScreen.js
        │   ├── SignUpScreen.js
        │   ├── ForgotPasswordScreen.js
        │   ├── HomeScreen.js
        │   ├── BrowseRequestsScreen.js
        │   ├── RequestBloodScreen.js
        │   ├── ActiveRequestScreen.js
        │   ├── DonorAcceptedScreen.js
        │   ├── DonorRequestScreen.js
        │   ├── DonorProfileScreen.js
        │   ├── VerificationScreen.js
        │   ├── CaregiversScreen.js
        │   ├── FavouritesScreen.js
        │   └── ChatScreen.js
        ├── components/BloodGroupPicker.js
        └── utils/formatters.js
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
CRON_SECRET=dev_cron_secret_change_in_production
USE_MOCK_SMS=true
USE_MOCK_EMAIL=true
NODE_ENV=development
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_ENDPOINT=http://minio:9000
```

> - `USE_MOCK_SMS=true` — caregiver SMS prints to the server terminal.
> - `USE_MOCK_EMAIL=true` — email OTPs print to the server terminal (no Gmail required in dev).

### Step 3 — Start all services via Docker

```bash
docker compose up -d
```

This starts PostgreSQL (with PostGIS), Redis, MinIO (local S3), and the backend API. The backend automatically runs migrations and creates the MinIO bucket on startup.

```
[DB] PostgreSQL connected
[S3] Bucket "blood-bridge-nid-photos" ready
[Server] Listening on port 3000 (development)
```

> **Health checks:**
> - `GET http://localhost:3000/health` → liveness
> - `GET http://localhost:3000/health/ready` → readiness (DB + Redis)

> **MinIO console:** `http://localhost:9001` — `minioadmin` / `minioadmin`

### Running backend outside Docker

```bash
docker compose up -d postgres redis minio   # start only deps
# In .env, change service names to localhost:
#   DATABASE_URL=postgresql://user:password@localhost:5432/blooddonor
#   REDIS_URL=redis://localhost:6379
#   AWS_ENDPOINT=http://localhost:9000
npm install
npx prisma migrate deploy
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

Open [mobile/src/config.js](mobile/src/config.js) and pick the right URL:

```js
// Physical Android/iOS device on the same WiFi as your computer
// export const API_BASE_URL = 'http://192.168.0.110:3000/api';

// Android emulator
// export const API_BASE_URL = 'http://10.0.2.2:3000/api';

// Production (default)
export const API_BASE_URL = 'https://blood-bridge-dev.vercel.app/api';
```

### Step 3 — Start Expo

```bash
./node_modules/expo/bin/cli start --clear
```

### Step 4 — Build a production APK (Android)

```bash
eas login
eas build --platform android --profile preview
```

EAS builds on Expo's servers (~15 min). The `preview` profile outputs a `.apk` you can install directly on any Android device.

---

## Admin Dashboard Setup

```bash
cd admin
npm install
```

`.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api
```

```bash
npm run dev
```

Opens at **http://localhost:4000**. Log in with the `ADMIN_SECRET` from `backend/.env`.

The dashboard also serves `/reset` — the public page users land on when they click the password-reset link from their email.

---

## Running Everything Together

```bash
# Terminal 1 — backend
cd backend && docker compose up -d

# Terminal 2 — mobile
cd mobile && ./node_modules/expo/bin/cli start --clear

# Terminal 3 — admin dashboard
cd admin && npm run dev    # http://localhost:4000
```

---

## Mobile Navigation

```
App
├── (not logged in)   SignInScreen → SignUpScreen / ForgotPasswordScreen
└── (logged in)       Bottom Tab Navigator
      ├── 🏠 Home       HomeScreen              — eligibility card, browse shortcut
      ├── 🔍 Browse     BrowseRequestsScreen    — all OPEN requests, accept matching
      ├── 🩸 Request    RequestBloodScreen + ActiveRequestScreen
      ├── 💉 Donate     DonorAcceptedScreen     — accepted requests, chat, favourite
      └── 👤 Profile    DonorProfileScreen → VerificationScreen / CaregiversScreen / FavouritesScreen

Push notification tap → DonorRequestScreen   — request detail + Accept
Any matched pair      → ChatScreen           — 1-hour chat with "Share Number?"
```

---

## API Reference

All endpoints are prefixed with `/api`. Protected routes require:
```
Authorization: Bearer <JWT_TOKEN>
```

**Rate limits:**
- All API endpoints: 100 requests / 15 min / IP
- Auth-sensitive endpoints (`/auth/login`, `/auth/send-email-otp`, `/auth/forgot-password`): 5 requests / minute / IP
- Forgot password: 3 requests / hour / email (server-side check)
- Admin endpoints: 20 requests / 15 min / IP

---

### Auth — public

| Method | Endpoint | Body | Description |
|---|---|---|---|
| POST | `/auth/signup` | `{ email, password, name, bloodGroup }` | Create account → returns `{ token, user }`. No verification required to log in. |
| POST | `/auth/login` | `{ email, password }` | Sign in → returns `{ token, user }` |
| POST | `/auth/forgot-password` | `{ email }` | Sends a reset link (always 200, never leaks whether email exists). 3/hr per email. |
| POST | `/auth/reset-password` | `{ token, newPassword }` | Consumes the reset token, sets new password (min. 8 chars). |

### Auth — authenticated

| Method | Endpoint | Body | Description |
|---|---|---|---|
| POST | `/auth/send-email-otp` | `{ purpose: 'verify' \| 'change_email' \| 'change_password' }` | Email a 6-digit code (10 min TTL) |
| POST | `/auth/verify-email-otp` | `{ purpose, code, newEmail?, newPassword? }` | Verify code; for `verify` sets `emailVerified=true`; for `change_email`/`change_password` applies the update |

---

### Donors

| Method | Endpoint | Body | Description |
|---|---|---|---|
| PUT | `/donors/profile` | `{ name?, bloodGroup?, latitude?, longitude?, district? }` | Update profile (≥1 field) |
| PUT | `/donors/phone` | `{ phone \| null }` | Save optional profile phone (used by "Share Number" in chat) |
| PUT | `/donors/fcm-token` | `{ fcmToken }` | Save Expo push token |
| PUT | `/donors/availability` | `{ isAvailable }` | Toggle (guarded by 120-day rule) |
| POST | `/donors/log-donation` | `{ donatedAt? }` | Manually log a donation → lock 120 days |
| GET | `/donors/eligibility` | — | Status + days remaining |
| GET | `/donors/my-responses` | — | This donor's accepted/donated requests |
| GET | `/donors/favourites` | — | List of favourited users |
| POST | `/donors/favourites/:userId` | — | Idempotent add to favourites |
| DELETE | `/donors/favourites/:userId` | — | Remove from favourites |

**Blood group values:** `A_POS` `A_NEG` `B_POS` `B_NEG` `O_POS` `O_NEG` `AB_POS` `AB_NEG`

---

### Blood Requests

| Method | Endpoint | Body | Description |
|---|---|---|---|
| POST | `/requests` | `{ bloodGroup, hospitalName, latitude, longitude, unitsNeeded? }` | Create → notifies donors within 5 km |
| GET | `/requests/browse` | `?offset=N` | All OPEN requests across BD (paginated 50/page, donor-side) |
| GET | `/requests/active` | — | Requester's OPEN and MATCHED requests |
| GET | `/requests/:id` | — | Full request with donor responses |
| POST | `/requests/:id/accept` | — | Donor accepts (enforces blood-group match) → status MATCHED |
| POST | `/requests/:id/confirm` | `{ donorId }` | Requester confirms donation → locks donor 120 days |

`unitsNeeded` must be 1–10. Blood requests expire after 6 hours.

---

### NID Verification

| Method | Endpoint | Body / Header | Description |
|---|---|---|---|
| POST | `/verify/upload` | `multipart/form-data` field `photo` | Upload NID photo via backend → returns `{ s3Key }` |
| GET | `/verify/upload-url` | — | Get presigned S3 PUT URL for direct upload (alt) |
| POST | `/verify/submit` | `{ s3Key }` | Register the uploaded photo → status PENDING |
| GET | `/verify/status` | — | Check own status |
| GET | `/verify/admin/pending` | `x-admin-secret` header | List PENDING submissions |
| PUT | `/verify/admin/:userId` | `{ status }` + `x-admin-secret` | Approve/reject (`VERIFIED` \| `UNVERIFIED` \| `PENDING`) |
| GET | `/verify/admin/:userId/nid-photo` | `x-admin-secret` | Proxy the NID photo bytes through the API |

---

### Chat

| Method | Endpoint | Query / Body | Description |
|---|---|---|---|
| POST | `/chat/:requestId` | `{ text }` (max 500 chars) | Send a message. First message sets the 1-hour TTL. |
| GET | `/chat/:requestId` | `?since=N` | Fetch messages from index N. Returns `{ messages, total, ttlSeconds, expired }`. |

Chat is backed by a Redis LIST (`chat:{requestId}`, TTL 3600 s). Only the donor and requester of the matched request can read or write.

---

### Admin Dashboard

| Method | Endpoint | Query Params | Description |
|---|---|---|---|
| GET | `/admin/stats` | — | Counters |
| GET | `/admin/users` | `page, limit, search (name/email), verifiedStatus, bloodGroup` | Paginated user list |
| GET | `/admin/requests` | `page, limit, status, bloodGroup` | Paginated blood request list |

All admin routes require `x-admin-secret: <ADMIN_SECRET>` header.

---

### Caregivers

| Method | Endpoint | Body | Description |
|---|---|---|---|
| GET | `/caregivers` | — | List caregivers by priority |
| POST | `/caregivers` | `{ name, phone, priority? }` | Add (max 5 per account) |
| DELETE | `/caregivers/:id` | — | Remove |

`phone` must be valid E.164: `+8801XXXXXXXXX`.

---

## How to Test

### Option A — Mobile App (end-to-end)

1. Start backend: `cd backend && docker compose up -d`
2. Start Expo: `cd mobile && ./node_modules/expo/bin/cli start --clear`
3. Scan the QR code with Expo Go.
4. **Sign up** with any email and an 8+ char password.
5. **Verify email**: Profile tab → Verify → OTP appears in Docker logs (mock mode):
   ```bash
   docker compose logs -f backend | grep "EMAIL MOCK"
   ```
6. Set blood group, district, GPS.
7. From a second device, sign up as another user (different blood group).
8. The other user creates a request → first donor browses → accepts (if blood groups match) → both chat for 1 hour.

### Option B — curl

```bash
# Sign up
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"donor@test.com","password":"testpassword123","name":"Donor A","bloodGroup":"O_POS"}'

# Health check
curl http://localhost:3000/health

# Readiness (DB + Redis)
curl http://localhost:3000/health/ready
```

### Option C — Prisma Studio

```bash
cd backend && npx prisma studio
```
Opens at **http://localhost:5555**.

---

## Environment Variables

| Variable | Required | Default (dev) | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | `postgresql://user:password@postgres:5432/blooddonor` | PostgreSQL connection |
| `REDIS_URL` | ✅ | `redis://redis:6379` | Redis connection |
| `JWT_SECRET` | ✅ | *(random string)* | JWT signing key |
| `JWT_EXPIRES_IN` | — | `30d` | JWT expiry |
| `ADMIN_SECRET` | ✅ | *(32+ chars in prod)* | Admin dashboard secret |
| `CRON_SECRET` | ✅ | *(32+ chars in prod)* | Cloudflare Worker shared secret |
| `ALLOWED_ORIGINS` | Prod | *(allow all)* | CORS whitelist, comma-separated |
| `USE_MOCK_SMS` | — | `true` | `true` = print caregiver SMS to console |
| `SSL_WIRELESS_API_KEY` | Prod | — | SSL Wireless key |
| `SSL_WIRELESS_SID` | Prod | — | SSL Wireless sender ID |
| `USE_MOCK_EMAIL` | — | `true` | `true` = print email OTPs to console |
| `GMAIL_USER` | Prod | — | Gmail address used as sender |
| `GMAIL_APP_PASSWORD` | Prod | — | Google App Password (16-char, requires 2FA) |
| `FRONTEND_RESET_URL` | Prod | — | URL of the `/reset` page on the admin dashboard |
| `AWS_ACCESS_KEY_ID` | ✅ | `minioadmin` (dev) | Dev: MinIO. Prod: Backblaze B2 keyID |
| `AWS_SECRET_ACCESS_KEY` | ✅ | `minioadmin` (dev) | Dev: MinIO. Prod: Backblaze B2 applicationKey |
| `AWS_REGION` | ✅ | `us-east-1` (dev) | Backblaze region in prod (e.g. `us-west-004`) |
| `AWS_S3_BUCKET` | ✅ | `blood-bridge-nid-photos` | Bucket name |
| `AWS_ENDPOINT` | ✅ | `http://minio:9000` (dev) | S3-compatible endpoint |
| `MINIO_PUBLIC_URL` | Dev only | `http://<YOUR_LAN_IP>:9000` | Dev-only LAN-accessible MinIO host |
| `PORT` | — | `3000` | Server port |
| `NODE_ENV` | — | `development` | `development` or `production` |

> **Startup validation:** the server refuses to start if `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, or `CRON_SECRET` are missing. In production, it also rejects placeholder values and enforces `ADMIN_SECRET` ≥ 32 chars.

---

## Getting Real Credentials

### Gmail App Password (email OTPs)
1. Enable 2-Step Verification at https://myaccount.google.com/security
2. Generate an App Password at https://myaccount.google.com/apppasswords
3. Set `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `USE_MOCK_EMAIL=false` in Vercel env
4. Set `FRONTEND_RESET_URL` to your admin dashboard's `/reset` URL

### SSL Wireless (caregiver SMS — Bangladesh)
1. Register at [sslwireless.com](https://sslwireless.com)
2. Get `API_KEY` and `SID` from the dashboard
3. Set `USE_MOCK_SMS=false`

### Expo Push
No account or credentials needed. For EAS production builds:
```bash
eas login
eas init   # adds projectId to app.json
```

### Backblaze B2 (NID photo storage)
1. Sign up at [backblaze.com](https://backblaze.com) — free, no credit card
2. **B2 Cloud Storage → Buckets → Create a Bucket** (private)
3. **App Keys → Add a New Application Key** — Read & Write on your bucket
4. Copy `keyID` → `AWS_ACCESS_KEY_ID`, `applicationKey` → `AWS_SECRET_ACCESS_KEY`
5. From the bucket page, copy the **Endpoint** → `AWS_ENDPOINT`
6. Set `AWS_REGION` to the region segment of the endpoint (e.g. `us-west-004`)
7. Remove `MINIO_PUBLIC_URL` from production env

---

## Live Production URLs

| Service | URL |
|---|---|
| API | https://blood-bridge-dev.vercel.app |
| Admin Dashboard | https://blood-bridge-admin.vercel.app |
| Password reset page | https://blood-bridge-admin.vercel.app/reset |
| Cron Worker | blood-bridge-cron.ringku.workers.dev |

Health check: `GET https://blood-bridge-dev.vercel.app/health/ready`

---

## Production Deployment

The production stack runs entirely on **free tiers, no credit card required**:

| Service | Platform | Purpose |
|---|---|---|
| API (Express) | Vercel | Stateless HTTP routes |
| Admin Dashboard | Vercel | Next.js dashboard + `/reset` page |
| Database | Neon | PostgreSQL + PostGIS (free 0.5 GB) |
| Cache | Redis Cloud | Redis (free 30 MB) |
| Scheduled jobs | Cloudflare Workers | Cron triggers (free, no card) |
| File Storage | Backblaze B2 | NID photos (free 10 GB) |
| Email | Gmail SMTP | OTPs + password reset (free 500/day) |
| SMS | SSL Wireless | Caregiver escalation |
| Push | Expo Push | Free, no credentials |

### Deploy order

1. **Neon** — create project (Singapore region) → enable PostGIS → run `prisma migrate deploy`
2. **Redis Cloud** — create free database (Singapore) → copy `REDIS_URL`
3. **Backblaze B2** — create private bucket + App Key → copy credentials
4. **Vercel (backend)** — import repo, root dir = `backend`, add env vars (including `GMAIL_*`, `FRONTEND_RESET_URL`, `CRON_SECRET`) → deploy
5. **Vercel (admin)** — import repo, root dir = `admin` → deploy
6. **Cloudflare Worker** — deploy the cron scheduler (see below)

### Deploying via GitHub Actions

1. Go to repo → **Actions** → **Deploy** workflow → **Run workflow**
2. Pick a target from the dropdown: `backend` / `admin` / `cloudflare-worker` / `all`
3. Click **Run workflow**

**Required GitHub Secrets** (repo → Settings → Secrets and variables → Actions):

| Secret | Where to find it |
|---|---|
| `VERCEL_TOKEN` | vercel.com → Account Settings → Tokens → Create |
| `VERCEL_ORG_ID` | vercel.com → Account Settings → General → Your ID |
| `VERCEL_BACKEND_PROJECT_ID` | Vercel → backend project → Settings → General |
| `VERCEL_ADMIN_PROJECT_ID` | Vercel → admin project → Settings → General |
| `CLOUDFLARE_API_TOKEN` | dash.cloudflare.com → My Profile → API Tokens → Create (use "Edit Cloudflare Workers" template) |
| `CLOUDFLARE_ACCOUNT_ID` | dash.cloudflare.com → Workers & Pages → right sidebar |

### Cloudflare Worker setup

```bash
cd cloudflare-worker
npm install
npx wrangler login
npx wrangler deploy
```

Then set the worker env vars in **Workers & Pages → blood-bridge-cron → Settings → Variables and Secrets**:
- `API_BASE_URL` = your Vercel deployment URL
- `CRON_SECRET` = same value as `CRON_SECRET` in Vercel

The Worker calls your API on three schedules:
- Every minute → `POST /api/cron/escalate`
- Every 15 min → `POST /api/cron/expiry`
- Daily 00:00 UTC → `POST /api/cron/eligibility`

---

## Common Issues

**`docker compose up -d` fails — port already in use**
→ Another service (Redis, Postgres) is running locally. Stop it:
```bash
sudo systemctl stop redis-server postgresql
```

**`prisma migrate dev` fails with "connection refused"**
→ Docker isn't running or postgres isn't healthy yet:
```bash
docker compose ps && docker compose logs postgres
```

**Email OTP not appearing**
→ Make sure `USE_MOCK_EMAIL=true` is in `.env` for dev. Watch backend logs:
```bash
docker compose logs -f backend | grep "EMAIL MOCK"
```
For production, double-check `GMAIL_USER` and `GMAIL_APP_PASSWORD` are set in Vercel.

**Forgot password reset link goes to a 404**
→ The admin dashboard must be deployed. Confirm `FRONTEND_RESET_URL` matches your live admin URL (`<admin>/reset`).

**`expo start` gives `expo: not found`**
→ Run directly from node_modules:
```bash
./node_modules/expo/bin/cli start --clear
```

**Mobile app can't reach backend**
→ Check `API_BASE_URL` in `mobile/src/config.js`. Use your PC's LAN IP, not `localhost`, for a physical device.

**`donorsNotified: 0` when creating a request**
→ Donors must be email-verified AND NID-verified AND within 5 km AND have matching blood group. Approve via admin endpoint and verify GPS.

**Server refuses to start with "Missing required environment variables"**
→ `JWT_SECRET`, `DATABASE_URL`, `REDIS_URL`, and `CRON_SECRET` must all be set.

**Admin dashboard shows "Failed to fetch" on login**
→ Backend must be running first. `curl http://localhost:3000/health` to confirm.

**Rate limit hit during testing (429 response)**
→ Auth-sensitive endpoints (login, OTP, forgot-password) are limited to 5/min/IP. Wait one minute.
