import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import forum from "../api/quantdeus/community.js";
import orders from "../api/quantdeus/orders.js";

globalThis.crypto ||= webcrypto;
const botToken = "test-bot-token";
const product = { id: "sample", name: "Sample", price_rub: 120, available: true };
const quoteProduct = { id: "business-automation", name: "Автоматизация бизнеса", pricing_mode: "quote", price_rub: null, available: true };
let savedOrder = null, writes = 0;

function resMock() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; }
  };
}
async function signedInitData(id) {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "Test" }) });
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const keyFor = async raw => crypto.subtle.importKey("raw", Buffer.from(raw), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const secret = await crypto.subtle.sign("HMAC", await keyFor("WebAppData"), Buffer.from(botToken));
  const sig = await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), Buffer.from(check));
  params.set("hash", Buffer.from(sig).toString("hex"));
  return params.toString();
}
function mockFetch() {
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url), path = "/" + parsed.pathname.split("/").slice(4).join("/");
    if (path === "/contents/store/products.json") {
      return Response.json({ content: Buffer.from(JSON.stringify({ products: [product, quoteProduct] })).toString("base64"), sha: "catalog" });
    }
    if (path.startsWith("/contents/quantdeus-store/orders/") && options.method === "PUT") {
      writes++;
      savedOrder = JSON.parse(Buffer.from(JSON.parse(options.body).content, "base64").toString("utf8"));
      return Response.json({ content: { sha: `sha-${writes}` } });
    }
    if (path.startsWith("/contents/quantdeus-store/orders/") && savedOrder) {
      return Response.json({ content: Buffer.from(JSON.stringify(savedOrder)).toString("base64"), sha: `sha-${writes}` });
    }
    return Response.json({ message: "Not Found" }, { status: 404 });
  };
}

test.beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = botToken;
  process.env.QUANTDEUS_GITHUB_TOKEN = "test-github-token";
  process.env.QUANTDEUS_ORDER_HMAC_SECRET = "test-hmac-secret-long-enough";
  process.env.VERCEL_ENV = "production";
  process.env.QUANTDEUS_OWNER_TELEGRAM_IDS = "9001";
  process.env.QUANTDEUS_ADMIN_TELEGRAM_IDS = "9002";
  process.env.QUANTDEUS_MODERATOR_TELEGRAM_IDS = "9003";
  process.env.QUANTDEUS_ORDERS_REPOSITORY = "quantdeus/quantdeus_core.pulse";
  savedOrder = null; writes = 0;
});

test("guest cannot moderate a forum thread", async () => {
  let githubCalls = 0;
  globalThis.fetch = async () => { githubCalls++; throw new Error("unexpected GitHub call"); };
  const res = resMock();
  await forum({ method: "POST", headers: { "x-telegram-init-data": await signedInitData(1234) }, body: { action: "moderate", command: "lock", thread_id: 3 } }, res);
  assert.equal(res.statusCode, 403, JSON.stringify(res.body));
  assert.equal(res.body.error, "forbidden");
  assert.equal(githubCalls, 0);
});

test("order amount comes from the server catalog and buyer cannot confirm payment", async () => {
  mockFetch();
  const initData = await signedInitData(1234), created = resMock();
  await orders({ method: "POST", headers: { "x-telegram-init-data": initData }, body: { action: "create", product_id: "sample", amount: 1 } }, created);
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.order.amount, 120);
  assert.equal(savedOrder.amount, 120);
  const confirm = resMock();
  await orders({ method: "POST", headers: { "x-telegram-init-data": initData }, body: { action: "confirm", order_id: created.body.order.id, note: "test" } }, confirm);
  assert.equal(confirm.statusCode, 403);
  assert.equal(writes, 1);
});



