// Tests audit P1-2 — fusion catalogue distant / decks locaux.
//
// L'enjeu : le produit est « hors-ligne d'abord ». Un deck déjà
// téléchargé doit rester visible même quand le serveur est
// injoignable — et même s'il a été retiré du catalogue entre-temps.
import 'package:flutter_test/flutter_test.dart';
import 'package:medanki_dz/domain/domain.dart';
import 'package:medanki_dz/ui/decks/deck_catalog_screen.dart';

DeckSummary _local(
  String id, {
  String name = 'Deck local',
  bool offlineReady = true,
  int cards = 10,
  bool premium = false,
  int version = 3,
}) =>
    DeckSummary(
      deckId: id,
      moduleId: 'module-1',
      nameFr: name,
      version: version,
      cardCount: cards,
      isPremium: premium,
      isOfflineReady: offlineReady,
    );

void main() {
  test('catalogue vide des deux côtés → liste vide', () {
    expect(mergeCatalog(remote: const [], local: const []), isEmpty);
  });

  test('hors ligne : seuls les decks locaux sont listés', () {
    final entries = mergeCatalog(
      remote: const [],
      local: [_local('d1', name: 'Anatomie')],
    );
    expect(entries, hasLength(1));
    expect(entries.single.name, 'Anatomie');
    expect(entries.single.isDownloaded, isTrue);
  });

  test('un deck distant non téléchargé est marqué comme tel', () {
    final entries = mergeCatalog(
      remote: [
        {'id': 'd1', 'name_fr': 'Biochimie', 'card_count': 42, 'is_premium': true},
      ],
      local: const [],
    );
    expect(entries.single.isDownloaded, isFalse);
    expect(entries.single.cardCount, 42);
    expect(entries.single.isPremium, isTrue);
  });

  test('un deck présent des deux côtés n\'apparaît qu\'une fois', () {
    final entries = mergeCatalog(
      remote: [
        {'id': 'd1', 'name_fr': 'Anatomie', 'card_count': 50},
      ],
      local: [_local('d1', name: 'Anatomie', cards: 50)],
    );
    expect(entries, hasLength(1));
    expect(entries.single.isDownloaded, isTrue);
  });

  test('un deck retiré du catalogue mais téléchargé reste visible', () {
    // Le masquer reviendrait à retirer à l'utilisateur du contenu
    // qu'il possède déjà sur son téléphone.
    final entries = mergeCatalog(
      remote: [
        {'id': 'd2', 'name_fr': 'Histologie'},
      ],
      local: [_local('d1', name: 'Ancien deck')],
    );
    expect(entries.map((e) => e.deckId), containsAll(['d1', 'd2']));
  });

  test('accepte `deck_id` comme `id` (deux formes d\'enveloppe)', () {
    final entries = mergeCatalog(
      remote: [
        {'deck_id': 'd9', 'name': 'Embryologie'},
      ],
      local: const [],
    );
    expect(entries.single.deckId, 'd9');
    expect(entries.single.name, 'Embryologie');
  });

  test('ignore une entrée distante sans identifiant', () {
    final entries = mergeCatalog(
      remote: [
        {'name_fr': 'Sans id'},
        {'id': '', 'name_fr': 'Id vide'},
      ],
      local: const [],
    );
    expect(entries, isEmpty);
  });

  test('les métadonnées locales comblent les trous du distant', () {
    final entries = mergeCatalog(
      remote: [
        {'id': 'd1', 'name_fr': 'Anatomie'},
      ],
      local: [_local('d1', cards: 77, premium: true, version: 5)],
    );
    expect(entries.single.cardCount, 77);
    expect(entries.single.isPremium, isTrue);
    expect(entries.single.version, 5);
  });

  test('tri alphabétique stable', () {
    final entries = mergeCatalog(
      remote: [
        {'id': 'c', 'name_fr': 'Cardio'},
        {'id': 'a', 'name_fr': 'Anatomie'},
        {'id': 'b', 'name_fr': 'Biochimie'},
      ],
      local: const [],
    );
    expect(entries.map((e) => e.name), ['Anatomie', 'Biochimie', 'Cardio']);
  });
}
