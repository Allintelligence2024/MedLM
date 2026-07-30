'use client';

// MediaUpload — upload vers R2 (S3-compatible) via presigned URL.
//
// Flow :
//   1. L'utilisateur choisit un fichier.
//   2. On demande au backend un `presignedUrl` (PUT).
//   3. On upload directement à R2 (le serveur ne voit pas le
//      contenu, juste les métadonnées).
//   4. Le backend retourne l'URL publique du média.
//   5. On l'ajoute à la carte (côté client, en attente de save).
//
// Conformité : on envoie au serveur uniquement le `key` et
// l'`alt_text` après upload. Le serveur n'a pas accès au binaire.

import { useState, useRef } from 'react';
import { Upload, X } from 'lucide-react';

export interface MediaItem {
  key: string;
  url: string;
  alt_text: string;
  type: 'image' | 'audio' | 'video';
}

interface Props {
  apiBaseUrl: string;
  authToken: string;
  onUploaded: (item: MediaItem) => void;
}

async function presign(apiBaseUrl: string, authToken: string, file: File) {
  const res = await fetch(`${apiBaseUrl}/v1/media/presign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      filename: file.name,
      content_type: file.type,
      size_bytes: file.size,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`presign ${res.status}: ${text}`);
  }
  return res.json() as Promise<{
    key: string;
    upload_url: string;
    public_url: string;
  }>;
}

async function uploadToR2(presigned: { upload_url: string }, file: File) {
  const res = await fetch(presigned.upload_url, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  });
  if (!res.ok) {
    throw new Error(`R2 upload failed: ${res.status}`);
  }
}

function detectType(mime: string): 'image' | 'audio' | 'video' | null {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return null;
}

export function MediaUpload({ apiBaseUrl, authToken, onUploaded }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    const type = detectType(file.type);
    if (!type) {
      setError(`Type non supporté : ${file.type}`);
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('Fichier trop volumineux (max 20 Mo)');
      return;
    }
    setBusy(true);
    try {
      const ps = await presign(apiBaseUrl, authToken, file);
      await uploadToR2(ps, file);
      onUploaded({
        key: ps.key,
        url: ps.public_url,
        alt_text: '',
        type,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*,audio/*,video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 text-white rounded text-sm hover:bg-emerald-700 disabled:opacity-50"
        >
          <Upload className="h-4 w-4" />
          {busy ? 'Envoi…' : 'Téléverser un média'}
        </button>
        {error && (
          <span className="text-sm text-red-600 flex items-center gap-1">
            {error}
            <button type="button" onClick={() => setError(null)}>
              <X className="h-3 w-3" />
            </button>
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500">
        Images, audio, vidéo. Max 20 Mo. Stocké sur R2 (S3-compatible).
      </p>
    </div>
  );
}
