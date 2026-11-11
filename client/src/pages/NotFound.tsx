import { Droplet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <span className="flex size-16 items-center justify-center rounded-3xl bg-brand-50 text-brand-600"><Droplet className="size-8" /></span>
      <p className="mt-6 font-script text-3xl text-brand-700">Lost your way?</p>
      <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-ink-900">Page not found</h1>
      <p className="mt-3 max-w-md text-ink-600">The page you opened does not exist or has moved. Let us take you somewhere useful.</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link to="/"><Button>Go to home</Button></Link>
        <Link to="/app/dashboard"><Button variant="outline">Open dashboard</Button></Link>
      </div>
    </div>
  );
}
