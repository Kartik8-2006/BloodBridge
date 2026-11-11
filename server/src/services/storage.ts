import { createClient } from '@supabase/supabase-js';
import type { Env } from '../config/env.js';

export interface DocumentStorage {
  upload(path: string, data: Buffer, contentType: string): Promise<void>;
  remove(path: string): Promise<void>;
  signedUrl(path: string, expiresInSeconds: number): Promise<string>;
}

export const MAX_DOC_BYTES = 5 * 1024 * 1024;
export const DOC_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

/** Checks the real file signature, because the browser-supplied MIME type can be anything. */
export function sniffDocument(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.subarray(0, 4).toString('latin1') === '%PDF') return { mime: 'application/pdf', ext: 'pdf' };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  return null;
}

/** Private Supabase Storage bucket. Documents are only ever read through short-lived signed URLs. */
export function createSupabaseStorage(env: Env): DocumentStorage {
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const bucket = env.SUPABASE_STORAGE_BUCKET;
  let ready: Promise<void> | null = null;

  const ensureBucket = () =>
    (ready ??= (async () => {
      const { data, error } = await client.storage.listBuckets();
      if (error) throw error;
      if (!data.some((b) => b.name === bucket)) {
        const created = await client.storage.createBucket(bucket, {
          public: false,
          fileSizeLimit: MAX_DOC_BYTES,
          allowedMimeTypes: DOC_MIME_TYPES,
        });
        if (created.error && !/already exists/i.test(created.error.message)) throw created.error;
      }
    })().catch((err) => {
      ready = null;
      throw err;
    }));

  return {
    async upload(path, data, contentType) {
      await ensureBucket();
      const { error } = await client.storage.from(bucket).upload(path, data, { contentType, upsert: false });
      if (error) throw error;
    },
    async remove(path) {
      await client.storage.from(bucket).remove([path]);
    },
    async signedUrl(path, expiresInSeconds) {
      const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
      if (error || !data) throw error ?? new Error('Could not sign document URL');
      return data.signedUrl;
    },
  };
}
