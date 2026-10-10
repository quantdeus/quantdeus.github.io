// Deterministic offline RPG model: no renderer, DOM, network, or platform dependency.
export const SAVE_VERSION = 1;
export const LANDMARKS = Object.freeze({
  elder: { x: 12, z: 14 },
  caravan: { x: 29, z: 28 },
  gate: { x: 47, z: 49 },
  relic: { x: 54, z: 54 },
  enemy: { x: 42, z: 44 },
  chest: { x: 20, z: 22 }
});
export const QUEST_STEPS = Object.freeze([
  "meet-elder", "inspect-trail", "reach-ruins",
  "recover-relic", "return-elder", "complete"
]);
export const QUEST_HINTS = Object.freeze({
  "meet-elder": "Поговори со старейшиной у деревни",
  "inspect-trail": "Осмотри следы пропавшего каравана",
  "reach-ruins": "Доберись до старинных ворот",
  "recover-relic": "Забери артефакт в руинах",
  "return-elder": "Верни артефакт старейшине",
  "complete": "Караван спасён! История завершена"
});
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const terrainHeight = (x, z) =>
  Math.sin(x * 0.037) * 1.35 + Math.cos(z * 0.044) * 1.05 +
  Math.sin((x + z) * 0.019) * 0.75;
export function createState() {
  return {
    version: SAVE_VERSION,
    player: { x: 8, z: 9, yaw: 0, hp: 100, stamina: 100, gold: 0, level: 1 },
    inventory: { iron_sword: 1 },
    quest: "meet-elder",
    flags: { chestOpened: false, relicTaken: false, enemyDefeated: false },
    enemy: { hp: 80, cooldown: 0 },
    dayTime: 0.29,
    timePlayed: 0,
    event: "Путь героя начинается в Долине Северного Ветра."
  };
}
export function move(state, forward, right, dt) {
  const p = state.player;
  const delta = clamp(Number(dt) || 0, 0, 0.1);
  const length = Math.hypot(forward, right);
  if (!Number.isFinite(length) || length < 0.05) return state;
  const f = forward / Math.max(1, length), r = right / Math.max(1, length);
  const speed = p.stamina > 0 ? 6 : 3.5;
  p.x = clamp(p.x + (Math.sin(p.yaw) * f + Math.cos(p.yaw) * r) * speed * delta, -91, 91);
  p.z = clamp(p.z + (Math.cos(p.yaw) * f - Math.sin(p.yaw) * r) * speed * delta, -91, 91);
  p.stamina = clamp(p.stamina - 2.5 * delta, 0, 100);
  return state;
}
export function tick(state, dt) {
  const delta = clamp(Number(dt) || 0, 0, 0.1);
  state.dayTime = (state.dayTime + delta / 600) % 1;
  state.timePlayed += delta;
  state.player.stamina = clamp(state.player.stamina + delta * 10, 0, 100);
  state.enemy.cooldown = Math.max(0, state.enemy.cooldown - delta);
  // Deliberately deterministic: enemy can retaliate while player is in melee range.
  if (!state.flags.enemyDefeated && distance(state.player, LANDMARKS.enemy) <= 3.4 && state.enemy.cooldown === 0) {
    state.player.hp = Math.max(0, state.player.hp - 7);
    state.enemy.cooldown = 1.5;
    state.event = "Разбойник атакует! Нажми удар.";
  }
  if (state.player.hp === 0) {
    state.player.x = 8; state.player.z = 9;
    state.player.hp = 100;
    state.event = "Ты очнулся у деревни.";
  }
  return state;
}
export function attack(state) {
  if (state.flags.enemyDefeated) return "Противник уже побеждён.";
  if (distance(state.player, LANDMARKS.enemy) > 3.6) return "Для атаки подойди ближе.";
  if (state.player.stamina < 12) return "Не хватает выносливости.";
  state.player.stamina -= 12;
  state.enemy.hp = Math.max(0, state.enemy.hp - 24);
  if (state.enemy.hp === 0) {
    state.flags.enemyDefeated = true;
    state.inventory.iron_ore = (state.inventory.iron_ore || 0) + 1;
    state.event = "Разбойник повержен. Получена железная руда.";
  } else state.event = "Попадание мечом! Здоровье врага: " + state.enemy.hp;
  return state.event;
}
export function interact(state) {
  const near = (name, radius = 5) => distance(state.player, LANDMARKS[name]) <= radius;
  if (near("elder")) {
    if (state.quest === "meet-elder") {
      state.quest = "inspect-trail";
      state.event = "Старейшина: Караван исчез за перевалом. Найди следы.";
    } else if (state.quest === "return-elder") {
      state.quest = "complete";
      state.player.gold += 100;
      state.event = "Старейшина: Долина у тебя в долгу. Награда: 100 монет.";
    } else state.event = "Старейшина: Береги себя в дороге.";
  } else if (near("caravan") && state.quest === "inspect-trail") {
    state.quest = "reach-ruins";
    state.event = "Следы ведут к древним руинам на востоке.";
  } else if (near("gate") && state.quest === "reach-ruins") {
    state.quest = "recover-relic";
    state.event = "На воротах высечены знаки. Артефакт должен быть рядом.";
  } else if (near("relic") && state.quest === "recover-relic") {
    state.quest = "return-elder";
    state.flags.relicTaken = true;
    state.inventory.old_relic = 1;
    state.event = "Древний артефакт найден. Верни его старейшине.";
  } else if (near("chest") && !state.flags.chestOpened) {
    state.flags.chestOpened = true;
    state.inventory.potion = (state.inventory.potion || 0) + 2;
    state.event = "Сундук открыт: 2 зелья.";
  } else state.event = "Рядом нет доступного объекта для взаимодействия.";
  return state.event;
}
export function usePotion(state) {
  if (!state.inventory.potion) return false;
  state.inventory.potion--;
  state.player.hp = clamp(state.player.hp + 30, 0, 100);
  state.event = "Здоровье восстановлено.";
  return true;
}
export function serialize(state) {
  return JSON.stringify({ ...state, version: SAVE_VERSION });
}
export function deserialize(raw) {
  try {
    const input = JSON.parse(raw);
    if (input.version !== SAVE_VERSION || !QUEST_STEPS.includes(input.quest)) return createState();
    const clean = createState();
    // Allowlist important fields. Never trust arbitrary object properties or executable content.
    const p = input.player || {};
    for (const key of ["x", "z", "yaw", "hp", "stamina", "gold", "level"]) {
      if (typeof p[key] === "number" && Number.isFinite(p[key])) clean.player[key] = p[key];
    }
    clean.player.x = clamp(clean.player.x, -91, 91);
    clean.player.z = clamp(clean.player.z, -91, 91);
    clean.player.hp = clamp(clean.player.hp, 1, 100);
    clean.player.stamina = clamp(clean.player.stamina, 0, 100);
    clean.player.gold = clamp(clean.player.gold, 0, 1000000);
    clean.quest = input.quest;
    for (const key of Object.keys(clean.flags)) clean.flags[key] = input.flags?.[key] === true;
    for (const [key, value] of Object.entries(input.inventory || {})) {
      if (/^[a-z_]{1,32}$/.test(key) && Number.isInteger(value) && value >= 0 && value <= 9999) clean.inventory[key] = value;
    }
    clean.enemy.hp = clean.flags.enemyDefeated ? 0 : clamp(Number(input.enemy?.hp) || 80, 1, 80);
    clean.dayTime = clamp(Number(input.dayTime) || 0.29, 0, 1);
    clean.timePlayed = clamp(Number(input.timePlayed) || 0, 0, 100000000);
    return clean;
  } catch { return createState(); }
}
