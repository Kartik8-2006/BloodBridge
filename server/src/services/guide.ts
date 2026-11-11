/**
 * The assistant's map of the website. Every answer about "where do I click" comes from here, never from the model's imagination,
 * so when a page moves this file is the only place to update. It also powers the keyword fallback when no Gemini key is set.
 */
export type Audience = 'PUBLIC' | 'DONOR' | 'REQUESTER' | 'HOSPITAL' | 'ADMIN';
export const AUDIENCES: Audience[] = ['PUBLIC', 'DONOR', 'REQUESTER', 'HOSPITAL', 'ADMIN'];

export interface GuideLink { label: string; to: string }
export interface GuideTopic {
  id: string;
  /** Who can see and use this. Omitted means everyone. */
  roles?: Audience[];
  title: string;
  /** Lower-case words and phrases a person might use, including common Hinglish. */
  keywords: string[];
  answer: string;
  links?: GuideLink[];
}

const ALL_SIGNED_IN: Audience[] = ['DONOR', 'REQUESTER', 'HOSPITAL', 'ADMIN'];

export const TOPICS: GuideTopic[] = [
  /* ---------------------------------------------------------------- everyone */
  {
    id: 'what-is',
    title: 'What BloodBridge is',
    keywords: ['what is', 'bloodbridge', 'about', 'kya hai', 'platform', 'how does it work', 'how it works'],
    answer: 'BloodBridge connects people who need blood with eligible donors nearby, through verified hospitals only. Families post a request to a verified hospital, matching donors are alerted, a donor accepts and gets a 6 digit code, shows it at the hospital desk, and the hospital confirms the donation and issues a certificate. Blood is never bought or sold.',
    links: [{ label: 'How it works', to: '/how-it-works' }],
  },
  {
    id: 'signup',
    roles: ['PUBLIC'],
    title: 'Create an account',
    keywords: ['sign up', 'signup', 'register', 'create account', 'join', 'login', 'log in', 'sign in', 'account banana'],
    answer: 'Tap Sign up, create your account with email, then choose who you are: Donor, Requester (a family member or patient), or Hospital / blood bank. Each role gets its own dashboard. Admin accounts are not self-service.',
    links: [{ label: 'Sign up', to: '/sign-up' }, { label: 'Sign in', to: '/sign-in' }],
  },
  {
    id: 'compat',
    title: 'Blood group compatibility',
    keywords: ['compatible', 'compatibility', 'blood group', 'universal', 'o negative', 'which group', 'can give', 'can receive', 'match'],
    answer: 'O− red cells can go to anyone and AB+ patients can receive from anyone. In general: O+ gives to O+, A+, B+, AB+; A+ gives to A+ and AB+; B+ gives to B+ and AB+; AB+ gives only to AB+; negative groups can give to both negative and positive of the matching type. The hospital lab always confirms the match before transfusion.',
    links: [{ label: 'Compatibility chart', to: '/get-blood#compatibility' }],
  },
  {
    id: 'eligibility',
    title: 'Who can donate',
    keywords: ['eligible', 'eligibility', 'who can donate', 'can i donate', 'age', 'weight', 'gap', 'months', 'again', 'kitne din', 'donate kar sakta'],
    answer: 'General rules: age 18 to 65, weight at least 45 kg, and a gap of 3 months between donations for men and 4 months for women. BloodBridge checks these from your profile and shows when you are next eligible. The hospital does the final screening on the day, so follow their decision.',
    links: [{ label: 'Donate blood', to: '/donate' }],
  },
  {
    id: 'verify-cert',
    title: 'Verify a certificate',
    keywords: ['verify certificate', 'certificate number', 'check certificate', 'genuine', 'fake certificate', 'authentic'],
    answer: 'Anyone can check a donation certificate without signing in. Open Verify certificate and type the certificate number, for example BB-2026-XXXX. You will see the donor’s initials, blood group, hospital and date, never contact details.',
    links: [{ label: 'Verify a certificate', to: '/verify' }],
  },
  {
    id: 'emergency',
    title: 'Emergency',
    keywords: ['emergency', 'urgent', 'accident', 'dying', 'critical', 'immediately', 'ambulance', '112'],
    answer: 'If someone is in danger right now, call 112 or go to the nearest hospital first. BloodBridge is for finding donors alongside that, not instead of it.',
  },
  {
    id: 'no-selling',
    title: 'Buying or selling blood',
    keywords: ['buy blood', 'sell blood', 'price', 'paid donor', 'money for blood', 'cost of blood', 'charge'],
    answer: 'Blood is never sold on BloodBridge and donors are never paid. Donation is voluntary. Hospitals may charge their own processing fees outside this platform.',
  },
  {
    id: 'privacy',
    title: 'Privacy',
    keywords: ['privacy', 'safe', 'data', 'phone number', 'who can see', 'personal', 'secure'],
    answer: 'Donors see only the patient’s first name and the hospital. A requester’s phone is shared only with donors who accept. Health answers and hospital licences are visible only to the hospital desk or the review team. Public pages show donors as initials only.',
    links: [{ label: 'Safety and trust', to: '/about#safety' }],
  },
  {
    id: 'directory',
    roles: ['PUBLIC', 'DONOR', 'REQUESTER', 'ADMIN'],
    title: 'Find hospitals and blood banks',
    keywords: ['find hospital', 'nearby hospital', 'hospital near', 'blood bank', 'directory', 'search hospital', 'nearest', 'hospital list'],
    answer: 'Open Find Hospitals, search a city or use your current location. Facilities come from OpenStreetMap and the ones our team has verified are shown first, with a Verified badge and a live stock indicator. Only verified hospitals can receive blood requests.',
    links: [{ label: 'Find hospitals', to: '/hospitals' }],
  },
  {
    id: 'camps',
    roles: ['PUBLIC', 'DONOR', 'REQUESTER', 'ADMIN'],
    title: 'Donation camps',
    keywords: ['camp', 'camps', 'blood drive', 'donation drive', 'event'],
    answer: 'Hospitals host donation camps. Browse upcoming camps near you, and if you are a donor you can register for a slot (you must be eligible on the camp date).',
    links: [{ label: 'Donation camps', to: '/camps' }],
  },
  {
    id: 'notifications',
    roles: ALL_SIGNED_IN,
    title: 'Notifications',
    keywords: ['notification', 'notifications', 'alerts', 'bell', 'alert aaya'],
    answer: 'The bell at the top shows unread alerts and updates live. Open Notifications to read them all, mark them read, or jump to the request they refer to. Email preferences are in Settings.',
    links: [{ label: 'Notifications', to: '/app/notifications' }, { label: 'Settings', to: '/app/settings' }],
  },
  {
    id: 'profile',
    roles: ALL_SIGNED_IN,
    title: 'Profile and settings',
    keywords: ['profile', 'edit profile', 'change name', 'change phone', 'change email', 'password', 'settings', 'update details'],
    answer: 'Open Profile to edit your name and phone. Settings holds email preferences and sign-in security, including changing your password or email.',
    links: [{ label: 'Profile', to: '/app/profile' }, { label: 'Settings', to: '/app/settings' }],
  },
  {
    id: 'hospital-join',
    roles: ['PUBLIC', 'DONOR', 'REQUESTER'],
    title: 'Hospitals joining the network',
    keywords: ['hospital join', 'register hospital', 'list my hospital', 'blood bank join', 'for hospitals', 'doctor account'],
    answer: 'Hospitals and blood banks sign up, choose the Hospital role, then claim their facility from the directory or register it if it is not listed. They upload a licence, our team reviews it, and only then the hospital appears as Verified and can receive requests.',
    links: [{ label: 'For hospitals', to: '/for-hospitals' }],
  },

  {
    id: 'install-app',
    title: 'Install BloodBridge on your phone',
    keywords: ['install', 'app', 'download app', 'add to home screen', 'home screen', 'android', 'iphone', 'pwa', 'mobile app'],
    answer: 'BloodBridge installs like an app, no store needed. On Android Chrome open the menu and tap Install app (or Add to Home screen). On iPhone open the site in Safari, tap Share, then Add to Home Screen. It opens full screen and keeps the basic screens available if your network drops, but live data needs internet.',
  },

  /* ------------------------------------------------------------------- donor */
  {
    id: 'donor-start',
    roles: ['DONOR'],
    title: 'How to donate through BloodBridge',
    keywords: ['how to donate', 'start donating', 'donate', 'donor', 'help someone', 'donate kaise'],
    answer: 'Keep your health profile current and your availability switched on. When a matching request appears, open Requests for You, accept it, and you get a 6 digit code valid for 12 hours. Go to the hospital, show the code at the donation desk, and after screening and collection the hospital confirms it. Your certificate appears under Certificates.',
    links: [{ label: 'Requests for You', to: '/app/inbox' }],
  },
  {
    id: 'donor-inbox',
    roles: ['DONOR'],
    title: 'Accept or decline a request',
    keywords: ['accept', 'decline', 'request for me', 'requests for you', 'inbox', 'respond', 'not now', 'see requests'],
    answer: 'Open Requests for You. Each card shows the patient’s first name, blood group, units, urgency, hospital and distance. Tap Accept to commit (you then see the hospital details and your code) or Not now to skip. Critical requests are listed first.',
    links: [{ label: 'Requests for You', to: '/app/inbox' }],
  },
  {
    id: 'donor-code',
    roles: ['DONOR'],
    title: 'The 6 digit donation code',
    keywords: ['code', 'otp', '6 digit', 'six digit', 'handshake', 'desk', 'show code', 'code expired', 'lost code', 'verification code'],
    answer: 'After you accept, your code appears on the request card in Requests for You. It is valid for 12 hours and is only for you. Show or read it out at the hospital donation desk, after the doctor has screened you. The desk enters it to confirm your donation. Do not share it by phone with anyone before you reach the hospital. If you lose it or it expired, tap Get a new code on the request card while the request is still open.',
    links: [{ label: 'Requests for You', to: '/app/inbox' }],
  },
  {
    id: 'donor-certificates',
    roles: ['DONOR'],
    title: 'Donation certificates',
    keywords: ['certificate', 'certificates', 'download certificate', 'print', 'share certificate', 'proof of donation'],
    answer: 'Every confirmed donation creates a certificate under Certificates. Open one to print or save it. Its number can be checked by anyone on the public Verify page.',
    links: [{ label: 'My certificates', to: '/app/certificates' }, { label: 'Verify page', to: '/verify' }],
  },
  {
    id: 'donor-availability',
    roles: ['DONOR'],
    title: 'Pause or resume alerts',
    keywords: ['available', 'availability', 'pause', 'busy', 'not available', 'stop alerts', 'turn off', 'travelling', 'resume'],
    answer: 'On your Dashboard, use the Available to donate switch. When it is off nobody is alerted and you will not get requests. Switch it back on any time.',
    links: [{ label: 'Dashboard', to: '/app/dashboard' }],
  },
  {
    id: 'donor-no-alerts',
    roles: ['DONOR'],
    title: 'Why am I not getting requests',
    keywords: ['no requests', 'not getting', 'no alert', 'nothing', 'empty', 'why no request', 'koi request nahi'],
    answer: 'Alerts go only to donors who are available, eligible today (age, weight and the gap since your last donation), whose blood group is compatible, and who live within the search radius of the hospital. Check that availability is on, your location and last donation date are right in Profile, and that you are eligible. There may simply be no open request near you right now.',
    links: [{ label: 'Profile', to: '/app/profile' }],
  },
  {
    id: 'donor-health',
    roles: ['DONOR'],
    title: 'Update health profile or last donation date',
    keywords: ['health profile', 'last donation', 'update weight', 'blood group change', 'donor profile', 'medical', 'edit donor', 'date of birth'],
    answer: 'Open Profile and use Edit donor health profile. Update your weight, last donation date, location and screening answers. Eligibility is recalculated as soon as you save.',
    links: [{ label: 'Profile', to: '/app/profile' }],
  },
  {
    id: 'donor-reminders',
    roles: ['DONOR'],
    title: 'Reminders',
    keywords: ['reminder', 'reminders', 'remind me', 'donate again', 'next donation', 'when can i donate', 'camp reminder', 'yaad'],
    answer: 'You get an in-app reminder when your waiting period ends (if you are available and healthy), and one the day before any camp you registered for. They appear in the bell and in Notifications. Switch Available off on the Dashboard if you do not want to be reminded or matched.',
    links: [{ label: 'Notifications', to: '/app/notifications' }],
  },
  {
    id: 'donor-camp-register',
    roles: ['DONOR'],
    title: 'Register for a camp',
    keywords: ['register camp', 'join camp', 'camp slot', 'camp booking', 'cancel camp'],
    answer: 'Open Donation Camps, pick a camp and register. Registration closes when the camp is full, and you must be eligible on the camp date. You can cancel your registration from the same page.',
    links: [{ label: 'Donation camps', to: '/app/camps' }],
  },

  /* --------------------------------------------------------------- requester */
  {
    id: 'req-create',
    roles: ['REQUESTER'],
    title: 'How to request blood',
    keywords: ['request blood', 'need blood', 'raise request', 'make request', 'new request', 'create request', 'blood chahiye', 'how to request', 'post request'],
    answer: 'Tap Request Blood. Step 1: choose the verified hospital where the patient is. Step 2: enter patient name, blood group, units and urgency, plus a contact phone. Submit, and compatible eligible donors near that hospital are alerted at once. Critical alerts reach 30 km, urgent 20 km, planned 10 km. If you have not saved your location yet, Profile asks for it first.',
    links: [{ label: 'Request blood', to: '/app/requests/new' }],
  },
  {
    id: 'req-hospital-choice',
    roles: ['REQUESTER'],
    title: 'Choosing the hospital',
    keywords: ['which hospital', 'no hospital', 'hospital not listed', 'hospital missing', 'not verified', 'select hospital', 'only verified'],
    answer: 'Requests can go only to verified hospitals, so donors always arrive somewhere that can receive them. The list shows verified hospitals within 50 km of your saved location. You can also start from a hospital’s page with Request blood. If your hospital is missing, ask them to join BloodBridge.',
    links: [{ label: 'Find hospitals', to: '/app/hospitals' }],
  },
  {
    id: 'req-track',
    roles: ['REQUESTER'],
    title: 'Track my request',
    keywords: ['track', 'status', 'my requests', 'who is coming', 'donors coming', 'on the way', 'progress', 'matched'],
    answer: 'Open My Requests, then the request. You see how many donors were alerted, accepted or declined, who is on the way, and how many units are fulfilled. Updates also arrive as notifications.',
    links: [{ label: 'My requests', to: '/app/requests' }],
  },
  {
    id: 'req-widen',
    roles: ['REQUESTER'],
    title: 'Not enough donors',
    keywords: ['widen', 'more donors', 'nobody', 'no one responding', 'not enough', 'expand', 'increase radius', 'no response'],
    answer: 'Open the request and tap Widen search. It increases the search area by 50% (up to 60 km) and alerts the extra eligible donors. You can also call the hospital directly, and for a very urgent case ask the hospital about its own stock.',
    links: [{ label: 'My requests', to: '/app/requests' }],
  },
  {
    id: 'req-cancel',
    roles: ['REQUESTER'],
    title: 'Cancel a request',
    keywords: ['cancel', 'close request', 'no longer needed', 'stop request', 'delete request'],
    answer: 'Open the request and tap Cancel request. Donors who had accepted are told it is cancelled. Do this as soon as the blood is arranged so donors are not kept waiting. You can have up to 3 open requests at a time.',
    links: [{ label: 'My requests', to: '/app/requests' }],
  },
  {
    id: 'req-triage',
    roles: ['REQUESTER'],
    title: 'AI help filling the form',
    keywords: ['describe', 'suggest urgency', 'ai help', 'triage', 'auto fill', 'autofill'],
    answer: 'If AI is switched on, the request form has a box to describe the situation in your own words. Tap Suggest urgency and details and it proposes urgency, blood group and units. It is only a suggestion; you confirm every field before sending.',
    links: [{ label: 'Request blood', to: '/app/requests/new' }],
  },
  {
    id: 'req-stock',
    roles: ['REQUESTER', 'PUBLIC'],
    title: 'Does the hospital have blood in stock',
    keywords: ['stock', 'available at hospital', 'in stock', 'low stock', 'blood available', 'inventory'],
    answer: 'Verified hospitals that keep their inventory updated show a stock badge (In stock, Low, Out) for each blood group on their page and in the request form. Exact unit counts are private to the hospital, so call them to confirm.',
    links: [{ label: 'Find hospitals', to: '/hospitals' }],
  },

  /* ---------------------------------------------------------------- hospital */
  {
    id: 'hosp-join',
    roles: ['HOSPITAL'],
    title: 'Get my hospital verified',
    keywords: ['verify hospital', 'verification', 'claim', 'claim hospital', 'licence', 'license', 'pending', 'rejected', 'resubmit', 'register hospital', 'get verified'],
    answer: 'Open My Hospital. Search for your facility and Claim it, or choose It is not listed and register it. Upload your licence (PDF, JPG or PNG up to 5 MB). Our team reviews it. Until you are Verified you cannot receive requests or call donors. If it is rejected, read the reason and resubmit.',
    links: [{ label: 'My Hospital', to: '/app/my-hospital' }],
  },
  {
    id: 'hosp-requests',
    roles: ['HOSPITAL'],
    title: 'Requests from families',
    keywords: ['incoming request', 'blood requests', 'requests', 'family request', 'patient request', 'donor calls', 'see requests'],
    answer: 'Open Donor Calls. It lists requests families sent to your hospital and the calls you raised yourself. Open one to see the patient, units and every donor who accepted. You are notified when a new request arrives.',
    links: [{ label: 'Donor Calls', to: '/app/requests' }],
  },
  {
    id: 'hosp-call-donors',
    roles: ['HOSPITAL'],
    title: 'Call donors to your hospital',
    keywords: ['call donors', 'invite donors', 'ask donors', 'need donors', 'donor bulao', 'new request', 'send request to donor', 'walk-in', 'walk in', 'restock', 'collect blood', 'blood collection', 'bulana'],
    answer: 'This is how you invite donors to come to you. Open Donor Calls and tap Call donors (or the Call donors button on a low blood group in Inventory). Choose A patient at the hospital (a walk-in or admitted patient) or Restock our blood bank, then pick the blood group, units and urgency. Compatible eligible donors nearby are alerted. Each donor who accepts gets a 6 digit code, comes to your desk, you screen them, collect the blood, enter their code to confirm, and a certificate is issued. Then add the units in Inventory.',
    links: [{ label: 'Call donors', to: '/app/requests/new' }, { label: 'Inventory', to: '/app/inventory' }],
  },
  {
    id: 'hosp-verify-donor',
    roles: ['HOSPITAL'],
    title: 'Verify a donor at the desk',
    keywords: ['verify donor', 'enter code', 'otp', '6 digit', 'confirm donation', 'handshake', 'desk code', 'wrong code', 'locked', 'code not working', 'donor arrived'],
    answer: 'Open the request, scroll to the desk verification panel, enter the 6 digit code the donor shows (after your own screening and collection) and press Confirm donation. A correct code records the donation, issues the certificate and updates the request. Five wrong codes in a row lock entry for that request for 15 minutes and alert the review team, so check the code with the donor first. Each code works once.',
    links: [{ label: 'Donor Calls', to: '/app/requests' }],
  },
  {
    id: 'hosp-inventory',
    roles: ['HOSPITAL'],
    title: 'Update blood stock quickly',
    keywords: ['inventory', 'stock', 'update stock', 'add units', 'units', 'blood stock', 'low stock', 'threshold', 'issued', 'expired', 'discard'],
    answer: 'Open Inventory. Every blood group is a card: tap + or − , use the +5 / +10 chips, or type the exact number. Change as many groups as you like, then press Save changes once in the bar at the bottom. For removals choose Issued or Expired, and add an optional note. Low-stock alert level sets when a group shows as Low and your team is warned.',
    links: [{ label: 'Inventory', to: '/app/inventory' }],
  },
  {
    id: 'hosp-export',
    roles: ['HOSPITAL'],
    title: 'Export data to Excel (CSV)',
    keywords: ['export', 'csv', 'download', 'excel', 'spreadsheet', 'report download', 'stock log', 'donation list', 'backup'],
    answer: 'Open Inventory and use the Stock log CSV and Donations CSV buttons at the top. Files open in Excel or Google Sheets and contain only your own hospital’s records: stock changes with reason and note, and confirmed donations with certificate number, donor name, blood group and units. Each download is recorded in the audit log.',
    links: [{ label: 'Inventory', to: '/app/inventory' }],
  },
  {
    id: 'hosp-camps',
    roles: ['HOSPITAL'],
    title: 'Organise a donation camp',
    keywords: ['camp', 'create camp', 'organise camp', 'blood drive', 'schedule camp', 'registrations', 'cancel camp', 'capacity'],
    answer: 'Open Camps and create one with title, venue, date, time and capacity. Donors nearby are told, and registrations show on the camp. Free plan: up to 2 active camps; Pro: unlimited.',
    links: [{ label: 'Camps', to: '/app/camps/manage' }],
  },
  {
    id: 'hosp-analytics',
    roles: ['HOSPITAL'],
    title: 'Analytics and stock forecast',
    keywords: ['analytics', 'forecast', 'report', 'charts', 'demand', 'trend', 'prediction', 'insights'],
    answer: 'Analytics (Pro plan) shows requests, donations and fulfilment over time, plus a 7 day stock forecast per blood group. The numbers are computed from your own data; the AI only writes the short explanation.',
    links: [{ label: 'Analytics', to: '/app/analytics' }],
  },
  {
    id: 'hosp-billing',
    roles: ['HOSPITAL'],
    title: 'Pro plan and payments',
    keywords: ['pro', 'upgrade', 'plan', 'billing', 'subscription', 'payment', 'razorpay', 'price', 'invoice', 'free plan', 'renew', 'plan_required'],
    answer: 'Free includes your verified listing, requests, inventory and up to 2 active camps. Pro adds analytics, the stock forecast, the AI summary and unlimited camps. Open Billing to choose monthly or yearly and pay securely with Razorpay (UPI, cards, netbanking). Your payment history is on the same page. If payments are not set up on this deployment, everything is unlocked.',
    links: [{ label: 'Billing', to: '/app/billing' }],
  },
  {
    id: 'hosp-why-directory',
    roles: ['HOSPITAL'],
    title: 'Where is the hospital directory',
    keywords: ['find hospital', 'directory', 'other hospitals', 'search hospital'],
    answer: 'Hospital accounts do not need the directory in their menu because their job is to receive requests and call donors. Your own public page is visible to everyone in the directory once you are verified.',
    links: [{ label: 'Public directory', to: '/hospitals' }],
  },
  {
    id: 'hosp-no-requests',
    roles: ['HOSPITAL'],
    title: 'Why am I not receiving requests',
    keywords: ['not receiving', 'no requests', 'nobody requesting', 'not visible', 'not showing', 'not appearing'],
    answer: 'Requests reach only Verified hospitals. Check My Hospital: if the status is Pending or Rejected, finish verification first. Once Verified, families nearby can choose you when requesting blood, and you can call donors yourself from Donor Calls.',
    links: [{ label: 'My Hospital', to: '/app/my-hospital' }],
  },

  /* ------------------------------------------------------------------- admin */
  {
    id: 'admin-verify',
    roles: ['ADMIN'],
    title: 'Review hospital verifications',
    keywords: ['verify', 'verification', 'approve hospital', 'reject hospital', 'pending hospitals', 'licence', 'license', 'review hospital'],
    answer: 'Open Verifications. Pick a hospital, check the uploaded licence against the details, then Approve or Reject with a reason. Approved hospitals become Verified and can receive requests. Always check the licence for a clash with another facility; the Fraud review page flags reused licences.',
    links: [{ label: 'Verifications', to: '/app/verifications' }],
  },
  {
    id: 'admin-users',
    roles: ['ADMIN'],
    title: 'Manage users',
    keywords: ['users', 'suspend', 'ban', 'user list', 'block user', 'reactivate', 'search user', 'role'],
    answer: 'Open Users to search by name, email or role, and suspend or reactivate an account. You cannot suspend yourself or another admin.',
    links: [{ label: 'Users', to: '/app/users' }],
  },
  {
    id: 'admin-requests',
    roles: ['ADMIN'],
    title: 'All blood requests',
    keywords: ['all requests', 'every request', 'monitor requests', 'request list', 'overview'],
    answer: 'All Requests shows the latest 50 requests across the network. Open one to see its status, hospital and progress. Admins can view but not change a request.',
    links: [{ label: 'All requests', to: '/app/requests' }],
  },
  {
    id: 'admin-fraud',
    roles: ['ADMIN'],
    title: 'Fraud review',
    keywords: ['fraud', 'suspicious', 'flag', 'flags', 'duplicate', 'fake', 'abuse', 'review flag', 'brute force', 'misuse'],
    answer: 'Open Fraud Review. The system raises flags automatically: the same patient requested at several hospitals within 24 hours, too many requests from one account, one phone number shared by several accounts, a licence reused by two hospitals, and repeated wrong desk codes. Open a flag, then Dismiss it or Confirm it with a note, and optionally suspend the user.',
    links: [{ label: 'Fraud review', to: '/app/fraud' }],
  },
  {
    id: 'admin-audit',
    roles: ['ADMIN'],
    title: 'Audit log',
    keywords: ['audit', 'log', 'history', 'who did', 'activity log', 'trail', 'actions'],
    answer: 'Audit Log lists sensitive actions with who did them and when: request creation, donation verification, inventory changes, verifications, suspensions and fraud reviews. Filter by action and use Load more for older entries.',
    links: [{ label: 'Audit log', to: '/app/audit' }],
  },
  {
    id: 'admin-revenue',
    roles: ['ADMIN'],
    title: 'Revenue and subscriptions',
    keywords: ['revenue', 'payments', 'subscriptions', 'earnings', 'income', 'razorpay', 'paid hospitals', 'billing'],
    answer: 'Revenue shows total collected, number of payments and active Pro subscriptions, with the most recent payments. Figures appear once Razorpay keys are configured.',
    links: [{ label: 'Revenue', to: '/app/revenue' }],
  },
  {
    id: 'admin-dashboard',
    roles: ['ADMIN'],
    title: 'Admin dashboard',
    keywords: ['dashboard', 'stats', 'numbers', 'overview', 'network'],
    answer: 'The Dashboard summarises users, verified hospitals, pending reviews, open fraud flags and OpenStreetMap coverage. Use its shortcuts to jump to the review queues.',
    links: [{ label: 'Dashboard', to: '/app/dashboard' }],
  },
];

