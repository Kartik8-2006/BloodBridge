import { FileText, Upload } from 'lucide-react';
import { useRef } from 'react';
import { Field } from '../ui/Form';

export function FileField({ label, file, onChange, error, hint }: { label: string; file: File | null; onChange: (f: File | null) => void; error?: string; hint?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <Field label={label} error={error} hint={hint ?? 'PDF, JPG or PNG, up to 5 MB'}>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-ink-300 bg-ink-50 px-4 py-4 text-left text-sm transition hover:border-brand-400 hover:bg-white"
      >
        {file ? <FileText className="size-5 text-brand-700" /> : <Upload className="size-5 text-ink-500" />}
        <span className={file ? 'truncate font-semibold text-ink-900' : 'text-ink-500'}>{file ? file.name : 'Choose a file'}</span>
      </button>
      <input ref={ref} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
    </Field>
  );
}
