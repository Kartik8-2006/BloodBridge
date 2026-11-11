import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { Logo } from './Misc';

export interface ModalAside {
  heading: string;
  text: string;
  points?: string[];
  image?: string;
}

/**
 * Pop-up with a story panel on the left and the form on the right, as a bottom-sheet-like
 * full-width card on phones. Uses a native <dialog> so focus trapping and Escape come for free.
 */
export function SplitModal({
  open = true,
  onClose,
  label,
  aside,
  children,
  wide,
}: {
  open?: boolean;
  onClose: () => void;
  label: string;
  aside: ModalAside;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`m-auto w-[calc(100%-1rem)] ${wide ? 'max-w-5xl' : 'max-w-4xl'} overflow-hidden rounded-[1.75rem] border-0 bg-white p-0 shadow-2xl backdrop:bg-ink-900/55 sm:w-[calc(100%-3rem)]`}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="fixed right-3 top-3 z-10 flex size-10 cursor-pointer items-center justify-center rounded-full bg-white/95 text-ink-800 shadow-lg ring-1 ring-ink-200 transition hover:bg-white sm:right-5 sm:top-5"
      >
        <X className="size-5" />
      </button>
      {open && (
        <div className="grid max-h-[92dvh] grid-rows-[minmax(0,1fr)] md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-wine-900 p-9 text-white md:flex md:flex-col md:justify-between">
            {aside.image && <><img src={aside.image} alt="" className="absolute inset-0 size-full object-cover" /><div className="absolute inset-0 bg-wine-900/85" /></>}
            <div className="relative z-10"><Logo light /></div>
            <div className="relative z-10 my-8">
              <p className="font-script text-3xl text-plasma-300">Every drop counts</p>
              <h2 className="mt-3 text-2xl font-extrabold leading-tight">{aside.heading}</h2>
              <p className="mt-3 text-sm leading-relaxed text-brand-100">{aside.text}</p>
              {aside.points && (
                <ul className="mt-5 space-y-2 text-sm text-white/90">
                  {aside.points.map((p) => (
                    <li key={p} className="flex gap-2.5"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-plasma-300" />{p}</li>
                  ))}
                </ul>
              )}
            </div>
            <p className="relative z-10 text-xs text-brand-200">Blood is never sold on BloodBridge. We only coordinate.</p>
            <svg viewBox="0 0 200 260" className="pointer-events-none absolute -bottom-16 -right-16 size-80 text-white/10" fill="currentColor" aria-hidden>
              <path d="M100 8C70 56 20 96 20 160a80 80 0 0 0 160 0C180 96 130 56 100 8z" />
            </svg>
          </aside>
          <div className="min-h-0 min-w-0 overflow-y-auto overscroll-contain">
            <div className="flex items-center gap-3 bg-gradient-to-r from-brand-700 to-wine-900 px-5 py-4 text-white md:hidden">
              <Logo light className="[&>span:last-child]:text-base" />
            </div>
            <div className="p-5 sm:p-8">{children}</div>
          </div>
        </div>
      )}
    </dialog>
  );
}
