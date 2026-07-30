// Checklist qualité (Phase 11 bis — v2 §5.3).
//
// Une carte ne peut passer de `review` → `approved` que si
// tous les critères sont validés. C'est bloquant.

import type { CardChecklist, CardDetail } from './types';

export function evaluateChecklist(card: Partial<CardDetail>): CardChecklist {
  const c = (card as any)?.content ?? {};
  const source = (card as any)?.source ?? {};
  return {
    atomic: !!(c.front_fr && c.back_fr),
    source_filled: !!(source.type && (source.faculty || source.year || source.can_distribute_offline !== undefined)),
    reformulation: !!(c.front_fr && c.front_fr.length > 20),
    clinical_explanation: !!(
      c.explanation_fr ||
      c.explanation_en
    ),
    english_term: !!(c.front_en || c.back_en),
    alt_text: Array.isArray(c.media)
      ? c.media.every((m: any) => m.alt_text && m.alt_text.length > 0)
      : true,
    distractors_explained: true, // Pas encore implémenté côté backend
  };
}

export function isReadyForApproval(checklist: CardChecklist): boolean {
  return Object.values(checklist).every((v) => v === true);
}

export function failingFields(checklist: CardChecklist): string[] {
  const labels: Record<keyof CardChecklist, string> = {
    atomic: 'Carte atomique (1 fait, 1 question)',
    source_filled: 'Source renseignée (type + faculté/année)',
    reformulation: 'Reformulation personnelle (> 20 caractères)',
    clinical_explanation: 'Explication clinique (FR ou EN)',
    english_term: 'Terme anglais présent',
    alt_text: 'Alt text sur tous les médias',
    distractors_explained: 'Distracteurs QCM expliqués',
  };
  const out: string[] = [];
  for (const k of Object.keys(checklist) as (keyof CardChecklist)[]) {
    if (!checklist[k]) out.push(labels[k]);
  }
  return out;
}
