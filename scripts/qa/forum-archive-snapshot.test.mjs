import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const archive = readFileSync(new URL("../../wordpress/src/quantdeus-forum-recovery/archive-source-20261101.html", import.meta.url), "utf8");
const importer = readFileSync(new URL("../../wordpress/src/quantdeus-forum-recovery/quantdeus-forum-recovery.php", import.meta.url), "utf8");

function sections(html) {
  return [...html.matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/gi)].map((match) => ({
    title: (match[1].match(/<h2[^>]*>([\s\S]*?)<\/h2>/i) || [,""])[1].replace(/<[^>]*>/g, "").trim(),
    topics: [...match[1].matchAll(/<details\b/gi)].length,
  }));
}

test("preserved public archive is five sections with 32 topic previews", () => {
  const result = sections(archive);
  assert.deepEqual(result.map((s) => s.topics), [2, 1, 1, 1, 27]);
  assert.equal(result.reduce((sum, s) => sum + s.topics, 0), 32);
  assert.equal(new Set(result.map((s) => s.title)).size, 5);
  assert.match(result[0].title, /Общее пространство QuantDeus/);
  assert.match(result[4].title, /GitHub Issues/);
});

test("unverified 189 historical replies have not been invented", () => {
  assert.match(archive, /189 ответов/);
  assert.doesNotMatch(archive, /<article[^>]*class=["'][^"']*bbp-reply/i);
  assert.match(importer, /Исторические ответы требуют отдельного восстановления/);
});

test("importer is manual, admin-only, nonce-guarded and repeatable", () => {
  assert.match(importer, /current_user_can\('manage_options'\)/);
  assert.match(importer, /check_admin_referer\('qdfr_import'\)/);
  assert.match(importer, /_qdfr_archive_key/);
  assert.match(importer, /qdfr_existing\('topic',\s*\$key\)/);
  assert.match(importer, /qdfr_bbpress_ready\(\)/);
  assert.match(importer, /\[bbp-forum-index\]/);
  assert.doesNotMatch(importer, /wp_delete_post\s*\(/);
});
