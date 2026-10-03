#!/usr/bin/env bash
set -euo pipefail

SOURCE="${MIRROR_SOURCE:-https://quantdeus.whf.bz}"
OUT="${1:-_site}"
TMP="$(mktemp -d)"
URLS="$TMP/urls.txt"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$OUT"
rm -rf "$OUT"/* "$OUT"/.[!.]* "$OUT"/..?* 2>/dev/null || true

python3 - "$SOURCE" "$URLS" <<'PY'
from urllib.parse import urlparse
from urllib.request import Request, urlopen
import sys, xml.etree.ElementTree as ET

source = sys.argv[1].rstrip("/")
outfile = sys.argv[2]
host = urlparse(source).netloc
seen_sitemaps = set()
urls = {source + "/"}

def fetch(url):
    req = Request(url, headers={"User-Agent": "QuantDeus-GitHub-Pages-Mirror/1.0"})
    with urlopen(req, timeout=20) as r:
        return r.read()

def walk_sitemap(url):
    if url in seen_sitemaps:
        return
    seen_sitemaps.add(url)
    try:
        root = ET.fromstring(fetch(url))
    except Exception:
        return
    tag = root.tag.rsplit("}", 1)[-1]
    locs = [n.text.strip() for n in root.iter() if n.tag.rsplit("}",1)[-1] == "loc" and n.text]
    if tag == "sitemapindex":
        for loc in locs:
            if urlparse(loc).netloc == host:
                walk_sitemap(loc)
    else:
        for loc in locs:
            p = urlparse(loc)
            if p.netloc == host and not p.path.startswith(("/wp-admin", "/wp-login.php")):
                urls.add(loc)

walk_sitemap(source + "/wp-sitemap.xml")
if len(urls) > 1000:
    raise SystemExit(f"refusing unexpectedly large sitemap: {len(urls)} URLs")

with open(outfile, "w", encoding="utf-8") as f:
    for url in sorted(urls):
        f.write(url + "\n")
print(f"mirror URLs: {len(urls)}")
PY

wget \
  --timeout=15 \
  --tries=2 \
  --waitretry=1 \
  --page-requisites \
  --convert-links \
  --adjust-extension \
  --execute robots=off \
  --restrict-file-names=windows \
  --domains quantdeus.whf.bz \
  --user-agent='QuantDeus-GitHub-Pages-Mirror/1.0' \
  --directory-prefix "$TMP/site" \
  --input-file "$URLS"

ROOT="$TMP/site/quantdeus.whf.bz"
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

    text = re.sub(
        r'(?i)(\baction=["\'])/(?!/)',
        lambda m: m.group(1) + source + "/",
        text,
    )
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


# Always ship a zero-dependency emergency entry point with the Pages artifact.
# It intentionally does not depend on WordPress, JS, CSS, fonts, images, or third-party CDNs.
mkdir -p "$OUT/lite"
cat > "$OUT/lite/index.html" <<'HTML'
<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="quantdeus-mirror" content="emergency-lite">
<title>QuantDeus Lite — аварийный вход</title>
</head>
<body>
<main>
<h1>QuantDeus Lite</h1>
<p><strong>Аварийный вход в QuantDeus.</strong> Эта страница работает без JavaScript, внешних таблиц стилей, шрифтов, изображений и аналитики.</p>
<p>Если основной портал не открывается или отображает белый экран:</p>
<ul>
<li><a href="https://quantdeus.whf.bz/">Основной QuantDeus</a></li>
<li><a href="https://quantdeus.whf.bz/lite/">WordPress Lite</a></li>
<li><a href="https://vk.ru/neon_y2k">QuantDeus в VK</a></li>
<li><a href="https://t.me/quantdeus_chat">QuantDeus Telegram</a></li>
</ul>
<p>Этот аварийный документ статичен и хранится независимо в GitHub Pages mirror.</p>
</main>
</body>
</html>
HTML
printf 'ok\n' > "$OUT/healthz.txt"

echo "Mirror built from $SOURCE into $OUT"
