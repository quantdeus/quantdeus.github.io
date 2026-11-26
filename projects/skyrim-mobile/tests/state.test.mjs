import test from "node:test";
import assert from "node:assert/strict";
import { createState, LANDMARKS, interact, attack, move, tick, usePotion, deserialize, serialize } from "../src/state.mjs";

test("quest runs from elder to completion in order", () => {
  const s = createState();
  const visit = (name) => Object.assign(s.player, LANDMARKS[name]);
  visit("gate"); interact(s); assert.equal(s.quest, "meet-elder");
  visit("elder"); interact(s); assert.equal(s.quest, "inspect-trail");
  visit("caravan"); interact(s); assert.equal(s.quest, "reach-ruins");
  visit("gate"); interact(s); assert.equal(s.quest, "recover-relic");
  visit("relic"); interact(s); assert.equal(s.quest, "return-elder");
  assert.equal(s.inventory.old_relic, 1);
  const restored = deserialize(serialize(s));
  visit.call(null, "elder"); // original state used for gold checks
  Object.assign(restored.player, LANDMARKS.elder);
  interact(restored); assert.equal(restored.quest, "complete");
  interact(restored); assert.equal(restored.player.gold, 100);
});

test("chest is never duplicated after save", () => {
  const s = createState(); Object.assign(s.player, LANDMARKS.chest);
  interact(s); assert.equal(s.inventory.potion, 2);
  const saved = deserialize(serialize(s)); interact(saved);
  assert.equal(saved.inventory.potion, 2);
  assert.equal(usePotion(saved), true);
  assert.equal(saved.inventory.potion, 1);
});

test("melee requires stamina + distance; defeat persists", () => {
  const s = createState(); assert.match(attack(s), /ближе/);
  Object.assign(s.player, LANDMARKS.enemy);
  for (let i = 0; i < 4; i++) { s.player.stamina = 100; attack(s); }
  assert.equal(s.flags.enemyDefeated, true);
  assert.equal(deserialize(serialize(s)).enemy.hp, 0);
  assert.equal(s.inventory.iron_ore, 1);
});

test("movement is frame bounded, and invalid save uses fresh state", () => {
  const s = createState(); move(s, 100, 100, 999);
  assert.ok(s.player.x <= 91 && s.player.z <= 91);
  tick(s, 999);
  assert.ok(s.timePlayed <= 0.100001);
  assert.deepEqual(deserialize('{"version":99}'), createState());
  assert.deepEqual(deserialize("{garbled"), createState());
});

test("saved fields are sanitized", () => {
  const s = createState(); s.player.x = 10000; s.player.hp = -900;
  const clean = deserialize(serialize(s));
  assert.equal(clean.player.x, 91);
  assert.equal(clean.player.hp, 1);
});
