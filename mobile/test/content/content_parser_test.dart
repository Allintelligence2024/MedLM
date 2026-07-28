/// Tests de la Content Policy (architecture v2, §5.3 et §5.4).
///
/// L'essentiel de ces tests est **négatif** : on vérifie que le parser refuse
/// le contenu non conforme. Un validateur qui n'échoue jamais ne protège de
/// rien, et le risque juridique lié aux annales est réel.
library;

import 'dart:convert';
import 'dart:io';

import 'package:medanki_dz/core/content/card_content.dart';
import 'package:medanki_dz/core/content/content_parser.dart';
import 'package:medanki_dz/core/content/source_meta.dart';
import 'package:medanki_dz/core/srs/srs_models.dart';
import 'package:test/test.dart';

const ContentParser parser = ContentParser(strict: true);

Map<String, dynamic> baseCard({
  Map<String, dynamic>? sourceMeta,
  Map<String, dynamic>? content,
  String type = 'basic',
}) {
  return <String, dynamic>{
    'id': 'test_001',
    'deck_id': 'deck_test',
    'type': type,
    'source_meta': sourceMeta ??
        <String, dynamic>{
          'source_type': 'original',
          'can_distribute_offline': true,
        },
    'content': content ??
        <String, dynamic>{
          'front': <String, dynamic>{'fr': 'Question ?'},
          'back': <String, dynamic>{'fr': 'Réponse.'},
          'explanation': <String, dynamic>{'fr': 'Parce que.'},
        },
  };
}

