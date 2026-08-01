// Tests Phase 19.5 — parsing des modèles IA (miroir des DTOs backend).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:medanki_dz/data/repositories/ai/ai_models.dart';

void main() {
  group('AiHint.fromJson', () {
    test('payload nominal du backend (hints.dto.ts)', () {
      final hint = AiHint.fromJson(const {
        'card_id': 'c1',
        'category': 'leech_help',
        'hint': 'Vous avez raté cette carte 3 fois…',
        'lang': 'fr',
        'experience_level': 'intermediate',
        'personalized': true,
        'based_on': ['lapses=3', 'tag:anatomie'],
        'generated_at': '2026-08-01T09:00:00.000Z',
      });
      expect(hint.cardId, 'c1');
      expect(hint.category, HintCategory.leechHelp);
      expect(hint.text, contains('3 fois'));
      expect(hint.lang, AiLang.fr);
      expect(hint.experienceLevel, ExperienceLevel.intermediate);
      expect(hint.personalized, isTrue);
      expect(hint.basedOn, ['lapses=3', 'tag:anatomie']);
    });

    test('catégorie inconnue → memoryAnchor (fail-safe)', () {
      final hint = AiHint.fromJson(const {
        'card_id': 'c2',
        'category': 'future_category',
        'hint': 'x',
        'lang': 'ar',
        'experience_level': 'advanced',
        'personalized': true,
        'based_on': <dynamic>[],
        'generated_at': '',
      });
      expect(hint.category, HintCategory.memoryAnchor);
      expect(hint.lang, AiLang.ar);
      expect(hint.experienceLevel, ExperienceLevel.advanced);
    });
  });

  group('VoiceDraft.fromJson', () {
    test('payload nominal (voice-to-card.dto.ts)', () {
      final draft = VoiceDraft.fromJson(const {
        'job_id': 'j1',
        'draft_id': 'd1',
        'transcript': 'la pompe sodium potassium expulse trois sodium',
        'formatted': {
          'front': 'Que fait la pompe Na+/K+ ATPase ?',
          'back': 'Elle expulse 3 Na+ et importe 2 K+.',
          'rule': 'definition',
        },
        'transcriber': {
          'provider': 'mock',
          'model': 'deterministic',
          'confidence': 0.99,
        },
        'lang': 'fr',
        'remaining_quota_today': 48,
        'next_step': 'Relisez le brouillon puis publiez-le.',
      });
      expect(draft.draftId, 'd1');
      expect(draft.formatted.rule, 'definition');
      expect(draft.transcriber.provider, 'mock');
      expect(draft.remainingQuotaToday, 48);
      expect(draft.nextStep, isNotEmpty);
    });
  });

  group('TutorAnswer.fromJson', () {
    test('le disclaimer est présent et séparé (tutor.dto.ts)', () {
      final answer = TutorAnswer.fromJson(const {
        'answer': 'La glycolyse produit 2 ATP nets. ⚠️ …',
        'disclaimer': '⚠️ Ceci n\u2019est pas un avis médical…',
        'emergency': false,
        'within_scope': true,
        'provider': 'mock',
        'model': 'deterministic',
        'remaining_quota_today': 27,
      });
      expect(answer.disclaimer, startsWith('⚠️'));
      expect(answer.emergency, isFalse);
      expect(answer.withinScope, isTrue);
      expect(answer.remainingQuotaToday, 27);
    });

    test('réponse urgence : flag propagé', () {
      final answer = TutorAnswer.fromJson(const {
        'answer': '🚨 Appelez le SAMU 115…',
        'disclaimer': '⚠️ …',
        'emergency': true,
        'within_scope': true,
        'provider': 'mock',
        'model': 'deterministic',
        'remaining_quota_today': 26,
      });
      expect(answer.emergency, isTrue);
    });
  });

  group('AdaptiveProfile.fromJson', () {
    test('payload nominal (adaptive.service.ts getProfile)', () {
      final profile = AdaptiveProfile.fromJson(const {
        'user_id': 'u1',
        'window_days': 30,
        'total_reviews': 320,
        'lapses': 96,
        'lapse_rate': 0.3,
        'leech_cards': [
          {'card_id': 'c9', 'lapses': 5, 'tags': ['cardio']},
        ],
        'hot_tags': [
          {'tag': 'cardio', 'reviews': 40, 'lapses': 20, 'lapse_rate': 0.5},
        ],
        'fsrs_adjustment': {
          'weights': [
            0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604,
            0.0046, 1.54575, 0.1192, 1.01925, 2.230425, 0.11, 0.29605,
            2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
          ],
          'changed_indices': [11],
          'reasons': ['lapse_rate élevé (30% ≥ 30%) → w11 ×1.15'],
          'active': true,
        },
      });
      expect(profile.lapseRate, closeTo(0.3, 1e-12));
      expect(profile.leechCards.single.cardId, 'c9');
      expect(profile.hotTags.single.tag, 'cardio');
      expect(profile.fsrsAdjustment.active, isTrue);
      expect(profile.fsrsAdjustment.changedIndices, [11]);
      expect(profile.fsrsAdjustment.weights[11], closeTo(2.230425, 1e-12));
    });
  });
}
