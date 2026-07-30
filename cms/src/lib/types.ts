// Types partagés CMS ↔ backend (Phase 11 bis).
//
// On garde les noms en snake_case (compatibles avec les DTOs Zod
// côté backend).

export type CardStatus = 'draft' | 'review' | 'approved' | 'published' | 'retired';

export interface CardDetail extends CardSummary {
  /// Contenu bilingue.
  content: {
    front_fr: string;
    back_fr: string;
    front_en?: string;
    back_en?: string;
    explanation_fr?: string;
    explanation_en?: string;
    media: Array<{
      url: string;
      alt_text: string;
      type: 'image' | 'audio' | 'video';
    }>;
  };
  /// Source (v2 §5 — obligatoire).
  source: {
    type: 'original' | 'inspired' | 'partnership';
    faculty?: string;
    year?: number;
    can_distribute_offline: boolean;
    license?: string;
  };
  /// Tags (taxonomie).
  tags: string[];
}

export interface CardSummary {
  id: string;
  deck_id: string;
  type: string;
  status: CardStatus;
  version: number;
  is_premium: boolean;
  published_at: string | null;
  updated_at: string;
}

export interface CardReport {
  id: string;
  card_id: string;
  user_id: string;
  reason: string;
  comment: string | null;
  status: 'pending' | 'investigating' | 'resolved' | 'dismissed';
  reported_at: string;
}

export interface WorkflowTransition {
  from: CardStatus;
  to: CardStatus;
  at: string;
  actor: string;
  comment?: string;
}

export interface CardChecklist {
  /// Atomicité : 1 fait, 1 question.
  atomic: boolean;
  /// Source renseignée.
  source_filled: boolean;
  /// Reformulation personnelle (pas copiée d'un manuel).
  reformulation: boolean;
  /// Explication clinique présente.
  clinical_explanation: boolean;
  /// Terme anglais présent (si carte en FR).
  english_term: boolean;
  /// Alt text sur les médias.
  alt_text: boolean;
  /// Distracteurs QCM expliqués.
  distractors_explained: boolean;
}
