// BadgesScreen — collection de badges débloqués (Phase 9 bis).
//
// Affiche une grille de 9 badges (cf. v2 §9.4) avec un état
// débloqué / verrouillé. La source de vérité est le backend
// (table `badge_unlocks`), pas le calcul local — sauf pour les
// badges déjà calculés localement (rapport rapide sans réseau).
library;

import 'package:flutter/material.dart';

import '../../core/gamification/gamification_constants.dart' as game;
import '../../data/network/api_client.dart';
import '../../l10n/app_localizations.dart';

class BadgesScreen extends StatefulWidget {
  const BadgesScreen({super.key, required this.api});
  final ApiClient api;

  @override
  State<BadgesScreen> createState() => _BadgesScreenState();
}

class _BadgesScreenState extends State<BadgesScreen> {
  late Future<Set<String>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<Set<String>> _load() async {
    try {
      final items = await widget.api.badgesUnlocked();
      return items
          .map((m) => (m['badge_id'] as String?) ?? '')
          .where((s) => s.isNotEmpty)
          .toSet();
    } catch (_) {
      return <String>{};
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(AppLocalizations.of(context).badgesMyTitle),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => setState(() => _future = _load()),
          ),
        ],
      ),
      body: FutureBuilder<Set<String>>(
        future: _future,
        builder: (context, snap) {
          final unlocked = snap.data ?? <String>{};
          return GridView.builder(
            padding: const EdgeInsets.all(12),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              childAspectRatio: 0.85,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
            ),
            itemCount: game.Badges.all.length,
            itemBuilder: (_, i) {
              final b = game.Badges.all[i];
              final isUnlocked = unlocked.contains(b.id);
              return _BadgeTile(badge: b, isUnlocked: isUnlocked);
            },
          );
        },
      ),
    );
  }
}

class _BadgeTile extends StatelessWidget {
  const _BadgeTile({required this.badge, required this.isUnlocked});
  final game.Badge badge;
  final bool isUnlocked;

  String _localizedName(AppLocalizations l10n) {
    switch (badge.id) {
      case 'streak_7':
        return l10n.badgeStreak7Name;
      case 'streak_30':
        return l10n.badgeStreak30Name;
      case 'streak_100':
        return l10n.badgeStreak100Name;
      case 'module_complete':
        return l10n.badgeModuleCompleteName;
      case 'mock_80':
        return l10n.badgeMock80Name;
      case 'cards_500':
        return l10n.badgeCards500Name;
      case 'cards_2500':
        return l10n.badgeCards2500Name;
      case 'zero_due_7d':
        return l10n.badgeZeroDue7dName;
      case 'english_enabled':
        return l10n.badgeEnglishEnabledName;
      default:
        return badge.name;
    }
  }

  String _localizedDesc(AppLocalizations l10n) {
    switch (badge.id) {
      case 'streak_7':
        return l10n.badgeStreak7Desc;
      case 'streak_30':
        return l10n.badgeStreak30Desc;
      case 'streak_100':
        return l10n.badgeStreak100Desc;
      case 'module_complete':
        return l10n.badgeModuleCompleteDesc;
      case 'mock_80':
        return l10n.badgeMock80Desc;
      case 'cards_500':
        return l10n.badgeCards500Desc;
      case 'cards_2500':
        return l10n.badgeCards2500Desc;
      case 'zero_due_7d':
        return l10n.badgeZeroDue7dDesc;
      case 'english_enabled':
        return l10n.badgeEnglishEnabledDesc;
      default:
        return badge.description;
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Container(
      decoration: BoxDecoration(
        color: isUnlocked
            ? Colors.amber.shade50
            : Colors.grey.shade100,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isUnlocked ? Colors.amber : Colors.grey.shade300,
          width: 2,
        ),
      ),
      padding: const EdgeInsets.all(8),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            isUnlocked ? Icons.emoji_events : Icons.lock_outline,
            size: 48,
            color: isUnlocked ? Colors.amber : Colors.grey,
          ),
          const SizedBox(height: 8),
          Text(
            _localizedName(l10n),
            textAlign: TextAlign.center,
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
          ),
          const SizedBox(height: 4),
          Text(
            _localizedDesc(l10n),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 10, color: Colors.black54),
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}
