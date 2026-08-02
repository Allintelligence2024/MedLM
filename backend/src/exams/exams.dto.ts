// DTOs Exam (Phase 10).
//
// Format compatible avec la spec OpenData du MESRES / facultés
// algériennes : un sujet = N questions (QCM), durée fixe, barème
// standard.
import { z } from 'zod';

export const StartExamBody = z.object({
  template_id: z.string().uuid(),
  module_id: z.string().uuid().optional(),
  faculty: z.string().max(100).optional(),
});
export type StartExamBody = z.infer<typeof StartExamBody>;

/// Une réponse à une question d'examen.
export const AnswerBody = z.object({
  question_id: z.string().uuid(),
  /// Liste des ids d'options choisies (vide = pas répondu).
  selected: z.array(z.string().min(1).max(64)),
  /// Temps passé sur la question, en ms. Pour l'analyse des patterns
  /// de réponse (étape 11 — analytics).
  duration_ms: z.number().int().nonnegative().default(0),
});
export type AnswerBody = z.infer<typeof AnswerBody>;

export const SubmitExamBody = z.object({
  answers: z.array(AnswerBody).min(1).max(200),
});
export type SubmitExamBody = z.infer<typeof SubmitExamBody>;

/// Barème standard (à calibrer par faculté).
export interface ExamScoring {
  totalQuestions: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  score: number; // 0..1
  pct: number; // 0..100
  pass: boolean; // >= 0.5 par défaut
}

export interface ExamQuestion {
  id: string;
  position: number;
  /// L'option correcte n'est PAS envoyée à l'app — le serveur la
  /// garde jusqu'à la soumission.
  options: { id: string; fr: string; en?: string }[];
  /// Indice de la bonne réponse (privé serveur).
  correctOptionIds: string[];
  isMultiple: boolean;
}

export interface ExamTemplate {
  id: string;
  name_fr: string;
  duration_minutes: number;
  total_questions: number;
  module_id: string;
}

export interface ExamAttempt {
  id: string;
  user_id: string;
  template_id: string;
  started_at: number;
  expires_at: number; // timestamp epoch ms
  duration_minutes: number;
  questions: ExamQuestion[];
  /// Index des questions ratées, à réinjecter dans le SRS après
  /// soumission.
  missed_question_ids: string[];
  status: 'in_progress' | 'submitted' | 'expired' | 'abandoned';
}
