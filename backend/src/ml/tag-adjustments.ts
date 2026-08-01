// TagAdjustments — Phase 20.3 : ajustement des priorités par tag.
//
// À partir des revues agrégées par tag (fenêtre 30 j), suggère les
// tags sur lesquels concentrer la révision (taux d'échec élevé avec
// assez de signal) ou relâcher (maîtrise démontrée). Complémentaire
// du FSRS adaptatif (18.4) : celui-ci agit sur LES POIDS du modèle,
// celui-là sur LES PRIORITÉS éditoriales affichées à l'étudiant.
//
// Pur et explicable : chaque suggestion rend ses chiffres (v2 §13).

export const TAG_ADJUST_THRESHOLDS = {
  /// Signal minimum par tag (échantillon trop petit = pas d'avis).
  MIN_TAG_REVIEWS: 20,
  /// Échec ≥ 35 % → focus prioritaire.
  FOCUS_LAPSE_RATE: 0.35,
  /// Échec ≤ 8 % ET ≥ 40 revues → allègement suggéré.
  RELAX_LAPSE_RATE: 0.08,
  RELAX_MIN_REVIEWS: 40,
  /// Nombre max de suggestions par catégorie.
  MAX_SUGGESTIONS: 5,
} as const;

export interface TagAggregate {
  tag: string;
  reviews: number;
  lapses: number;
}

export type TagSuggestionKind = 'focus' | 'relax';

export interface TagSuggestion {
  tag: string;
  kind: TagSuggestionKind;
  reviews: number;
  lapses: number;
  lapseRate: number; // arrondi 0.001
  /// Justification explicable (même pattern que l'adaptatif 18.4).
  reason: string;
}

export class TagAdjustments {
  static suggest(
    aggregates: TagAggregate[],
  ): { focus: TagSuggestion[]; relax: TagSuggestion[] } {
    const t = TAG_ADJUST_THRESHOLDS;
    const suggestions: TagSuggestion[] = [];

    for (const a of aggregates) {
      if (a.reviews < t.MIN_TAG_REVIEWS) continue;
      const rate = a.reviews === 0 ? 0 : a.lapses / a.reviews;
      const rounded = Math.round(rate * 1000) / 1000;
      if (rate >= t.FOCUS_LAPSE_RATE) {
        suggestions.push({
          tag: a.tag,
          kind: 'focus',
          reviews: a.reviews,
          lapses: a.lapses,
          lapseRate: rounded,
          reason: `taux d'échec ${Math.round(rate * 100)}% ≥ ${t.FOCUS_LAPSE_RATE * 100}% sur ${a.reviews} revues`,
        });
      } else if (rate <= t.RELAX_LAPSE_RATE && a.reviews >= t.RELAX_MIN_REVIEWS) {
        suggestions.push({
          tag: a.tag,
          kind: 'relax',
          reviews: a.reviews,
          lapses: a.lapses,
          lapseRate: rounded,
          reason: `maîtrise démontrée : échecs ${Math.round(rate * 100)}% ≤ ${t.RELAX_LAPSE_RATE * 100}% sur ${a.reviews} revues`,
        });
      }
    }

    const bySeverity = (x: TagSuggestion, y: TagSuggestion) =>
      y.lapseRate - x.lapseRate || y.reviews - x.reviews;

    const focus = suggestions
      .filter((s) => s.kind === 'focus')
      .sort(bySeverity)
      .slice(0, t.MAX_SUGGESTIONS);
    const relax = suggestions
      .filter((s) => s.kind === 'relax')
      .sort((x, y) => x.lapseRate - y.lapseRate || y.reviews - x.reviews)
      .slice(0, t.MAX_SUGGESTIONS);
    return { focus, relax };
  }
}
