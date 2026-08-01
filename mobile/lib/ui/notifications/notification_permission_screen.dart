/// Écran de permission des notifications (audit P1-3).
///
/// Il existe parce qu'une demande de permission système sortie de nulle
/// part se fait refuser — et un refus Android/iOS est quasi définitif
/// (il faut aller dans les réglages du téléphone). On explique donc
/// d'abord ce qu'on enverra et à quelle fréquence, PUIS on demande.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/di/providers.dart';
import '../../core/notifications/push_notifications.dart';
import '../../core/settings/app_settings.dart';
import '../../l10n/app_localizations.dart';

class NotificationPermissionScreen extends ConsumerStatefulWidget {
  const NotificationPermissionScreen({super.key});

  @override
  ConsumerState<NotificationPermissionScreen> createState() =>
      _NotificationPermissionScreenState();
}

class _NotificationPermissionScreenState
    extends ConsumerState<NotificationPermissionScreen> {
  PushPermission _status = PushPermission.unknown;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    // ignore: discarded_futures
    _refresh();
  }

  Future<void> _refresh() async {
    final status = await ref.read(pushNotificationsProvider).currentPermission();
    if (mounted) setState(() => _status = status);
  }

  Future<void> _allow() async {
    setState(() => _busy = true);
    final push = ref.read(pushNotificationsProvider);
    final status = await push.requestPermission();
    if (status == PushPermission.granted ||
        status == PushPermission.provisional) {
      await ref.read(settingsProvider.notifier).setRemindersEnabled(true);
      final settings = ref.read(settingsProvider).valueOrNull;
      await push.initialize(
        appVersion: ref.read(appVersionProvider),
        locale: settings?.language.code ?? 'fr',
      );
    }
    if (mounted) {
      setState(() {
        _status = status;
        _busy = false;
      });
    }
  }

  Future<void> _decline() async {
    await ref.read(settingsProvider.notifier).setRemindersEnabled(false);
    await ref.read(pushNotificationsProvider).unregister();
    if (mounted) context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final denied = _status == PushPermission.denied;
    final granted = _status == PushPermission.granted ||
        _status == PushPermission.provisional;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.profileNotifications)),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              Icon(
                granted
                    ? Icons.notifications_active_outlined
                    : Icons.notifications_outlined,
                size: 56,
                color: theme.colorScheme.primary,
              ),
              const SizedBox(height: 24),
              Text(
                l10n.notifPermissionTitle,
                style: theme.textTheme.headlineSmall,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              Text(
                l10n.notifPermissionBody,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
                textAlign: TextAlign.center,
              ),
              if (denied) ...[
                const SizedBox(height: 16),
                Text(
                  l10n.notifDenied,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.error,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
              const Spacer(),
              if (granted)
                FilledButton(
                  onPressed: () => context.pop(),
                  child: Text(l10n.actionClose),
                )
              else ...[
                FilledButton(
                  onPressed: _busy || denied ? null : _allow,
                  child: Text(l10n.notifPermissionAllow),
                ),
                const SizedBox(height: 12),
                OutlinedButton(
                  onPressed: _busy ? null : _decline,
                  child: Text(l10n.notifPermissionDeny),
                ),
              ],
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}
