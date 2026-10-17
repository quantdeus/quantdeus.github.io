import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { githubPermission, roleForGithubPermission, githubAuthConfig } from "../lib/github-auth.js";
import { telegramSiteOrigin } from "../lib/telegram-bot-auth.js";

test("Новый основной адрес для входа Telegram и GitHub", () => {
  const old = process.env.QUANTDEUS_CANONICAL_ORIGIN;
  delete process.env.QUANTDEUS_CANONICAL_ORIGIN;
  try {
    assert.equal(telegramSiteOrigin(), "https://quantdeus.ru");
    assert.equal(githubAuthConfig().canonical_origin, "https://quantdeus.ru");
  } finally {
    if (old !== undefined) process.env.QUANTDEUS_CANONICAL_ORIGIN = old;
  }
});

test("Главный администратор выбирается только из разрешённых сотрудников", () => {
  const old = process.env.QUANTDEUS_GITHUB_ADMIN_ALLOWLIST;
  process.env.QUANTDEUS_GITHUB_ADMIN_ALLOWLIST = "goplay1937";
  try {
    assert.equal(roleForGithubPermission("write", "goplay1937"), "administrator");
    assert.equal(roleForGithubPermission("write", "other-user"), "qd_moderator");
    assert.equal(roleForGithubPermission("read", "goplay1937"), "qd_member");
    assert.equal(roleForGithubPermission("admin", "repository-admin"), "administrator");
  } finally {
    if (old === undefined) delete process.env.QUANTDEUS_GITHUB_ADMIN_ALLOWLIST;
    else process.env.QUANTDEUS_GITHUB_ADMIN_ALLOWLIST = old;
  }
});

test("Сервисный токен не передаёт свои права GitHub пользователю", async t => {
  const oldFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = oldFetch; });
  const urls = [];
  globalThis.fetch = async url => {
    urls.push(String(url));
    if (String(url).endsWith("/collaborators/member/permission")) {
      return { ok: true, json: async () => ({ permission: "write" }) };
    }
    return { ok: true, json: async () => ({ permissions: { admin: true } }) };
  };
  const permission = await githubPermission("member", {
    repository: "quantdeus/quantdeus.github.io",
    verifier_token: "fake-service-token"
  });
  assert.equal(permission, "write");
  assert.equal(urls.length, 1);
  assert.match(urls[0], /collaborators\/member\/permission$/);
});

test("Старая цель Vercel не возвращается", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const targets = JSON.stringify(config.rewrites);
  assert.ok(!targets.includes("quantdeus.whf.bz"));
  assert.ok(targets.includes("https://quantdeus.ru"));
});
