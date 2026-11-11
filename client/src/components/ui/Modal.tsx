import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

/** Native <dialog>: focus trap, Escape to close and backdrop come from the browser. */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`m-auto w-[calc(100%-2rem)] ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-[1.75rem] border border-ink-100 bg-white p-0 shadow-2xl backdrop:bg-ink-900/40`}
    >
      {open && (
        <div className="max-h-[85dvh] overflow-y-auto overscroll-contain p-6 sm:p-8">
          <div className="mb-5 flex items-start justify-between gap-4">
            <h2 className="text-xl font-extrabold text-ink-900">{title}</h2>
            <button onClick={onClose} className="-m-2 cursor-pointer rounded-xl p-2 text-ink-500 hover:bg-ink-100" aria-label="Close">
              <X className="size-5" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
