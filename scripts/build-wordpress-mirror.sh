#!/usr/bin/env bash
set -euo pipefail

SOURCE="${MIRROR_SOURCE:-https://quantdeus.whf.bz}"
OUT="${1:-_site}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$OUT"
rm -rf "$OUT"/* "$OUT"/.[!.]* "$OUT"/..?* 2>/dev/null || true

wget \
  --mirror \
  --page-requisites \
  --convert-links \
  --adjust-extension \
  --no-parent \
  --execute robots=off \
  --restrict-file-names=windows \
  --domains quantdeus.whf.bz \
  --reject-regex='/(wp-admin(/|$)|wp-login[.]php($|[?]))' \
  --user-agent='QuantDeus-GitHub-Pages-Mirror/1.0' \
  --directory-prefix "$TMP" \
  "$SOURCE/"

ROOT="$TMP/quantdeus.whf.bz"
test -s "$ROOT/index.html"

cp -a "$ROOT/." "$OUT/"
touch "$OUT/.nojekyll"

# Keep mutations/auth/API actions on canonical WordPress instead of the static mirror.
python3 - "$OUT" "$SOURCE" <<'PY'
from pathlib import Path
import re, sys

root = Path(sys.argv[1])
source = sys.argv[2].rstrip("/")

for path in root.rglob("*.html"):
    text = path.read_text("utf-8", errors="ignore")

    # HTML form submissions belong to canonical production.
    text = re.sub(
        r'(?i)(\baction=["\'])/(?!/)',
        lambda m: m.group(1) + source + "/",
        text,
    )

    # Common WordPress authentication/admin endpoints must never resolve on Pages.
    text = re.sub(
        r'(?i)(["\'])/(wp-login\.php|wp-admin(?:/|["\']))',
        lambda m: m.group(1) + source + "/" + m.group(2),
        text,
    )

    marker = '<meta name="quantdeus-mirror" content="auto-sync">'
    if marker not in text:
        text = text.replace("</head>", f"{marker}\n</head>", 1)

    path.write_text(text, "utf-8")

print(f"mirror files: {sum(1 for p in root.rglob('*') if p.is_file())}")
PY

echo "Mirror built from $SOURCE into $OUT"