test("quote service creates an inquiry with no payment amount and persists contact context", async () => {
  mockFetch();
  const initData = await signedInitData(1234), created = resMock();
  await orders({
    method: "POST",
    headers: { "x-telegram-init-data": initData },
    body: { action: "create", product_id: "business-automation", note: "Нужно автоматизировать обработку заявок и отчётность." }
  }, created);
  assert.equal(created.statusCode, 201, JSON.stringify(created.body));
  assert.equal(created.body.order.pricing_mode, "quote");
  assert.equal(created.body.order.status, "inquiry_created");
  assert.equal(created.body.order.amount, null);
  assert.equal(created.body.payment, null);
  assert.equal(savedOrder.amount, null);
  assert.equal(savedOrder.status, "inquiry_created");
  assert.match(savedOrder.request_note, /автоматизировать/);
  assert.equal(savedOrder.contact.telegram_user_id, "1234");

  const pay = resMock();
  await orders({
    method: "POST",
    headers: { "x-telegram-init-data": initData },
    body: { action: "payment_submitted", order_id: created.body.order.id }
  }, pay);
  assert.equal(pay.statusCode, 409);
  assert.equal(pay.body.error, "payment_not_applicable");

  const cancel = resMock();
  await orders({
    method: "POST",
    headers: { "x-telegram-init-data": initData },
    body: { action: "cancel", order_id: created.body.order.id }
  }, cancel);
  assert.equal(cancel.statusCode, 200, JSON.stringify(cancel.body));
  assert.equal(cancel.body.order.status, "cancelled");
});
\ntest("payment submitted is idempotent and never marks an order paid", async () => {
  mockFetch();
  const initData = await signedInitData(1234), created = resMock();
  await orders({ method: "POST", headers: { "x-telegram-init-data": initData }, body: { action: "create", product_id: "sample" } }, created);
  assert.equal(created.statusCode, 201, JSON.stringify(created.body));
  const id = created.body.order.id;
  const first = resMock();
  await orders({ method: "POST", headers: { "x-telegram-init-data": initData }, body: { action: "payment_submitted", order_id: id } }, first);
  assert.equal(first.statusCode, 200, JSON.stringify(first.body));
  assert.equal(first.body.order.status, "payment_pending");
  const previousWrites = writes, second = resMock();
  await orders({ method: "POST", headers: { "x-telegram-init-data": initData }, body: { action: "payment_submitted", order_id: id } }, second);
  assert.equal(second.body.idempotent, true);
  assert.equal(second.body.order.status, "payment_pending");
  assert.equal(writes, previousWrites);
});

test("authorized admin can confirm a pending order with an audit note", async () => {
  mockFetch();
  const buyerData = await signedInitData(1234), created = resMock();
  await orders({ method: "POST", headers: { "x-telegram-init-data": buyerData }, body: { action: "create", product_id: "sample" } }, created);
  const id = created.body.order.id, pending = resMock();
  await orders({ method: "POST", headers: { "x-telegram-init-data": buyerData }, body: { action: "payment_submitted", order_id: id } }, pending);
  const confirm = resMock();
  await orders({ method: "POST", headers: { "x-telegram-init-data": await signedInitData(9002) }, body: { action: "confirm", order_id: id, note: "Поступление проверено" } }, confirm);
  assert.equal(confirm.statusCode, 200, JSON.stringify(confirm.body));
  assert.equal(confirm.body.order.status, "paid");
  assert.equal(savedOrder.audit.at(-1).actor_role, "admin");
  assert.equal(savedOrder.audit.at(-1).note, "Поступление проверено");
});

test("preview deployments reject writes even with valid Telegram auth", async () => {
  mockFetch(); process.env.VERCEL_ENV = "preview";
  const res = resMock();
  await forum({ method: "POST", headers: { "x-telegram-init-data": await signedInitData(1234) }, body: { action: "thread", title: "Test topic", category: "community", text: "A long enough test message" } }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, "preview_read_only");
});


test("anonymous guest write is denied with 401 before GitHub mutation", async () => {
  let githubCalls = 0;
  globalThis.fetch = async () => { githubCalls++; throw new Error("unexpected GitHub call"); };
  const res = resMock();
  await forum({ method: "POST", headers: {}, body: { action: "thread", title: "Guest topic", category: "community", text: "Guest must not be able to publish" } }, res);
  assert.equal(res.statusCode, 401, JSON.stringify(res.body));
  assert.equal(res.body.error, "telegram_auth_invalid");
  assert.equal(githubCalls, 0);
});

