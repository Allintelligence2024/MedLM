#!/usr/bin/env bash
#
# Active les workflows GitHub Actions (item P0-3 de l'audit 2026-08-01).
#
# POURQUOI CE SCRIPT EXISTE
# -------------------------
# Les workflows sont versionnés dans `ci/workflows/` et non dans
# `.github/workflows/`, où GitHub les exécuterait. Ce n'est pas un choix :
# l'application GitHub qui a produit ce lot n'a pas la permission
# `workflows`. Les deux voies ont été essayées et refusées :
#
#   git push  → ! [remote rejected] refusing to allow a GitHub App to
#               create or update workflow `.github/workflows/backend-ci.yml`
#               without `workflows` permission
#   API REST  → 403 "Resource not accessible by integration"
#
# C'est une limite de plateforme, pas du contenu : les fichiers sont
# valides (`tools/scripts/check_workflows.py` le vérifie à chaque garde).
#
# UTILISATION — depuis un compte humain, ou tout jeton portant le scope
# `workflow` :
#
#     ./tools/scripts/activate_workflows.sh          # déplace + commit
#     ./tools/scripts/activate_workflows.sh --push   # + pousse
#
# Le script est idempotent : relancé après activation, il ne fait rien.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."
REPO_ROOT="$PWD"

SRC="ci/workflows"
DST=".github/workflows"
DO_PUSH=0
[[ "${1:-}" == "--push" ]] && DO_PUSH=1

echo "════ Activation des workflows GitHub Actions ════"
echo

# ── Déjà fait ? ─────────────────────────────────────────────────────────
if [[ -d "$DST" ]] && compgen -G "$DST/*.yml" > /dev/null; then
  echo "✓ Les workflows sont déjà dans $DST — rien à faire."
  ls -1 "$DST"/*.yml | sed 's|^|  · |'
  exit 0
fi

if [[ ! -d "$SRC" ]] || ! compgen -G "$SRC/*.yml" > /dev/null; then
  echo "❌ Aucun workflow trouvé dans $SRC."
  exit 1
fi

# Un push qui contient un workflow sans permission est rejeté dans son
# intégralité. Refuser d'abord les commits ordinaires non poussés évite de
# les entraîner dans cet échec : ils doivent être poussés séparément.
if [[ $DO_PUSH -eq 1 ]]; then
  BRANCH="$(git branch --show-current)"
  git fetch -q origin "$BRANCH" || true
  if git show-ref --verify --quiet "refs/remotes/origin/$BRANCH" &&
     [[ -n "$(git log "origin/$BRANCH..HEAD" --oneline)" ]]; then
    echo "❌ Des commits ne sont pas encore poussés sur origin/$BRANCH."
    echo "   Poussez-les d'abord sans workflow, puis relancez ce script."
    exit 1
  fi
fi

# ── Vérifier avant de déplacer ──────────────────────────────────────────
# Activer un workflow syntaxiquement faux, c'est peindre l'onglet
# Actions en rouge dès le premier push.
echo "▸ Validation préalable"
if command -v python3 > /dev/null; then
  python3 tools/scripts/check_workflows.py || {
    echo
    echo "❌ Validation échouée — activation annulée."
    exit 1
  }
else
  echo "  ⚠ python3 absent : validation ignorée"
fi
echo

# ── Déplacement ─────────────────────────────────────────────────────────
echo "▸ Déplacement $SRC → $DST"
mkdir -p "$DST"
for f in "$SRC"/*.yml; do
  git mv "$f" "$DST/$(basename "$f")"
  echo "  · $(basename "$f")"
done

# Le README d'installation n'a plus d'objet une fois l'installation faite.
[[ -f ci/README.md ]] && git rm -q ci/README.md
rmdir "$SRC" ci 2> /dev/null || true
echo

# ── Commit ──────────────────────────────────────────────────────────────
echo "▸ Commit"
git commit -q -m "P0-3 : activer les workflows GitHub Actions

Déplacement de ci/workflows/ vers .github/workflows/ : l'emplacement
inerte devient l'emplacement exécuté.

Ces fichiers attendaient depuis le lot d'audit du 2026-08-01, l'app
GitHub de la session n'ayant pas la permission 'workflows' (git push et
API REST tous deux refusés). Activés par $(git config user.name || echo 'un compte disposant du scope workflow')."
echo "  ✓ $(git log --oneline -1)"
echo

# ── Push ────────────────────────────────────────────────────────────────
if [[ $DO_PUSH -eq 1 ]]; then
  BRANCH="$(git branch --show-current)"
  echo "▸ Push vers origin/$BRANCH"
  git push origin "$BRANCH"
  echo
  echo "✅ Workflows actifs. Suivre le premier run :"
  echo "   gh run list --limit 5"
else
  echo "✅ Prêt. Pousser avec :"
  echo "   git push origin $(git branch --show-current)"
fi
