/// Facultés de médecine reconnues — miroir client de l'allow-list
/// serveur (`backend/src/partnerships/faculties.ts`).
///
/// La source de vérité reste le serveur : cette liste sert à proposer
/// un choix fermé à l'inscription plutôt qu'un champ libre, ce qui
/// évite les « Alger », « alger », « Fac Alger » qui rendraient tout
/// classement par faculté inexploitable.
///
/// La parité entre les deux listes (contenu ET ordre), ainsi que les
/// bornes d'année d'étude et les niveaux d'expérience, sont vérifiées
/// par `tools/scripts/check_faculties_parity.py`.
library;

const List<String> kFacultiesDz = <String>[
  'Alger',
  'Oran',
  'Constantine',
  'Sidi Bel Abbes',
  'Tlemcen',
  'Batna',
  'Setif',
  'Blida',
  'Annaba',
  'Tizi Ouzou',
];

/// Années d'étude acceptées par le backend (StudyYearAnswer : 1..7).
const List<int> kStudyYears = <int>[1, 2, 3, 4, 5, 6, 7];

/// Niveaux déclarés (ExperienceLevelAnswer).
const List<String> kExperienceLevels = <String>[
  'beginner',
  'intermediate',
  'advanced',
];

bool isKnownFaculty(String name) {
  final normalized = name.trim().toLowerCase();
  return kFacultiesDz.any((f) => f.toLowerCase() == normalized);
}