test("two authenticated users can create then reply to one persisted forum thread", async () => {
  let issue = null;
  const comments = [];
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url), path = "/" + parsed.pathname.split("/").slice(4).join("/");
    if (path === "/issues" && options.method === "POST") {
      const body = JSON.parse(options.body);
      issue = { number: 777, title: body.title, body: body.body, state: "open", html_url: "https://github.test/issues/777" };
      return Response.json(issue);
    }
    if (path === "/issues/777" && (!options.method || options.method === "GET")) return Response.json(issue);
    if (path === "/issues/777/comments" && options.method === "POST") {
      const body = JSON.parse(options.body);
      const reply = { id: 991, created_at: new Date().toISOString(), body: body.body };
      comments.push(reply);
      return Response.json(reply);
    }
    if (path === "/issues/777/comments" && (!options.method || options.method === "GET")) {
      return Response.json(comments);
    }
    return Response.json({ message: "Not Found" }, { status: 404 });
  };
  const creator = resMock();
  await forum({ method: "POST", headers: { "x-telegram-init-data": await signedInitData(1111) }, body: { action: "thread", title: "Two user smoke", category: "community", text: "First authenticated user creates the thread." } }, creator);
  assert.equal(creator.statusCode, 201, JSON.stringify(creator.body));
  assert.equal(creator.body.thread.number, 777);
  const replier = resMock();
  await forum({ method: "POST", headers: { "x-telegram-init-data": await signedInitData(2222) }, body: { action: "reply", thread_id: 777, text: "Second authenticated user replies." } }, replier);
  assert.equal(replier.statusCode, 201, JSON.stringify(replier.body));
  assert.equal(comments.length, 1);
  assert.match(comments[0].body, /Second authenticated user replies/);

  const reread = resMock();
  await forum({ method: "GET", query: { id: "777" }, headers: {} }, reread);
  assert.equal(reread.statusCode, 200, JSON.stringify(reread.body));
  assert.equal(Number(reread.body.thread.number), 777);
  assert.equal(reread.body.replies.length, 1);
});

test("moderator lock writes an audit marker while category move stays forbidden", async () => {
  const issue = { number: 778, title: "[FORUM] Moderation smoke", body: "Target\n\n<!-- quantdeus-forum:v1 -->\n<!-- qd:category=community -->", state: "open" };
  let patched = null;
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url), path = "/" + parsed.pathname.split("/").slice(4).join("/");
    if (path === "/issues/778" && (!options.method || options.method === "GET")) return Response.json(issue);
    if (path === "/issues/778" && options.method === "PATCH") {
      patched = JSON.parse(options.body);
      return Response.json({ ...issue, ...patched });
    }
    return Response.json({ message: "Not Found" }, { status: 404 });
  };
  const auth = await signedInitData(9003);
  const lock = resMock();
  await forum({ method: "POST", headers: { "x-telegram-init-data": auth }, body: { action: "moderate", command: "lock", thread_id: 778 } }, lock);
  assert.equal(lock.statusCode, 200, JSON.stringify(lock.body));
  assert.equal(patched.state, "closed");
  assert.match(patched.body, /qd-audit: action=lock/);
  assert.match(patched.body, /role=moderator/);
  const move = resMock();
  await forum({ method: "POST", headers: { "x-telegram-init-data": auth }, body: { action: "moderate", command: "move", thread_id: 778, category: "science" } }, move);
  assert.equal(move.statusCode, 403, JSON.stringify(move.body));
});

test("persisted order can be re-read after audited owner confirmation", async () => {
  mockFetch();
  process.env.SBP_PHONE = "+70000000000";
  process.env.SBP_BANK = "Test Bank";
  process.env.SBP_RECIPIENT = "Test Recipient";
  const buyer = await signedInitData(1234);
  const created = resMock();
  await orders({ method: "POST", headers: { "x-telegram-init-data": buyer }, body: { action: "create", product_id: "sample" } }, created);
  const id = created.body.order.id;
  const pending = resMock();
  await orders({ method: "POST", headers: { "x-telegram-init-data": buyer }, body: { action: "payment_submitted", order_id: id } }, pending);
  const paid = resMock();
  await orders({ method: "POST", headers: { "x-telegram-init-data": await signedInitData(9001) }, body: { action: "confirm", order_id: id, note: "Owner smoke confirmation" } }, paid);
  assert.equal(paid.body.order.status, "paid");
  assert.equal(savedOrder.audit.at(-1).note, "Owner smoke confirmation");
  const reread = resMock();
  await orders({ method: "GET", query: { id }, headers: { "x-telegram-init-data": buyer } }, reread);
  assert.equal(reread.statusCode, 200, JSON.stringify(reread.body));
  assert.equal(reread.body.order.status, "paid");
  assert.equal(reread.body.payment.method, "СБП");
  delete process.env.SBP_PHONE;
  delete process.env.SBP_BANK;
  delete process.env.SBP_RECIPIENT;
});
