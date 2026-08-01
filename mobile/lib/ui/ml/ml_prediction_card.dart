// MlPredictionCard — carte « prédiction d'examen blanc » (Phase 20.3).
//
// Branchée sur GET /v1/ml/mock-exam-prediction via MlRepository.
// Règles :
//   * explicable (v2 §13) : les features conduisant le score et la
//     version du modèle sont affichées — jamais de chiffre orphelin ;
//   * offline-first : erreur/offline → la carte s'efface silencieusement
//     (mockExamPredictionOrNull ne throw jamais) ;
//   * refus k-anonymat : predictible=false n'est PAS une erreur — la
//     raison servie est affichée telle quelle (déjà localisée).
library;

import 'package:flutter/material.dart';

import '../../data/repositories/ml/ml_models.dart';
import '../../data/repositories/ml/ml_repository.dart';

class MlPredictionCard extends StatefulWidget {
  const MlPredictionCard({super.key, required this.repository});

  final MlRepository repository;

  @override
  State<MlPredictionCard> createState() => _MlPredictionCardState();
}

class _MlPredictionCardState extends State<MlPredictionCard> {
  Future<MockExamPrediction?>? _future;

  @override
  void initState() {
    super.initState();
    _future = widget.repository.mockExamPredictionOrNull();
  }

  /// Permet de re-tenter après un retour réseau (pull-to-refresh parent).
  void reload() {
    setState(() {
      _future = widget.repository.mockExamPredictionOrNull();
    });
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<MockExamPrediction?>(
      future: _future,
      builder: (context, snap) {
        final prediction = snap.data;
        // Chargement ou échec silencieux : rien à montrer.
        if (prediction == null) return const SizedBox.shrink();
        final scheme = Theme.of(context).colorScheme;
        return Card(
          elevation: 0,
          color: scheme.secondaryContainer,
          margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: prediction.predictible
                ? _buildPrediction(scheme, prediction)
                : _buildRefusal(scheme, prediction),
          ),
        );
      },
    );
  }

  Widget _buildPrediction(ColorScheme scheme, MockExamPrediction p) {
    final score = p.scorePercent ?? 0;
    final margin = p.marginPercent ?? 0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.insights, size: 20, color: scheme.onSecondaryContainer),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                'Examen blanc : score estimé',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  color: scheme.onSecondaryContainer,
                ),
              ),
            ),
            _BandChip(band: p.band),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          '${score.toStringAsFixed(1)} % ± ${margin.toStringAsFixed(1)}',
          style: TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.bold,
            color: scheme.onSecondaryContainer,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          _explainFeatures(p.features),
          style: TextStyle(
            fontSize: 12,
            color: scheme.onSecondaryContainer.withOpacity(0.75),
          ),
        ),
        const SizedBox(height: 2),
        Text(
          'Modèle ${p.modelVersion} · fenêtre ${p.windowDays} j',
          style: TextStyle(
            fontSize: 11,
            color: scheme.onSecondaryContainer.withOpacity(0.6),
          ),
        ),
      ],
    );
  }

  Widget _buildRefusal(ColorScheme scheme, MockExamPrediction p) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(Icons.hourglass_empty, size: 20, color: scheme.onSecondaryContainer),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            p.reason ?? 'Pas encore assez de données pour prédire.',
            style: TextStyle(
              fontSize: 13,
              color: scheme.onSecondaryContainer,
            ),
          ),
        ),
      ],
    );
  }

  /// Explicabilité : traduit les features en une phrase lisible.
  String _explainFeatures(ScoreFeatures f) {
    return 'Basé sur ${f.reviews30d} revues sur 30 j : '
        'réussite ${(f.accuracy30d * 100).round()} %, '
        'couverture ${(f.coverageRatio * 100).round()} %, '
        'cartes matures ${(f.matureRatio * 100).round()} %, '
        'série ${f.streakDays} j.';
  }
}

class _BandChip extends StatelessWidget {
  const _BandChip({this.band});

  final ScoreBand? band;

  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (band) {
      ScoreBand.low => ('à risque', Colors.red.shade700),
      ScoreBand.medium => ('moyen', Colors.amber.shade800),
      ScoreBand.high => ('solide', Colors.green.shade700),
      null => ('—', Colors.grey),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.4)),
      ),
      child: Text(
        label,
        style: TextStyle(fontSize: 12, color: color, fontWeight: FontWeight.w600),
      ),
    );
  }
}
