/// Catalogue de cours — parcourir et télécharger pour l'hors-ligne.
///
/// Deux sources fusionnées :
///   * la base LOCALE (`localDecks`), qui sait ce qui est déjà
///     téléchargé — disponible sans réseau ;
///   * le catalogue SERVEUR, qui sait ce qui existe.
///
/// Hors ligne, on affiche donc ce qu'on a, sans écran d'erreur : c'est
/// exactement le cas d'usage d'une application « hors-ligne d'abord ».
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/di/providers.dart';
import '../../domain/domain.dart';
import '../../l10n/app_localizations.dart';
import '../common/async_view.dart';

/// Vue d'un cours dans le catalogue, quelle que soit son origine.
@immutable
class DeckCatalogEntry {
  const DeckCatalogEntry({
    required this.deckId,
    required this.name,
    required this.cardCount,
    required this.isPremium,
    required this.isDownloaded,
    required this.version,
  });

  final String deckId;
  final String name;
  final int cardCount;
  final bool isPremium;
  final bool isDownloaded;
  final int version;
}

/// Fusionne catalogue distant et decks locaux.
///
/// Pure et testée (test/ui/deck_catalog_test.dart) : c'est la règle
/// « un deck local absent du serveur reste visible » qui compte, et
/// elle ne doit pas dépendre d'un widget pour être vérifiée.
List<DeckCatalogEntry> mergeCatalog({
  required List<Map<String, dynamic>> remote,
  required List<DeckSummary> local,
}) {
  final byId = {for (final d in local) d.deckId: d};
  final entries = <DeckCatalogEntry>[];
  final seen = <String>{};

  for (final raw in remote) {
    final id = (raw['id'] ?? raw['deck_id'])?.toString();
    if (id == null || id.isEmpty) continue;
    seen.add(id);
    final localDeck = byId[id];
    entries.add(
      DeckCatalogEntry(
        deckId: id,
        name: (raw['name_fr'] ?? raw['name'] ?? id).toString(),
        cardCount: (raw['card_count'] as num?)?.toInt() ??
            localDeck?.cardCount ??
            0,
        isPremium: raw['is_premium'] as bool? ?? localDeck?.isPremium ?? true,
        isDownloaded: localDeck?.isOfflineReady ?? false,
        version: (raw['version'] as num?)?.toInt() ?? localDeck?.version ?? 1,
      ),
    );
  }

  // Un deck téléchargé mais retiré du catalogue reste consultable :
  // l'utilisateur l'a déjà, le lui masquer serait lui retirer du
  // contenu qu'il possède.
  for (final d in local) {
    if (seen.contains(d.deckId)) continue;
    entries.add(
      DeckCatalogEntry(
        deckId: d.deckId,
        name: d.nameFr,
        cardCount: d.cardCount,
        isPremium: d.isPremium,
        isDownloaded: d.isOfflineReady,
        version: d.version,
      ),
    );
  }

  entries.sort((a, b) => a.name.compareTo(b.name));
  return entries;
}

final deckCatalogProvider = FutureProvider<List<DeckCatalogEntry>>((ref) async {
  final cards = ref.watch(cardRepositoryProvider);
  final local = await cards.localDecks();
  List<Map<String, dynamic>> remote = const [];
  try {
    remote = await ref.watch(apiClientProvider).listDecks();
  } catch (_) {
    // Hors ligne : le catalogue local suffit.
  }
  return mergeCatalog(remote: remote, local: local);
});

class DeckCatalogScreen extends ConsumerWidget {
  const DeckCatalogScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final decks = ref.watch(deckCatalogProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.decksTitle)),
      body: decks.when(
        loading: () => const LoadingState(),
        error: (e, _) => ErrorRetry(
          error: e,
          onRetry: () => ref.invalidate(deckCatalogProvider),
        ),
        data: (entries) {
          if (entries.isEmpty) {
            return EmptyState(
              message: l10n.decksEmpty,
              icon: Icons.library_books_outlined,
            );
          }
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(deckCatalogProvider),
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: entries.length,
              itemBuilder: (context, i) => _DeckTile(entry: entries[i]),
            ),
          );
        },
      ),
    );
  }
}

class _DeckTile extends ConsumerStatefulWidget {
  const _DeckTile({required this.entry});
  final DeckCatalogEntry entry;

  @override
  ConsumerState<_DeckTile> createState() => _DeckTileState();
}

class _DeckTileState extends ConsumerState<_DeckTile> {
  bool _busy = false;

  Future<void> _download() async {
    setState(() => _busy = true);
    try {
      await ref.read(downloadDeckProvider).call(
            deckId: widget.entry.deckId,
            version: widget.entry.version,
            cardCount: widget.entry.cardCount,
            isPremium: widget.entry.isPremium,
          );
      ref.invalidate(deckCatalogProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(describeError(context, e))),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final entry = widget.entry;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        title: Text(entry.name),
        subtitle: Row(
          children: [
            Text(l10n.decksCardCount(entry.cardCount)),
            if (entry.isPremium) ...[
              const SizedBox(width: 8),
              _Chip(label: l10n.decksPremium, icon: Icons.workspace_premium),
            ],
            if (entry.isDownloaded) ...[
              const SizedBox(width: 8),
              _Chip(label: l10n.decksOfflineReady, icon: Icons.offline_pin),
            ],
          ],
        ),
        trailing: entry.isDownloaded
            ? const Icon(Icons.check_circle_outline)
            : _busy
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : IconButton(
                    tooltip: l10n.decksDownload,
                    icon: const Icon(Icons.download_outlined),
                    onPressed: _download,
                  ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.icon});
  final String label;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: theme.colorScheme.primary),
        const SizedBox(width: 2),
        Text(label, style: theme.textTheme.labelSmall),
      ],
    );
  }
}
