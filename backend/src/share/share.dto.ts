// DTOs Partage social (Phase 15.5).
//
// v2 §11.3 — "Partage social des résultats mock exam". Objectif :
// permettre à un étudiant de partager une "carte de résultat"
// stylisée sur WhatsApp / Twitter / Stories Instagram.
//
// Conformité RGPD (v2 §13) :
//   * Opt-in explicite à chaque partage (pas d'autorisation
//     globale, pas de re-share automatique).
//   * Le pseudonyme est OBLIGATOIRE (l'utilisateur ne peut pas
//     partager son résultat avec son vrai nom sauf s'il le saisit
//     explicitement — ce qu'on n'autorise pas dans la v1).
//   * Pas de tracking des partages (pas de pixel, pas d'UTM).
import { z } from 'zod';

/// Body : crée une carte de partage pour un mock exam.
export const CreateShareBody = z.object({
  /// ID de la tentative d'examen à partager.
  attempt_id: z.string().uuid(),
  /// Style de la carte (défaut 'minimal').
  ///   * 'minimal' : juste le score et le rang.
  ///   * 'detailed' : ajoute la faculté, l'année, le module.
  ///   * 'story' : format vertical 9:16 (Instagram Stories).
  style: z.enum(['minimal', 'detailed', 'story']).default('minimal'),
});
export type CreateShareBody = z.infer<typeof CreateShareBody>;

/// Réponse : carte de partage (métadonnées + URL de l'image).
export interface ShareCard {
  /// ID de la carte (pour les stats, jamais exposé publiquement).
  id: string;
  /// URL publique de l'image PNG générée.
  image_url: string;
  /// Texte prêt à coller dans WhatsApp / Twitter.
  share_text: string;
  /// Date d'expiration (les images partagées expirent après 30j
  /// pour limiter la rétention).
  expires_at: string;
  /// Style utilisé.
  style: 'minimal' | 'detailed' | 'story';
}

/// Métadonnées publiques (lecture seule via GET /v1/share/:id).
/// Pas d'email, pas de user_id — uniquement le pseudonyme.
export interface PublicShareMetadata {
  pseudonym: string;
  score: number;
  pct: number;
  module_name_fr: string;
  faculty: string | null;
  style: 'minimal' | 'detailed' | 'story';
  created_at: string;
}
