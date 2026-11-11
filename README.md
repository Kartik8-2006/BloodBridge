# BloodBridge — Phase 5

Blood-donation network for donors, requesters, hospitals and admins.
Phase 1 = foundation: sign-in and roles, profiles, a **real hospital directory (OpenStreetMap)**, hospital claim + admin verification, role dashboards, notifications, settings.

Stack: React 19 + Vite + Tailwind 4 · Express 5 + TypeScript · Prisma + Supabase Postgres · Clerk (auth).

## 1. What you need
- Node 20+ (22 recommended)
- Supabase project (free) → Postgres connection strings + Storage
- Clerk application (free) → publishable + secret key
- A real email for `OSM_CONTACT_EMAIL` (Overpass/Nominatim usage policy requires a contact)

## 2. Supabase
1. Project Settings → Database → Connection string. Copy the **Transaction pooler** string (port 6543) as `DATABASE_URL` and the **Direct / Session** string (port 5432) as `DIRECT_URL`.
2. Project Settings → API → copy the Project URL and the `service_role` key.
3. Storage → create a **private** bucket named `hospital-documents` (must match `SUPABASE_STORAGE_BUCKET`).

## 3. Clerk
1. Create an application, enable Email and/or Google sign-in.
2. Copy the Publishable key (client) and Secret key (server).
3. Sign-in/up URLs: `/sign-in` and `/sign-up`.

## 4. Configure
```bash
cp server/.env.example server/.env   # fill in every value
cp client/.env.example client/.env   # VITE_CLERK_PUBLISHABLE_KEY
```
Set `ADMIN_EMAILS=you@example.com` — whoever signs up with that **verified** email becomes the admin.

## 5. Run
```bash
npm run install:all
npm run db:push        # creates the tables in Supabase
npm run dev:server     # http://localhost:4000
npm run dev:client     # http://localhost:5173  (proxies /api to :4000)
```

## 6. Try the full flow
1. **Admin** — sign up with the `ADMIN_EMAILS` address. You land on the Admin dashboard.
2. **Donor** — sign up (another browser/incognito) → "I want to donate blood" → fill the form. Eligibility is computed from age, weight, gap since last donation and health answers.
3. **Requester** — sign up → "I need blood for a patient" → search `/hospitals` by city; first search imports real facilities from OpenStreetMap.
4. **Hospital** — sign up → "I represent a hospital" → My Hospital → find your facility (or register a new one) → upload licence (PDF/JPG/PNG ≤ 5 MB) → submit.
5. **Admin** → Verifications → Review → open licence → Approve. The hospital gets a notification, shows as Verified in the directory and sees aggregate donor counts near it (never individual donors).

## 7. Phase 2 — requests, matching, handshake
**After upgrading from Phase 1 run `npm run db:push` again** (new tables: BloodRequest, DonorResponse, Donation, Subscriber).

