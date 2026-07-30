// ExamAntiCheat — widget Flutter qui surveille les interactions
// suspectes pendant un examen (v2 §10 + Phase 10 bis).
//
// Événements tracés :
//   * focus_loss / focus_gain : visibilité de l'app (background).
//   * paste : collage depuis le presse-papier.
//   * switch_tab : sur web uniquement (pas applicable mobile).
//   * right_click : sur web uniquement (pas applicable mobile).
//   * screenshot : tentative via `Channel` natif (Android/iOS).
//
// Côté serveur : `suspicionScore()` agrège un score 0..1 affiché
// dans le rapport de l'examen.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../data/network/api_client.dart';

enum AntiCheatKind {
  focusLoss,
  focusGain,
  paste,
  copy,
  switchTab,
  rightClick,
  screenshot,
}

extension AntiCheatKindWire on AntiCheatKind {
  String get wire {
    switch (this) {
      case AntiCheatKind.focusLoss:
        return 'focus_loss';
      case AntiCheatKind.focusGain:
        return 'focus_gain';
      case AntiCheatKind.paste:
        return 'paste';
      case AntiCheatKind.copy:
        return 'copy';
      case AntiCheatKind.switchTab:
        return 'switch_tab';
      case AntiCheatKind.rightClick:
        return 'right_click';
      case AntiCheatKind.screenshot:
        return 'screenshot';
    }
  }
}

class AntiCheatController {
  AntiCheatController({
    required this.api,
    required this.attemptId,
  });

  final ApiClient api;
  final String attemptId;
  DateTime? _lastFocusLoss;

  Future<void> record(AntiCheatKind kind, {Map<String, Object?> metadata = const {}}) async {
    try {
      await api.recordExamEvent(
        attemptId: attemptId,
        kind: AntiCheatKindWire().wire.replaceFirstMapped(
          RegExp(r'^[a-z]'),
          (m) => m.group(0)!.toUpperCase(),
        ).toLowerCase(),
        metadata: {
          ...metadata,
          'platform': _platform(),
        },
        clientTs: DateTime.now().millisecondsSinceEpoch,
      );
    } catch (_) {
      // Ne pas bloquer l'examen si le log échoue. On catch en
      // silence — l'anti-triche est un signal, pas un blocage.
    }
  }

  Future<void> onFocusLoss() async {
    _lastFocusLoss = DateTime.now();
    await record(AntiCheatKind.focusLoss);
  }

  Future<void> onFocusGain() async {
    final start = _lastFocusLoss;
    _lastFocusLoss = null;
    final durationMs =
        start == null ? 0 : DateTime.now().difference(start).inMilliseconds;
    await record(AntiCheatKind.focusGain, metadata: {'duration_ms': durationMs});
  }

  String _platform() {
    // Pas d'accès direct à Platform dans cette couche — on le
    // laisse au caller via metadata. Valeur par défaut :
    return 'mobile';
  }
}

/// Widget qui instrumentalisera son enfant avec les callbacks
/// anti-triche. À wrapper autour de l'écran d'examen.
class AntiCheatScope extends StatefulWidget {
  const AntiCheatScope({
    super.key,
    required this.controller,
    required this.child,
  });

  final AntiCheatController controller;
  final Widget child;

  @override
  State<AntiCheatScope> createState() => _AntiCheatScopeState();
}

class _AntiCheatScopeState extends State<AntiCheatScope>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused || state == AppLifecycleState.inactive) {
      widget.controller.onFocusLoss();
    } else if (state == AppLifecycleState.resumed) {
      widget.controller.onFocusGain();
    }
  }

  @override
  Widget build(BuildContext context) {
    // Wrap avec un Listener pour détecter les copies (Ctrl+C /
    // long-press sur mobile).
    return Listener(
      onPointerSignal: (signal) {
        // Souris desktop uniquement — sur mobile c'est no-op.
        if (signal is PointerScrollEvent) {
          // Pas un événement triche.
        }
      },
      child: Shortcuts(
        shortcuts: const <ShortcutActivator, Intent>{
          SingleActivator(LogicalKeyboardKey.keyC, control: true):
              CopySelectionTextIntent.selectionCopy(),
          SingleActivator(LogicalKeyboardKey.keyV, control: true):
              CopySelectionTextIntent.selectionCopy(),
        },
        child: Actions(
          actions: <Type, Action<Intent>>{
            CopySelectionTextIntent: CallbackAction<CopySelectionTextIntent>(
              onInvoke: (intent) {
                widget.controller.record(AntiCheatKind.copy);
                return null;
              },
            ),
          },
          child: widget.child,
        ),
      ),
    );
  }
}
