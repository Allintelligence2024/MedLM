'use client';

// WorkflowBoard — board Kanban drag & drop pour le workflow des
// cartes (Phase 11 bis — v2 §5.3).
//
// États : draft → review → approved → published → retired.
// L'auteur drag sa carte dans la colonne suivante pour demander
// la transition. Le serveur valide (checklist qualité + RBAC).

import { useState, useTransition } from 'react';
import type { CardStatus } from '@/lib/types';

interface Card {
  id: string;
  title: string;
  status: CardStatus;
  author: string;
  updatedAt: string;
}

const COLUMNS: { status: CardStatus; label: string; color: string }[] = [
  { status: 'draft', label: 'Brouillon', color: 'bg-slate-200' },
  { status: 'review', label: 'En revue', color: 'bg-amber-200' },
  { status: 'approved', label: 'Approuvé', color: 'bg-blue-200' },
  { status: 'published', label: 'Publié', color: 'bg-emerald-200' },
  { status: 'retired', label: 'Retiré', color: 'bg-red-200' },
];

interface Props {
  initial: Card[];
  onTransition?: (id: string, to: CardStatus) => Promise<void>;
  canMoveTo?: (from: CardStatus, to: CardStatus) => boolean;
}

export function WorkflowBoard({ initial, onTransition, canMoveTo }: Props) {
  const [cards, setCards] = useState<Card[]>(initial);
  const [isPending, startTransition] = useTransition();
  const [dragged, setDragged] = useState<string | null>(null);

  function moveTo(id: string, to: CardStatus) {
    startTransition(async () => {
      setCards((prev) => prev.map((c) => (c.id === id ? { ...c, status: to } : c)));
      if (onTransition) await onTransition(id, to);
    });
  }

  function allowTransition(from: CardStatus, to: CardStatus): boolean {
    if (canMoveTo) return canMoveTo(from, to);
    // Default: seulement séquentiel (sauf retired qui peut venir de partout).
    if (to === 'retired') return from !== 'retired';
    const order: CardStatus[] = ['draft', 'review', 'approved', 'published'];
    return order.indexOf(to) === order.indexOf(from) + 1;
  }

  return (
    <div className={`grid grid-cols-5 gap-3 ${isPending ? 'opacity-60' : ''}`}>
      {COLUMNS.map((col) => (
        <div
          key={col.status}
          className="bg-slate-50 rounded-lg p-3 min-h-[400px]"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!dragged) return;
            const card = cards.find((c) => c.id === dragged);
            if (!card) return;
            if (allowTransition(card.status, col.status)) {
              moveTo(card.id, col.status);
            }
            setDragged(null);
          }}
        >
          <h3 className={`text-sm font-bold mb-3 px-2 py-1 rounded ${col.color}`}>
            {col.label} ({cards.filter((c) => c.status === col.status).length})
          </h3>
          <div className="space-y-2">
            {cards
              .filter((c) => c.status === col.status)
              .map((c) => (
                <div
                  key={c.id}
                  draggable
                  onDragStart={() => setDragged(c.id)}
                  onDragEnd={() => setDragged(null)}
                  className="bg-white p-2 rounded shadow-sm cursor-move hover:shadow-md transition-shadow"
                >
                  <p className="text-sm font-medium">{c.title}</p>
                  <p className="text-xs text-slate-500 mt-1">{c.author}</p>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
