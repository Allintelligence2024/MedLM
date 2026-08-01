'use client';

// Page d'édition d'une carte (Phase 11 bis).
//
// Combine :
//   * BilingualEditor (TipTap) pour front/back FR/EN
//   * MediaUpload pour les médias
//   * Checklist qualité (affichée en temps réel)
//   * Workflow board latéral pour changer le statut
//
// Sauvegarde via PATCH /v1/content/cards/:id.

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { BilingualEditor, type BilingualValue } from '@/components/editor/bilingual_editor';
import { MediaUpload, type MediaItem } from '@/components/upload/media_upload';
import { evaluateChecklist, isReadyForApproval, failingFields } from '@/lib/checklist';
import type { CardDetail } from '@/lib/types';
import { Save, CheckCircle2, AlertCircle } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

export default function CardEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [card, setCard] = useState<CardDetail | null>(null);
  const [front, setFront] = useState<BilingualValue>({ fr: '', en: '' });
  const [back, setBack] = useState<BilingualValue>({ fr: '', en: '' });
  const [explanation, setExplanation] = useState<BilingualValue>({ fr: '', en: '' });
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [sourceType, setSourceType] = useState<'original' | 'inspired' | 'partnership'>('original');
  const [faculty, setFaculty] = useState('');
  const [year, setYear] = useState<number | ''>('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API}/v1/content/cards/${params.id}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('cms_token') ?? ''}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: CardDetail = await res.json();
        setCard(data);
        setFront({ fr: data.content.front_fr ?? '', en: data.content.front_en ?? '' });
        setBack({ fr: data.content.back_fr ?? '', en: data.content.back_en ?? '' });
        setExplanation({
          fr: data.content.explanation_fr ?? '',
          en: data.content.explanation_en ?? '',
        });
        // Le média persisté (CardDetail) n'a pas de `key` — celui-ci
        // n'existe que pour les uploads frais (MediaUpload). On dérive
        // une clé stable depuis l'URL pour satisfaire MediaItem.
        setMedia((data.content.media ?? []).map((m) => ({ ...m, key: m.url })));
        setSourceType(data.source.type);
        setFaculty(data.source.faculty ?? '');
        setYear(data.source.year ?? '');
        setTags(data.tags.join(', '));
      } catch (e) {
        setError((e as Error).message);
      }
    }
    if (params.id) load();
  }, [params.id]);

  const checklist = evaluateChecklist({
    content: {
      front_fr: front.fr,
      back_fr: back.fr,
      front_en: front.en,
      back_en: back.en,
      explanation_fr: explanation.fr,
      explanation_en: explanation.en,
      media: media as any,
    },
    source: { type: sourceType, faculty, year: year === '' ? undefined : Number(year) } as any,
  });
  const ready = isReadyForApproval(checklist);
  const failing = failingFields(checklist);

  async function save() {
    if (!card) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const body = {
        content: {
          front_fr: front.fr,
          back_fr: back.fr,
          front_en: front.en,
          back_en: back.en,
          explanation_fr: explanation.fr,
          explanation_en: explanation.en,
          media: media.map((m) => ({ url: m.url, alt_text: m.alt_text, type: m.type })),
        },
        source: {
          type: sourceType,
          faculty: faculty || undefined,
          year: year === '' ? undefined : Number(year),
          can_distribute_offline: true,
        },
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      };
      const res = await fetch(`${API}/v1/content/cards/${card.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('cms_token') ?? ''}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function transitionTo(status: 'review' | 'approved' | 'published' | 'retired') {
    if (!card) return;
    if ((status === 'approved' || status === 'published') && !ready) {
      setError(`Checklist incomplète : ${failing.join(', ')}`);
      return;
    }
    try {
      const res = await fetch(`${API}/v1/content/cards/${card.id}/transition`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('cms_token') ?? ''}`,
        },
        body: JSON.stringify({ to: status }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      router.push('/admin/workflow');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!card) {
    return <div className="p-8">Chargement…</div>;
  }

  return (
    <div className="space-y-6 p-6 max-w-5xl">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Édition de carte</h1>
          <p className="text-sm text-slate-500 font-mono">{card.id}</p>
          <p className="text-sm text-slate-600">
            Statut actuel : <span className="font-semibold">{card.status}</span> · v{card.version}
          </p>
        </div>
        <div className="flex gap-2">
          {card.status === 'draft' && (
            <button
              onClick={() => transitionTo('review')}
              className="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700"
            >
              Soumettre à revue
            </button>
          )}
          {card.status === 'review' && (
            <button
              onClick={() => transitionTo('approved')}
              disabled={!ready}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              title={ready ? 'Approuver' : 'Checklist incomplète'}
            >
              Approuver
            </button>
          )}
          {card.status === 'approved' && (
            <button
              onClick={() => transitionTo('published')}
              disabled={!ready}
              className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
            >
              Publier
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="border border-red-200 bg-red-50 text-red-800 p-3 rounded flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Recto (question)</h2>
        <BilingualEditor value={front} onChange={setFront} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Verso (réponse)</h2>
        <BilingualEditor value={back} onChange={setBack} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Explication clinique (optionnel)</h2>
        <BilingualEditor value={explanation} onChange={setExplanation} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Médias</h2>
        <MediaUpload
          apiBaseUrl={API}
          authToken={localStorage.getItem('cms_token') ?? ''}
          onUploaded={(item) => setMedia((prev) => [...prev, item])}
        />
        {media.length > 0 && (
          <ul className="space-y-2">
            {media.map((m, i) => (
              <li key={i} className="flex gap-2 items-start border p-2 rounded">
                <span className="text-xs text-slate-500 px-2 py-1 bg-slate-100 rounded">
                  {m.type}
                </span>
                <input
                  type="text"
                  placeholder="Texte alternatif (obligatoire)"
                  value={m.alt_text}
                  onChange={(e) => {
                    const next = [...media];
                    next[i] = { ...m, alt_text: e.target.value };
                    setMedia(next);
                  }}
                  className="flex-1 border rounded px-2 py-1 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setMedia((prev) => prev.filter((_, j) => j !== i))}
                  className="text-red-600 text-sm"
                >
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4 border-t pt-4">
        <h2 className="text-lg font-semibold">Source (obligatoire)</h2>
        <div className="grid grid-cols-3 gap-3">
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value as any)}
            className="border rounded px-2 py-1.5"
          >
            <option value="original">Original</option>
            <option value="inspired">Inspiré</option>
            <option value="partnership">Partenariat</option>
          </select>
          <input
            type="text"
            placeholder="Faculté"
            value={faculty}
            onChange={(e) => setFaculty(e.target.value)}
            className="border rounded px-2 py-1.5"
          />
          <input
            type="number"
            placeholder="Année"
            value={year}
            onChange={(e) => setYear(e.target.value === '' ? '' : Number(e.target.value))}
            className="border rounded px-2 py-1.5"
          />
        </div>
      </section>

      <section className="space-y-2 border-t pt-4">
        <h2 className="text-lg font-semibold">Tags (séparés par virgule)</h2>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          className="w-full border rounded px-2 py-1.5"
          placeholder="cardio, valve, mitrale"
        />
      </section>

      <section className="space-y-2 border-t pt-4 bg-slate-50 p-4 rounded">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          {ready ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          ) : (
            <AlertCircle className="h-5 w-5 text-amber-600" />
          )}
          Checklist qualité
        </h2>
        <ul className="text-sm space-y-1">
          {Object.entries(checklist).map(([k, v]) => (
            <li key={k} className={v ? 'text-emerald-700' : 'text-slate-500'}>
              {v ? '✓' : '○'} {k}
            </li>
          ))}
        </ul>
        {!ready && failing.length > 0 && (
          <p className="text-sm text-amber-700 mt-2">
            Il manque : {failing.join(', ')}
          </p>
        )}
      </section>

      <div className="flex justify-end gap-2 border-t pt-4">
        <button
          onClick={() => router.push('/admin/cards')}
          className="px-4 py-2 border rounded hover:bg-slate-50"
        >
          Annuler
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Sauvegarde…' : 'Enregistrer'}
        </button>
        {saved && <span className="text-emerald-700 self-center">✓ Enregistré</span>}
      </div>
    </div>
  );
}
