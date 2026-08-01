// Tests Phase 20.3 — parsing des modèles ML (miroir des réponses
// backend score-predictor.ts / tag-adjustments.ts).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:medanki_dz/data/repositories/ml/ml_models.dart';

void main() {
  group('MockExamPrediction.fromJson', () {
    test('union « predictible » : score, bande, marge, features rendues', () {
      final p = MockExamPrediction.fromJson(const {
        'user_id': 'u1',
        'window_days': 30,
        'predictible': true,
        'scorePercent': 62.4,
        'band': 'medium',
        'marginPercent': 9.1,
        'modelVersion': 'v1.0.0',
        'features': {
          'reviews30d': 214,
          'accuracy30d': 0.81,
          'coverageRatio': 0.42,
          'matureRatio': 0.33,
          'streakDays': 12,
        },
      });
      expect(p.predictible, isTrue);
      expect(p.scorePercent, 62.4);
      expect(p.band, ScoreBand.medium);
      expect(p.marginPercent, 9.1);
      expect(p.modelVersion, 'v1.0.0');
      expect(p.reason, isNull);
      expect(p.features.reviews30d, 214);
      expect(p.features.accuracy30d, closeTo(0.81, 1e-9));
      expect(p.features.streakDays, 12);
    });

    test('union « refus k-anonymat » : reason servie, pas de score', () {
      final p = MockExamPrediction.fromJson(const {
        'user_id': 'u1',
        'window_days': 30,
        'predictible': false,
        'reason': 'signal insuffisant : 12 revues sur 30 j (minimum 50)',
        'modelVersion': 'v1.0.0',
        'features': {
          'reviews30d': 12,
          'accuracy30d': 0.5,
          'coverageRatio': 0.1,
          'matureRatio': 0.0,
          'streakDays': 2,
        },
      });
      expect(p.predictible, isFalse);
      expect(p.scorePercent, isNull);
      expect(p.band, isNull);
      expect(p.marginPercent, isNull);
      expect(p.reason, contains('signal insuffisant'));
      expect(p.features.reviews30d, 12);
    });

    test('features manquantes → zéros défensifs (jamais de crash UI)', () {
      final p = MockExamPrediction.fromJson(const {
        'predictible': false,
        'reason': 'x',
        'modelVersion': 'v1.0.0',
      });
      expect(p.features.reviews30d, 0);
      expect(p.userId, '');
      expect(p.windowDays, 30);
    });

    test('ScoreBand.fromWire : inconnue → null (pas de fausse bande)', () {
      expect(ScoreBand.fromWire('low'), ScoreBand.low);
      expect(ScoreBand.fromWire('high'), ScoreBand.high);
      expect(ScoreBand.fromWire('platinum'), isNull);
      expect(ScoreBand.fromWire(null), isNull);
    });
  });

  group('TagFocusResult.fromJson', () {
    test('payload nominal : focus trié sévérité, relax, raisons rendues', () {
      final r = TagFocusResult.fromJson(const {
        'user_id': 'u1',
        'window_days': 30,
        'focus': [
          {
            'tag': 'cardio',
            'kind': 'focus',
            'reviews': 40,
            'lapses': 18,
            'lapseRate': 0.45,
            'reason': "taux d'échec 45% ≥ 35% sur 40 revues",
          },
        ],
        'relax': [
          {
            'tag': 'anatomie',
            'kind': 'relax',
            'reviews': 60,
            'lapses': 2,
            'lapseRate': 0.033,
            'reason': 'maîtrise démontrée : échecs 3% ≤ 10% sur 60 revues',
          },
        ],
      });
      expect(r.focus, hasLength(1));
      expect(r.relax, hasLength(1));
      expect(r.focus.single.tag, 'cardio');
      expect(r.focus.single.kind, TagSuggestionKind.focus);
      expect(r.focus.single.lapseRate, closeTo(0.45, 1e-9));
      expect(r.focus.single.reason, contains('45%'));
      expect(r.relax.single.tag, 'anatomie');
      expect(r.relax.single.kind, TagSuggestionKind.relax);
    });

    test('kind inconnu → focus (fail-safe conservateur)', () {
      final s = TagSuggestion.fromJson(const {
        'tag': 'x',
        'kind': 'future_kind',
        'reviews': 1,
        'lapses': 0,
        'lapseRate': 0,
        'reason': '',
      });
      expect(s.kind, TagSuggestionKind.focus);
    });

    test('listes absentes → vides (aucune suggestion affichée)', () {
      final r = TagFocusResult.fromJson(const {
        'user_id': 'u1',
        'window_days': 30,
      });
      expect(r.focus, isEmpty);
      expect(r.relax, isEmpty);
    });
  });
}