/** Topics this audience may be told about. */
export function topicsFor(audience: Audience): GuideTopic[] {
  return TOPICS.filter((t) => !t.roles || t.roles.includes(audience));
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** Keyword scoring: longer phrase hits count more, a title hit counts extra. Returns best matches first. */
export function matchTopics(audience: Audience, question: string, limit = 3): { topic: GuideTopic; score: number }[] {
  const q = ` ${norm(question)} `;
  if (q.trim().length < 2) return [];
  const scored = topicsFor(audience).map((topic) => {
    let score = 0;
    for (const k of topic.keywords) {
      const kk = norm(k);
      if (kk && q.includes(` ${kk} `)) score += 2 + kk.split(' ').length;
      else if (kk.length > 4 && q.includes(kk)) score += 1;
    }
    if (q.includes(` ${norm(topic.title)} `)) score += 3;
    return { topic, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}

const GREETING = /^(hi|hello|hey|hii+|namaste|help|menu)\b/i;

export const SUGGESTIONS: Record<Audience, string[]> = {
  PUBLIC: ['How does BloodBridge work?', 'Who can donate blood?', 'How do I request blood?', 'How can my hospital join?'],
  DONOR: ['How do I accept a request?', 'What is the 6 digit code?', 'Why am I not getting requests?', 'Where is my certificate?'],
  REQUESTER: ['How do I request blood?', 'How do I track my request?', 'Not enough donors, what now?', 'Does the hospital have stock?'],
  HOSPITAL: ['How do I call donors to my hospital?', 'How do I verify a donor at the desk?', 'How do I update stock fast?', 'What does the Pro plan include?'],
  ADMIN: ['How do I review a hospital?', 'What does Fraud Review show?', 'Where is the audit log?', 'How do I suspend a user?'],
};

export const PERSONA: Record<Audience, string> = {
  PUBLIC: 'The person is not signed in. Explain what the platform does, answer donation and compatibility questions, and show how to sign up and which role to pick.',
  DONOR: 'The person is a DONOR. Speak to them as someone who wants to help: eligibility, accepting requests, the 6 digit code at the hospital desk, certificates, camps and availability.',
  REQUESTER: 'The person is a REQUESTER, usually a worried family member. Be calm and fast: how to request blood, tracking, widening the search, cancelling. Lead with the next action.',
  HOSPITAL: 'The person is HOSPITAL staff (a doctor or blood-bank desk). Speak practically: verification, donor calls, desk code verification, inventory, camps, analytics and billing. Hospital accounts cannot create requests for other hospitals and do not have the directory in their menu.',
  ADMIN: 'The person is a platform ADMIN. Speak concisely about verification, users, fraud review, audit log and revenue. Remind them that admins view requests but do not change them.',
};

/** The answer used when no model is available, or as a safe reply when the model fails. */
export function fallbackAnswer(audience: Audience, question: string): { reply: string; links: GuideLink[] } {
  const hits = matchTopics(audience, question, 2);
  if (hits.length === 0) {
    if (GREETING.test(question.trim())) {
      return { reply: 'Hi! I can show you where things are and how each step works. Try one of the questions below, or ask in your own words.', links: [] };
    }
    return {
      reply: 'I could not find that in the BloodBridge guide. Try asking how to do something, for example: how to request blood, how the donation code works, or where to update stock. For medical questions, please ask the hospital doctor.',
      links: [],
    };
  }
  const best = hits[0]!.topic;
  const second = hits[1] && hits[1].score >= hits[0]!.score - 1 ? hits[1].topic : null;
  const reply = second ? `${best.answer}\n\nAlso related: ${second.title}. ${second.answer}` : best.answer;
  return { reply, links: dedupe([...(best.links ?? []), ...(second?.links ?? [])]).slice(0, 3) };
}

export function linksFor(audience: Audience, question: string): GuideLink[] {
  const hits = matchTopics(audience, question, 2).filter((h) => h.score >= 3);
  return dedupe(hits.flatMap((h) => h.topic.links ?? [])).slice(0, 3);
}

function dedupe(links: GuideLink[]): GuideLink[] {
  const seen = new Set<string>();
  return links.filter((l) => (seen.has(l.to) ? false : (seen.add(l.to), true)));
}

/** Compact text of the guide that goes into the model's instructions. */
export function guideText(audience: Audience): string {
  return topicsFor(audience)
    .map((t) => `- ${t.title}: ${t.answer}${t.links?.length ? ` [${t.links.map((l) => `${l.label}: ${l.to}`).join('; ')}]` : ''}`)
    .join('\n');
}
