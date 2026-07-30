'use client';

// Page workflow (board Kanban).
//
// Affiche toutes les cartes du deck courant (ou tous) organisées
// par statut. Drag & drop pour transitionner.

import { useEffect, useState } from 'react';
import { WorkflowBoard } from '@/components/workflow/workflow_board';
import type { CardStatus } from '@/lib/types';

interface Card {
  id: string;
  title: string;
  status: CardStatus;
  author: string;
  updatedAt: string;
}

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

export default function WorkflowPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API}/v1/content/cards/list?limit=200`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('cms_token') ?? ''}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const items = (data.items ?? []) as any[];
        setCards(
          items.map((c) => ({
            id: c.id,
            title: (c.title ?? c.id.slice(0, 8)) as string,
            status: c.status as CardStatus,
            author: c.author ?? 'anonyme',
            updatedAt: c.updated_at,
          })),
        );
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function onTransition(id: string, to: CardStatus) {
    try {
      const res = await fetch(`${API}/v1/content/cards/${id}/transition`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('cms_token') ?? ''}`,
        },
        body: JSON.stringify({ to }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (loading) return <div className="p-8">Chargement…</div>;
  if (error) return <div className="p-8 text-red-700">Erreur : {error}</div>;

  return (
    <div className="space-y-4 p-6">
      <header>
        <h1 className="text-2xl font-bold">Workflow éditorial</h1>
        <p className="text-slate-600">
          Drag & drop une carte entre les colonnes pour demander une transition.
        </p>
      </header>
      <WorkflowBoard initial={cards} onTransition={onTransition} />
    </div>
  );
}
