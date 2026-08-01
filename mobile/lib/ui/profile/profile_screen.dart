/// Profil et réglages.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart';
import '../../core/di/providers.dart';
import '../../core/settings/app_settings.dart';
import '../../l10n/app_localizations.dart';
import '../common/async_view.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  bool _syncing = false;

  Future<void> _syncNow() async {
    final l10n = AppLocalizations.of(context);
    final session = ref.read(sessionProvider);
    final userId = session.userId;
    if (userId == null) return;
    setState(() => _syncing = true);
    try {
      final deviceId =
          await ref.read(tokenStorageProvider).getOrCreateDeviceId();
      await ref.read(syncOutboxProvider).call(
            userId: userId,
            deviceId: deviceId,
            nowMs: DateTime.now().millisecondsSinceEpoch,
          );
      ref.invalidate(dueCountProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.profileSynced)),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(describeError(context, e))),
        );
      }
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
  }

  Future<void> _logout() async {
    final l10n = AppLocalizations.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        content: Text(l10n.profileLogoutConfirm),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(l10n.actionCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(l10n.profileLogout),
          ),
        ],
      ),
    );
    if (!(ok ?? false)) return;
    // Le service de notifications est retiré AVANT la purge des
    // jetons : après `clear()`, l'appel authentifié échouerait et
    // l'appareil continuerait de recevoir des rappels.
    await ref.read(pushNotificationsProvider).unregister();
    await ref.read(sessionProvider.notifier).signOut();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final settings =
        ref.watch(settingsProvider).valueOrNull ?? const AppSettings();
    final version = ref.watch(appVersionProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.profileTitle)),
      body: ListView(
        children: [
          ListTile(
            leading: const Icon(Icons.translate),
            title: Text(l10n.profileLanguage),
            trailing: DropdownButton<AppLanguage>(
              value: settings.language,
              underline: const SizedBox.shrink(),
              items: const [
                DropdownMenuItem(
                  value: AppLanguage.fr,
                  child: Text('Français'),  // ignore: hardcoded-string — endonyme
                ),
                DropdownMenuItem(
                  value: AppLanguage.ar,
                  child: Text('العربية'),
                ),
                DropdownMenuItem(
                  value: AppLanguage.en,
                  child: Text('English'),
                ),
              ],
              onChanged: (v) {
                if (v != null) {
                  // ignore: discarded_futures
                  ref.read(settingsProvider.notifier).setLanguage(v);
                }
              },
            ),
          ),
          ListTile(
            leading: const Icon(Icons.flag_outlined),
            title: Text(l10n.profileDailyGoal),
            trailing: DropdownButton<int>(
              value: settings.dailyGoalCards,
              underline: const SizedBox.shrink(),
              items: [
                for (final g in AppSettings.goalChoices)
                  DropdownMenuItem<int>(value: g, child: Text('$g')),
              ],
              onChanged: (v) {
                if (v != null) {
                  // ignore: discarded_futures
                  ref.read(settingsProvider.notifier).setDailyGoal(v);
                }
              },
            ),
          ),
          ListTile(
            leading: const Icon(Icons.notifications_outlined),
            title: Text(l10n.profileNotifications),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(Routes.notificationPermission),
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.leaderboard_outlined),
            title: Text(l10n.leaderboardTitle),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(Routes.leaderboard),
          ),
          ListTile(
            leading: const Icon(Icons.workspace_premium_outlined),
            title: Text(l10n.badgesTitle),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(Routes.badges),
          ),
          ListTile(
            leading: const Icon(Icons.payment_outlined),
            title: Text(l10n.paywallTitle),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(Routes.paywall),
          ),
          const Divider(),
          ListTile(
            leading: _syncing
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.sync),
            title: Text(l10n.profileSync),
            onTap: _syncing ? null : _syncNow,
          ),
          ListTile(
            leading: const Icon(Icons.logout),
            title: Text(l10n.profileLogout),
            onTap: _logout,
          ),
          const Divider(),
          ListTile(
            dense: true,
            title: Text(
              l10n.profileVersion(version),
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
        ],
      ),
    );
  }
}
