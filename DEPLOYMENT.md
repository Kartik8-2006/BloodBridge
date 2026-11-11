# Deploying BloodBridge

Database on **Supabase**, API on **Render**, website on **Vercel**. All three have free tiers.

## 1. Database and storage (Supabase)
1. Use the project you already have. Copy the **pooled** connection string (Settings, Database) into `DATABASE_URL` and the **direct** one into `DIRECT_URL` (used only by `db:push`).
2. From `server/` on your computer: `npm run db:push` (creates or updates tables, safe to repeat).
3. Storage: keep the private bucket `hospital-documents` (hospital licences).

## 2. Clerk
Create a **Production** instance, add your Vercel domain, and use its `pk_live_` / `sk_live_` keys below.
Clerk Billing is not used (not available in India). Payments go through Razorpay.

## 3. API on Render
1. Push the repo to GitHub. In Render choose **New, Blueprint** and pick the repo. `render.yaml` creates the service.
2. Fill the secrets it asks for: `DATABASE_URL`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OSM_CONTACT_EMAIL`, and `CLIENT_URL` (your Vercel URL, no trailing slash).
3. Open `https://<service>.onrender.com/api/health`. It should say ok.
Free Render services sleep after 15 minutes idle, so the first request can take about 50 seconds.

## 4. Website on Vercel
1. **New Project**, import the repo, set **Root Directory** to `client`.
2. Environment variables: `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_API_URL` (the Render URL, no trailing slash), and optionally `VITE_SUPPORT_PHONE`, `VITE_SUPPORT_EMAIL`, `VITE_SUPPORT_ADDRESS`.
3. Deploy. `client/vercel.json` already makes deep links like `/app/inventory` work.
4. Go back to Render and make sure `CLIENT_URL` equals the final Vercel URL (it controls CORS and live notifications).

## 5. Razorpay (optional, turns on the Pro plan)
1. Dashboard, Settings, API Keys. Use **Test mode** first. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` on Render.
2. Settings, Webhooks, add `https://<service>.onrender.com/api/billing/webhook`, event **payment.captured**, and put your secret in `RAZORPAY_WEBHOOK_SECRET`.
3. Prices default to Rs 999 / month and Rs 9,990 / year. Override with `PRO_MONTHLY_PAISE` and `PRO_YEARLY_PAISE`.
4. Test with Razorpay test UPI `success@razorpay` or test card 4111 1111 1111 1111. Go live only after Razorpay approves KYC.
Without these keys billing is off and every Pro feature is unlocked.

## 6. Gemini (optional)
Set `GEMINI_API_KEY`. Without it the assistant still answers from the built in site guide, and triage and the forecast summary hide themselves.

## 7. First admin
Set `ADMIN_EMAILS=you@example.com` on Render (comma separated). Whoever signs up with that **verified** email becomes admin.

## Background jobs
They run inside the API process every 30 minutes. On Render's free plan the service sleeps when idle, so reminders go out when it wakes. For on-time reminders use a paid plan or ping `/api/health` every 10 minutes with a free uptime monitor.

## Checklist after deploy
- Sign in as donor, requester and hospital in three browsers, run one request end to end.
- Hospital verification works and the licence uploads.
- Live notifications arrive (needs correct `CLIENT_URL`).
- Razorpay test payment unlocks Analytics.