void main() {
  group('Provenance obligatoire', () {
    test('une carte sans source_meta est refusée', () {
      final Map<String, dynamic> card = baseCard()..remove('source_meta');
      expect(() => parser.parseCard(card),
          throwsA(isA<ContentPolicyException>()));
    });

    test('un source_type inconnu est refusé', () {
      expect(
        () => parser.parseCard(baseCard(
            sourceMeta: <String, dynamic>{'source_type': 'scanned_exam'})),
        throwsA(isA<ContentPolicyException>()),
      );
    });

    test('les trois provenances autorisées sont acceptées', () {
      expect(
        parser
            .parseCard(baseCard(sourceMeta: <String, dynamic>{
              'source_type': 'original',
            }))
            .sourceMeta
            .sourceType,
        SourceType.original,
      );
      expect(
        parser
            .parseCard(baseCard(sourceMeta: <String, dynamic>{
              'source_type': 'inspired',
              'notes': 'Reformulé intégralement.',
            }))
            .sourceMeta
            .sourceType,
        SourceType.inspired,
      );
      expect(
        parser
            .parseCard(baseCard(sourceMeta: <String, dynamic>{
              'source_type': 'partnership',
              'attribution': 'Dr X, faculté d\'Oran',
            }))
            .sourceMeta
            .sourceType,
        SourceType.partnership,
      );
    });

    test('un partenariat sans attribution est refusé', () {
      expect(
        () => parser.parseCard(baseCard(
            sourceMeta: <String, dynamic>{'source_type': 'partnership'})),
        throwsA(isA<ContentPolicyException>()),
      );
    });

    test('une carte inspirée sans note de reformulation est refusée', () {
      // Sans documentation de la reformulation, rien ne distingue
      // l'inspiration de la copie d'annale.
      expect(
        () => parser.parseCard(baseCard(
            sourceMeta: <String, dynamic>{'source_type': 'inspired'})),
        throwsA(isA<ContentPolicyException>()),
      );
    });

    test('le takedown empêche le chargement de la carte', () {
      expect(
        () => parser.parseCard(baseCard(sourceMeta: <String, dynamic>{
          'source_type': 'original',
          'can_distribute_offline': false,
        })),
        throwsA(isA<ContentPolicyException>()),
      );
    });
  });

  group('Qualité pédagogique', () {
    test('une carte sans explication clinique est refusée', () {
      expect(
        () => parser.parseCard(baseCard(content: <String, dynamic>{
          'front': <String, dynamic>{'fr': 'Q'},
          'back': <String, dynamic>{'fr': 'R'},
        })),
        throwsA(isA<ContentPolicyException>()),
      );
    });

    test('le français est obligatoire, l\'anglais facultatif', () {
      expect(
        () => parser.parseCard(baseCard(content: <String, dynamic>{
          'front': <String, dynamic>{'en': 'Q'},
          'back': <String, dynamic>{'fr': 'R'},
          'explanation': <String, dynamic>{'fr': 'x'},
        })),
        throwsA(isA<ContentPolicyException>()),
      );

      final ParsedCard ok = parser.parseCard(baseCard());
      expect(ok.basic!.front.fr, isNotEmpty);
      expect(ok.basic!.front.hasEnglish, isFalse);
    });

    test('une image sans texte alternatif français est refusée', () {
      expect(
        () => parser.parseCard(baseCard(content: <String, dynamic>{
          'front': <String, dynamic>{'fr': 'Q'},
          'back': <String, dynamic>{'fr': 'R'},
          'explanation': <String, dynamic>{'fr': 'x'},
          'media': <dynamic>[
            <String, dynamic>{'type': 'image', 'key': 'a.webp'},
          ],
        })),
        throwsA(isA<ContentPolicyException>()),
      );
    });
  });

  group('Intégrité des QCM', () {
    Map<String, dynamic> qcm(List<Map<String, dynamic>> options,
        {bool isMultiple = false}) {
      return baseCard(type: 'qcm', content: <String, dynamic>{
        'question': <String, dynamic>{'fr': 'Question ?'},
        'is_multiple': isMultiple,
        'options': options,
      });
    }

    Map<String, dynamic> opt(String id, bool correct) => <String, dynamic>{
          'id': id,
          'fr': 'Option $id',
          'is_correct': correct,
          'explanation_fr': 'Explication $id',
        };

    test('un QCM valide est accepté', () {
      final ParsedCard card =
          parser.parseCard(qcm(<Map<String, dynamic>>[
        opt('A', true),
        opt('B', false),
      ]));
      expect(card.type, CardType.qcm);
      expect(card.qcm!.correctOptions, hasLength(1));
    });

    test('un QCM à moins de deux options est refusé', () {
      expect(() => parser.parseCard(qcm(<Map<String, dynamic>>[opt('A', true)])),
          throwsA(isA<ContentPolicyException>()));
    });

    test('un QCM sans bonne réponse est refusé', () {
      expect(
          () => parser.parseCard(qcm(<Map<String, dynamic>>[
                opt('A', false),
                opt('B', false),
              ])),
          throwsA(isA<ContentPolicyException>()));
    });

    test('un QCM à réponse unique avec deux bonnes réponses est refusé', () {
      expect(
          () => parser.parseCard(qcm(<Map<String, dynamic>>[
                opt('A', true),
                opt('B', true),
              ])),
          throwsA(isA<ContentPolicyException>()));
    });

    test('un QCM multiple à une seule bonne réponse est refusé', () {
      expect(
          () => parser.parseCard(qcm(<Map<String, dynamic>>[
                opt('A', true),
                opt('B', false),
              ], isMultiple: true)),
          throwsA(isA<ContentPolicyException>()));
    });

    test('des identifiants d\'options dupliqués sont refusés', () {
      expect(
          () => parser.parseCard(qcm(<Map<String, dynamic>>[
                opt('A', true),
                opt('A', false),
              ])),
          throwsA(isA<ContentPolicyException>()));
    });

    test('un distracteur sans explication est refusé', () {
      expect(
          () => parser.parseCard(qcm(<Map<String, dynamic>>[
                opt('A', true),
                <String, dynamic>{'id': 'B', 'fr': 'Option B',
                    'is_correct': false},
              ])),
          throwsA(isA<ContentPolicyException>()));
    });
  });

  group('Chargement des decks embarqués', () {
    final List<File> files = Directory('assets/content')
        .listSync()
        .whereType<File>()
        .where((File f) => f.path.endsWith('.json'))
        .toList();

    test('des decks sont bien embarqués', () {
      expect(files, isNotEmpty);
    });

    for (final File file in files) {
      test('${file.uri.pathSegments.last} est intégralement conforme', () {
        final Map<String, dynamic> json =
            jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
        final ParseResult result = const ContentParser().parseDeck(json);

        expect(result.rejected, isEmpty,
            reason: result.rejected.map((Object e) => '$e').join('\n'));
        expect(result.cards, isNotEmpty);

        for (final ParsedCard c in result.cards) {
          expect(c.sourceMeta.canDistributeOffline, isTrue);
          expect(c.version, greaterThanOrEqualTo(1));
        }
      });
    }

    test('les identifiants de cartes sont uniques sur tous les decks', () {
      final Set<String> seen = <String>{};
      for (final File file in files) {
        final Map<String, dynamic> json =
            jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
        for (final ParsedCard c in const ContentParser().parseDeck(json).cards) {
          expect(seen.add(c.id), isTrue, reason: 'identifiant dupliqué ${c.id}');
        }
      }
    });
  });

  group('Résolution de langue', () {
    test('repli sur le français quand l\'anglais est absent', () {
      const LocalizedText t = LocalizedText(fr: 'Cœur');
      expect(t.resolve(), 'Cœur');
      expect(t.resolve(preferEnglish: true), 'Cœur');
    });

    test('l\'anglais est retourné quand il est demandé et disponible', () {
      const LocalizedText t = LocalizedText(fr: 'Cœur', en: 'Heart');
      expect(t.resolve(), 'Cœur');
      expect(t.resolve(preferEnglish: true), 'Heart');
    });

    test('une chaîne anglaise vide ne remplace pas le français', () {
      const LocalizedText t = LocalizedText(fr: 'Cœur', en: '   ');
      expect(t.resolve(preferEnglish: true), 'Cœur');
    });
  });

  group('Mode non strict', () {
    test('une carte défectueuse est isolée sans faire échouer le deck', () {
      final Map<String, dynamic> deck = <String, dynamic>{
        'deck_id': 'deck_test',
        'cards': <dynamic>[
          baseCard(),
          baseCard()
            ..['id'] = 'bad_001'
            ..['source_meta'] = <String, dynamic>{'source_type': 'inconnu'},
        ],
      };
      final ParseResult r = const ContentParser().parseDeck(deck);
      expect(r.cards, hasLength(1));
      expect(r.rejected, hasLength(1));
      expect(r.hasRejections, isTrue);
    });
  });
}