Flow to try (use 3+ browsers/incognito windows):
1. Hospital rep gets verified by the admin (steps above).
2. **Requester** → Request blood → pick the verified hospital, blood group, units, urgency → *Alert donors now*. Compatible, eligible donors within 10/20/30 km (by urgency) are invited automatically.
3. **Donor** → Requests for You → *Accept* → a 6-digit code appears (the patient's contact number is revealed only now).
4. At the hospital desk, the **hospital** opens the request and enters the code. This records the donation, issues a certificate (`BB-YYYY-XXXX-XXXX`) and fulfils the request when units are met.
5. Anyone can verify a certificate at `/verify`.
Realtime notifications use Socket.io (same origin; Vite proxies `/socket.io`). Requesters can *Widen search* if nobody responds.

Public site: landing, About, Donate, Get Blood, For Hospitals, How it works, newsletter subscribe (`POST /api/public/subscribe`) and the verified-hospitals feed (`/api/public/network`). All forms open as pop-up modals and the whole UI is responsive down to phones.

Optional client env for the contact details shown in the site footer: `VITE_SUPPORT_PHONE`, `VITE_SUPPORT_EMAIL`, `VITE_SUPPORT_ADDRESS`.

## 8. Phase 3 — inventory, camps, analytics, AI
**Run `npm run db:push` again** (new tables: InventoryItem, InventoryLog, Camp, CampRegistration; new column Hospital.lowStockThreshold).

Gemini (optional): get a key at https://aistudio.google.com/apikey and set `GEMINI_API_KEY` in `server/.env` (`GEMINI_MODEL` defaults to `gemini-2.5-flash`). Without it every AI feature hides itself and the rest works.

Things to try:
1. **Hospital (verified)** → *Inventory* → Update stock (received/issued/expired). A group falling to the alert level notifies staff. Requesters see only In stock / Low / Out for their chosen group on the request form.
2. **Hospital** → *Camps* → Schedule a camp. Donors within 30 km are notified. After the camp starts, open *Registrations* and mark *Donated*: this issues a certificate, updates the donor and adds +1 unit to stock.
3. **Donor** → *Donation Camps* (also public at `/camps`) → Register. Eligibility is checked for the camp day, capacity is enforced.
4. **Hospital** → *Analytics*: requests per week, units by group, donations per month, fulfilment rate, time to fulfil, and a 7-day stock forecast. Forecast numbers are computed in code from your own data; Gemini only writes the summary sentence.
5. **Requester** → Request blood → *Describe the situation* → Suggest urgency. A keyword safety net can only raise urgency, never lower it. You confirm every field.
6. **Anyone** → the red *Ask us* button: a chatbot about donating and how BloodBridge works (rate limited, nothing stored, no medical advice).

## 9. Phase 4 — quick stock, billing, fraud, audit, role-aware assistant, deployment
Run `npm run db:push` in `server/` again (new tables and columns).
- **Inventory quick edit** (hospital, Inventory): one card per blood group with − / number / + and +5 / +10 chips. Change many groups, press **Save changes** once. Low groups show a **Call donors** button.
- **Call donors** (hospital, Donor Calls): a hospital raises a call for a walk-in patient or to restock its blood bank. Donors accept, get a 6 digit code, come to the desk, the hospital confirms the code, certificate is issued. The hospital menu no longer has Find Hospitals.
- **Billing** (hospital, Billing): Free vs Pro, monthly or yearly, Razorpay Checkout. Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (webhook `/api/billing/webhook`, event `payment.captured`). Without keys billing is off and everything is unlocked. Analytics, forecast and more than 2 active camps need Pro, and the pages show an upgrade prompt.
- **Admin**: Fraud Review (auto flags: duplicate patient, request volume, shared phone, licence reuse, wrong desk codes), Audit Log (filter, load more), Revenue.
- **Assistant**: knows whether you are a visitor, donor, requester, hospital or admin and which page you are on, answers navigation questions from a built-in site guide (`server/src/services/guide.ts`) and offers links. Works without a Gemini key; with a key the answer is written by Gemini from the same guide.
- Deploy: see **DEPLOYMENT.md** (Dockerfile, `render.yaml`, `client/vercel.json`, CI in `.github/workflows`).

## 10. Phase 5 — reminders, exports, installable app, hardening
Run `npm run db:push` again (one new notification type).
- **Background jobs** (`server/src/services/jobs.ts`, every 30 min, safe to run twice): "You can donate again" for donors whose waiting period just ended, a camp reminder the day before, a Pro-ends-in-3-days warning for hospitals, and auto-expiry of overdue requests and lapsed plans. Admins can run it by hand with `POST /api/admin/jobs/run`.
- **CSV export** (hospital, Inventory): Stock log and Donations, own hospital only, formula-injection safe, recorded in the audit log.
- **Installable app (PWA)**: manifest, icons and a service worker that keeps the shell available offline (never caches `/api`). Works after deploy on HTTPS; on a phone choose Add to Home Screen.
- **Friendly 404 page** and a **crash screen** (error boundary) instead of a blank page.
- **Access sweep tests**: every protected endpoint refuses anonymous callers and a donor is refused every hospital and admin tool.

## 11. Tests
Server tests run against a real local Postgres (they drop/recreate a schema):
```bash
createdb bloodbridge_test
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bloodbridge_test npm test
```
Run it from the project root (`npm test`) or from `server/` (`npx vitest run`) with Postgres running and Node 20+. The DB it points to is wiped, so never use your Supabase URL. If it says "no test files" you are in the wrong folder; if the DB is unreachable it prints the connection error.
170 tests: eligibility, OSM parsing, auth/roles, claim/verify lifecycle, privacy rules, matching, OTP handshake, certificates, expiry, subscribe, inventory, camps, analytics, forecast, AI and the role-aware guide (fake model), billing (fake Razorpay), fraud rules, background jobs, CSV exports and the access sweep.
If vitest prints `code.charCodeAt is not a function`, it is hiding the real error: almost always the test database is not reachable. Start Postgres, create `bloodbridge_test` and set `TEST_DATABASE_URL`.

## Notes
- No seed data. Every hospital comes from OpenStreetMap or from a hospital registering itself; self-registered ones stay hidden until an admin verifies them.
- OSM coverage varies by city; hospitals missing there can register through My Hospital.
- Razorpay runs in test mode until you complete KYC and switch keys.
