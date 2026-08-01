// Facultés de médecine reconnues — Phase 20.4.
//
// Allow-list SOURCE UNIQUE (recoupée avec le contenu par
// tools/scripts/check_partnerships.py) : un partenariat — et toute
// provenance « faculty » du contenu — ne peuvent référencer qu'une
// faculté de cette liste. Ajout = décision éditoriale + changelog.

export const FACULTIES_DZ: readonly string[] = Object.freeze([
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
] as const);

export function isKnownFaculty(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return FACULTIES_DZ.some((f) => f.toLowerCase() === normalized);
}
