import { SignIn, SignUp } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import { SplitModal } from '../components/ui/SplitModal';
import Landing from './Landing';

const appearance = {
  variables: { colorPrimary: '#cf2a2f', borderRadius: '0.9rem', fontFamily: 'Montserrat, ui-sans-serif, system-ui, sans-serif' },
  elements: {
    rootBox: 'w-full',
    cardBox: 'w-full shadow-none border-0',
    card: 'shadow-none border-0 p-0 w-full bg-transparent',
    footer: 'bg-transparent',
  },
};

/** Sign-in and sign-up are pop-ups over the home page, like every other form on the site. */
function AuthModal({ mode }: { mode: 'in' | 'up' }) {
  const navigate = useNavigate();
  const aside =
    mode === 'in'
      ? { heading: 'Welcome back', text: 'Pick up where you left off: your requests, alerts and certificates are waiting.', points: ['Real-time alerts', 'Verified hospitals only', 'Your data stays private'], image: '/images/hospital-hero.png' }
      : { heading: 'Join in two minutes', text: 'Donors, patients’ families and hospitals each get a dashboard built for their job.', points: ['Free for donors and families', 'Eligibility checked automatically', 'Certificates for every donation'] };
  return (
    <>
      <Landing />
      <SplitModal label={mode === 'in' ? 'Sign in' : 'Create your account'} onClose={() => navigate('/')} aside={{ ...aside, image: mode === 'in' ? '/images/hospital-hero.png' : '/images/donor-hero.png' }}>
        <div className="flex justify-center">
          {mode === 'in' ? (
            <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" fallbackRedirectUrl="/app/dashboard" appearance={appearance} />
          ) : (
            <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" fallbackRedirectUrl="/onboarding" appearance={appearance} />
          )}
        </div>
      </SplitModal>
    </>
  );
}

export const SignInPage = () => <AuthModal mode="in" />;
export const SignUpPage = () => <AuthModal mode="up" />;
