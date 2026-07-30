// OnboardingService — Phase 15.3.
//
// Le flow est en 5 questions pour minimiser la friction :
//   1. Faculté
//   2. Année d'étude
//   3. Niveau d'expérience (beginner/intermediate/advanced)
//   4. Modules d'intérêt (multi-sélection)
//   5. Objectif quotidien de cartes
//
// Côté serveur, on :
//   * Persiste le profil dans `users` (colonnes existantes) et
//     `user_preferences` (à venir Phase 16).
//   * Ajuste les poids FSRS initiaux selon l'expérience déclarée.
//   * Recommande 3 decks selon les modules d'intérêt.
//   * Retourne la "next step" pour le client.
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../db/database.module';
import { users } from '../db/schema/users';
import { decks, modules } from '../db/schema/content';
import { FSRS_WEIGHTS } from '../common/fsrs/fsrs.constants';
import { OnboardingBody, OnboardingResponse } from './onboarding.dto';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async submit(args: { userId: string; body: OnboardingBody }): Promise<OnboardingResponse> {
    // 1. Vérifier que le user existe.
    const user = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, args.userId))
      .get();
    if (!user) throw new NotFoundException('user introuvable');

    // 2. Mettre à jour le profil utilisateur.
    await this.db
      .update(users)
      .set({
        faculty: args.body.faculty,
        studyYear: args.body.study_year,
        langPref: args.body.preferred_language,
        lastSeenAt: new Date(),
      })
      .where(eq(users.id, args.userId));

    // 3. Ajuster les poids FSRS selon l'expérience.
    const fsrsWeights = this._adjustFsrsWeights(args.body.experience_level);

    // 4. Recommander 3 decks selon les modules d'intérêt.
    const recommendedDecks = await this._recommendDecks(args.body.module_interests);

    // 5. Prochaine étape.
    const nextStep = recommendedDecks.length > 0
      ? `Téléchargez le deck « ${recommendedDecks[0]!.name_fr} » pour démarrer.`
      : 'Explorez le catalogue pour trouver vos premiers decks.';

    this.logger.log(
      `onboarding: user=${args.userId} faculty=${args.body.faculty} ` +
        `year=${args.body.study_year} level=${args.body.experience_level} ` +
        `modules=${args.body.module_interests.length}`,
    );

    return {
      user_id: args.userId,
      profile: {
        faculty: args.body.faculty,
        study_year: args.body.study_year,
        experience_level: args.body.experience_level,
        preferred_language: args.body.preferred_language,
        module_interests: args.body.module_interests,
        daily_goal_cards: args.body.daily_goal_cards,
      },
      fsrs_weights: fsrsWeights,
      recommended_decks: recommendedDecks,
      next_step: nextStep,
    };
  }

  /// Ajuste les 19 poids FSRS initiaux selon le niveau déclaré.
  /// Cf. v2 §4 : 19 paramètres w[0..18].
  _adjustFsrsWeights(level: 'beginner' | 'intermediate' | 'advanced'): number[] {
    const base = [...FSRS_WEIGHTS];
    switch (level) {
      case 'beginner':
        // Pas d'ajustement. Le moteur utilise les valeurs par défaut,
        // calibrées pour un public "moyen".
        return base;
      case 'intermediate':
        // +10% sur le paramètre `requestRetention` (index 17).
        // Un étudiant intermédiaire retient mieux → on espace
        // davantage les révisions.
        return base.map((w, i) => (i === 17 ? Math.min(w * 1.1, 0.99) : w));
      case 'advanced':
        // -15% sur la difficulté moyenne (w[2..5]). Les cartes
        // sont jugées plus faciles → moins de lapses.
        return base.map((w, i) => (i >= 2 && i <= 5 ? w * 0.85 : w));
    }
  }

  /// Recommande jusqu'à 3 decks populaires dans les modules
  /// d'intérêt, triés par nombre de cartes (les plus gros d'abord).
  async _recommendDecks(
    moduleIds: string[],
  ): Promise<Array<{ deck_id: string; name_fr: string; module_name_fr: string; cards_count: number }>> {
    if (moduleIds.length === 0) return [];
    const rows = await this.db
      .select({
        deckId: decks.id,
        nameFr: decks.nameFr,
        cardCount: decks.cardCount,
        moduleNameFr: modules.nameFr,
      })
      .from(decks)
      .innerJoin(modules, eq(modules.id, decks.moduleId))
      .where(inArray(decks.moduleId, moduleIds))
      .orderBy(sql`${decks.cardCount} DESC`)
      .limit(3);
    return rows.map((r) => ({
      deck_id: r.deckId,
      name_fr: r.nameFr,
      module_name_fr: r.moduleNameFr,
      cards_count: r.cardCount,
    }));
  }
}
