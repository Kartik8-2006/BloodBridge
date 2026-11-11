import { RedirectToSignIn, SignedIn, SignedOut } from '@clerk/clerk-react';
import { Navigate, Outlet, Route, Routes, useOutletContext } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ContentLayout, PublicLayout } from './components/layout/PublicLayout';
import { PublicHeader } from './components/site/PublicHeader';
import About from './pages/About';
import Donate from './pages/Donate';
import ForHospitals from './pages/ForHospitals';
import GetBlood from './pages/GetBlood';
import HowItWorks from './pages/HowItWorks';
import Resources from './pages/Resources';
import { Button } from './components/ui/Button';
import { ErrorNote, PageLoader } from './components/ui/Misc';
import { useMe } from './hooks/useMe';
import type { Me, Role } from './lib/types';
import AdminUsers from './pages/admin/Users';
import AuditLog from './pages/admin/AuditLog';
import Fraud from './pages/admin/Fraud';
import Revenue from './pages/admin/Revenue';
import NotFound from './pages/NotFound';
import Billing from './pages/hospital/Billing';
import AdminVerifications from './pages/admin/Verifications';
import { SignInPage, SignUpPage } from './pages/Auth';
import Dashboard from './pages/Dashboard';
import HospitalDetail from './pages/HospitalDetail';
import Hospitals from './pages/Hospitals';
import Landing from './pages/Landing';
import MyHospital from './pages/hospital/MyHospital';
import Camps from './pages/camps/Camps';
import Inventory from './pages/hospital/Inventory';
import ManageCamps from './pages/hospital/ManageCamps';
import Analytics from './pages/hospital/Analytics';
import Notifications from './pages/Notifications';
import { CertificateView, Certificates } from './pages/donor/Certificates';
import DonorInbox from './pages/donor/Inbox';
import NewRequest from './pages/requests/NewRequest';
import RequestDetail from './pages/requests/RequestDetail';
import Requests from './pages/requests/Requests';
import Verify from './pages/Verify';
import Onboarding from './pages/onboarding/Onboarding';
import Profile from './pages/Profile';
import Settings from './pages/Settings';

export const useMeContext = () => useOutletContext<Me>();

function RequireSignedIn() {
  return (
    <>
      <SignedIn>
        <Outlet />
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}

/** Everything under /app needs a finished onboarding (role chosen). */
function AppGate() {
  const { data: me, isLoading, error, refetch } = useMe();
  if (isLoading) return <PageLoader />;
  if (error || !me) {
    return (
      <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-4 px-6">
        <ErrorNote>{error instanceof Error ? error.message : 'We could not load your account.'}</ErrorNote>
        <Button onClick={() => refetch()}>Try again</Button>
      </div>
    );
  }
  if (!me.user.onboarded) return <Navigate to="/onboarding" replace />;
  return <AppShell />;
}

function RoleRoute({ roles }: { roles: Role[] }) {
  const me = useMeContext();
  if (!me.user.role || !roles.includes(me.user.role)) return <Navigate to="/app/dashboard" replace />;
  return <Outlet context={me} />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/sign-in/*" element={<SignInPage />} />
        <Route path="/sign-up/*" element={<SignUpPage />} />
        <Route path="/about" element={<About />} />
        <Route path="/donate" element={<Donate />} />
        <Route path="/get-blood" element={<GetBlood />} />
        <Route path="/request-blood" element={<Navigate to="/get-blood" replace />} />
        <Route path="/for-hospitals" element={<ForHospitals />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/resources" element={<Resources />} />
        <Route element={<ContentLayout />}>
          <Route path="/hospitals" element={<Hospitals />} />
          <Route path="/hospitals/:id" element={<HospitalDetail />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/verify/:no" element={<Verify />} />
          <Route path="/camps" element={<Camps />} />
        </Route>
      </Route>

      <Route element={<RequireSignedIn />}>
        <Route path="/onboarding" element={<><PublicHeader /><Landing /><Onboarding /></>} />
        <Route path="/app" element={<AppGate />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="hospitals" element={<Hospitals />} />
          <Route path="hospitals/:id" element={<HospitalDetail />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="profile" element={<Profile />} />
          <Route path="settings" element={<Settings />} />
          <Route path="requests/:id" element={<RequestDetail />} />
          <Route element={<RoleRoute roles={['DONOR']} />}>
            <Route path="inbox" element={<DonorInbox />} />
            <Route path="certificates" element={<Certificates />} />
            <Route path="certificates/:id" element={<CertificateView />} />
            <Route path="camps" element={<Camps />} />
          </Route>
          <Route element={<RoleRoute roles={['REQUESTER', 'HOSPITAL', 'ADMIN']} />}>
            <Route path="requests" element={<Requests />} />
          </Route>
          <Route element={<RoleRoute roles={['REQUESTER', 'HOSPITAL']} />}>
            <Route path="requests/new" element={<><Requests /><NewRequest /></>} />
          </Route>
          <Route element={<RoleRoute roles={['HOSPITAL']} />}>
            <Route path="my-hospital" element={<MyHospital />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="camps/manage" element={<ManageCamps />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="billing" element={<Billing />} />
          </Route>
          <Route element={<RoleRoute roles={['ADMIN']} />}>
            <Route path="verifications" element={<AdminVerifications />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="fraud" element={<Fraud />} />
            <Route path="audit" element={<AuditLog />} />
            <Route path="revenue" element={<Revenue />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
