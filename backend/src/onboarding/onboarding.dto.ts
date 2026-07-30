// DTOs Onboarding adaptatif (Phase 15.3).
//
// Le flow d'onboarding est volontairement court (5 questions) pour
// minimiser la friction d'inscription. Chaque réponse a un
// impact direct sur la recommandation de decks (Phase 16) et la
// pondération FSRS initiale (Phase 15.3).
import { z } from 'zod';

/// Faculté de l'étudiant. Mapping libre (l'utilisateur saisit en
/// texte libre côté mobile, on autocomplete).
export const FacultyAnswer = z.string().min(2).max(100);
export type FacultyAnswer = z.infer<typeof FacultyAnswer>;

/// Année d'étude (P1, P2, ...). On accepte 1..7.
export const StudyYearAnswer = z.number().int().min(1).max(7);
export type StudyYearAnswer = z.infer<typeof StudyYearAnswer>;

/// Niveau initial FSRS estimé. Auto-déclaré par l'utilisateur —
/// on l'utilise pour pondérer les paramètres FSRS au démarrage.
///   * 'beginner' : valeurs par défaut (w[0..18] toutes à 1.0).
///   * 'intermediate' : w ajustés (+10% sur retention).
///   * 'advanced' : w ajustés (-15% sur difficulty).
export const ExperienceLevelAnswer = z.enum(['beginner', 'intermediate', 'advanced']);
export type ExperienceLevelAnswer = z.infer<typeof ExperienceLevelAnswer>;

/// Langue préférée. FR principal, EN secondaire (v2 §3).
export const LanguageAnswer = z.enum(['fr', 'en', 'ar']);
export type LanguageAnswer = z.infer<typeof LanguageAnswer>;

/// Modules d'intérêt (sélection multiple). Liste d'IDs de modules
/// (programme + anatomie + histologie + ...).
export const ModuleInterestsAnswer = z.array(z.string().uuid()).max(20);
export type ModuleInterestsAnswer = z.infer<typeof ModuleInterestsAnswer>;

/// Objectif quotidien de cartes. Mapping direct vers
/// `newCardsPerDay` du `BuildStudyQueueUseCase`.
export const DailyGoalAnswer = z.number().int().min(5).max(50);
export type DailyGoalAnswer = z.infer<typeof DailyGoalAnswer>;

/// Body complet d'onboarding. Toutes les questions sont
/// obligatoires (le client mobile les pose une par une).
export const OnboardingBody = z.object({
  faculty: FacultyAnswer,
  study_year: StudyYearAnswer,
  experience_level: ExperienceLevelAnswer,
  preferred_language: LanguageAnswer,
  module_interests: ModuleInterestsAnswer.min(1).max(20),
  daily_goal_cards: DailyGoalAnswer,
});
export type OnboardingBody = z.infer<typeof OnboardingBody>;

/// Réponse : profil calibré + recommandation de decks (top 3).
export interface OnboardingResponse {
  user_id: string;
  profile: {
    faculty: string;
    study_year: number;
    experience_level: ExperienceLevelAnswer;
    preferred_language: LanguageAnswer;
    module_interests: string[];
    daily_goal_cards: number;
  };
  /// Pondérations FSRS ajustées selon l'expérience déclarée.
  fsrs_weights: number[];
  /// Top 3 decks recommandés (basés sur les modules d'intérêt).
  recommended_decks: Array<{
    deck_id: string;
    name_fr: string;
    module_name_fr: string;
    cards_count: number;
  }>;
  /// Prochaine étape (ex. "Téléchargez le deck Anatomie — Membre
  /// supérieur pour démarrer").
  next_step: string;
}
