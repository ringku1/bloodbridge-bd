# Blood Bridge — Admin Dashboard

Next.js 15 web app for reviewing donor NID verifications and monitoring platform activity.

---

## What it does

- **Dashboard** — live counters: total users, pending verifications, active requests, donations
- **Verifications** — view NID photos, approve or reject donors
- **Users** — paginated list with search, blood group filter, verification status filter
- **Requests** — paginated blood request list with status and blood group filters

Protected by `ADMIN_SECRET` — set as `x-admin-secret` cookie on login, checked on every API call.

---

## Local setup

```bash
cd admin
npm install
npm run dev   # → http://localhost:4000
```

`.env.local` is pre-configured for local dev:
```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api
```

Log in with the `ADMIN_SECRET` value from `backend/.env`.

---

## Production

Set `NEXT_PUBLIC_API_URL` to your Vercel API URL:
```env
NEXT_PUBLIC_API_URL=https://your-api.vercel.app/api
```

Deploy to Vercel:
- Root directory: `admin`
- Framework: Next.js
- Add `NEXT_PUBLIC_API_URL` as environment variable
