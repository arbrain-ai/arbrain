#!/bin/sh
# Install git hooks for this repo.
# Run once per fresh clone: bash .claude/hooks/install.sh

set -e
cd "$(dirname "$0")/../.."   # .claude/hooks -> repo root

if ! command -v gitleaks > /dev/null 2>&1; then
  echo "gitleaks not installed. Install: brew install gitleaks"
  exit 1
fi

cat > .git/hooks/pre-commit <<'HOOK'
#!/bin/sh
if ! command -v gitleaks > /dev/null 2>&1; then
  echo "[pre-commit] gitleaks missing — skipping. brew install gitleaks"
  exit 0
fi

gitleaks protect --staged --redact --no-banner --config .claude/gitleaks.toml --gitleaks-ignore-path .gitleaksignore
status=$?

if [ $status -ne 0 ]; then
  echo ""
  echo "[pre-commit] BLOCKED: secrets in staged changes."
  echo "[pre-commit] Move them to .env.local and re-commit."
  exit 1
fi

exit 0
HOOK

chmod +x .git/hooks/pre-commit
echo "Pre-commit hook installed at .git/hooks/pre-commit"
