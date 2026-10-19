const MODEL = "@cf/google/gemma-4-26b-a4b-it";
const FALLBACK_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const DAILY_MAX = 2;
const EXPECTED_CRON = "*/10 * * * *";
const refs = [
  "Alcubierre (1994) DOI:10.1088/0264-9381/11/5/001",
  "Bobrick & Martire (2021) DOI:10.1088/1361-6382/abdf6e",
  "Fuchs et al. (2024) DOI:10.1088/1361-6382/ad26aa",
  "Warp Factory / Helmerich et al. (2024) DOI:10.1088/1361-6382/ad2e42"
];

async function outcome(db, slot, result, taskId = null) {
  await db.prepare("UPDATE swarm_scheduler_ticks SET outcome=?, task_id=? WHERE slot=?")
    .bind(result, taskId, slot).run();
}

function responseText(result) {
  if (typeof result?.response === "string") return result.response;
  if (typeof result?.choices?.[0]?.message?.content === "string") return result.choices[0].message.content;
  if (typeof result?.choices?.[0]?.text === "string") return result.choices[0].text;
  return "";
}

function basicQa(answer) {
  const s = String(answer || "").trim();
  if (s.length < 110) return { status: "qa_retry_pending", reason: "response_too_short" };
  const cyr = (s.match(/[а-яё]/gi) || []).length;
  if (cyr < 40) return { status: "qa_retry_pending", reason: "not_russian" };
  if (/(?:мы|команда|агенты).{0,35}(?:создали|доказали|построили).{0,30}(?:ftl|сверхсветов|варп-двигатель)|(?:ftl|сверхсветов[а-я]*).{0,25}(?:экспериментально доказан|физически реализован|уже создан)/i.test(s)) {
    return { status: "qa_rejected", reason: "unsupported_ftl_claim" };
  }
  const words = s.toLowerCase().match(/[а-яёa-z]{4,}/g) || [];
  if (words.length > 30) {
    const counts = new Map();
    for (let i = 0; i + 3 < words.length; i++) {
      const gram = words.slice(i, i + 4).join(" ");
      counts.set(gram, (counts.get(gram) || 0) + 1);
    }
    if ([...counts.values()].some(n => n >= 5)) {
      return { status: "qa_retry_pending", reason: "repetitive_output" };
    }
  }
  return { status: "needs_human_review", reason: "draft_valid_pending_scientific_review" };
}

async function runTick(controller, env) {
  const current = new Date(controller.scheduledTime || Date.now());
  const slot = current.toISOString().slice(0, 16) + ":00Z";
  const day = current.toISOString().slice(0, 10);
  if (controller.cron !== EXPECTED_CRON) {
    console.log(JSON.stringify({ event: "unexpected_cron", cron: controller.cron }));
    return;
  }

  const lock = await env.DB.prepare(
    "INSERT OR IGNORE INTO swarm_scheduler_ticks (slot,outcome) VALUES (?,?)"
  ).bind(slot, "started").run();
  if (!lock.meta?.changes) return;

  const task = await env.DB.prepare(
    "SELECT id,agent_id,title FROM tasks WHERE id LIKE 'warp-genesis-%' AND status IN ('queued','qa_retry_pending') ORDER BY CASE WHEN status='queued' THEN 0 ELSE 1 END, agent_id LIMIT 1"
  ).first();
  if (!task) {
    await outcome(env.DB, slot, "no_pending_tasks");
    return;
  }

  await env.DB.prepare("INSERT OR IGNORE INTO swarm_scheduler_daily (day,ai_calls) VALUES (?,0)").bind(day).run();
  const reserved = await env.DB.prepare(
    "UPDATE swarm_scheduler_daily SET ai_calls=ai_calls+1 WHERE day=? AND ai_calls<?"
  ).bind(day, DAILY_MAX).run();
  if (!reserved.meta?.changes) {
    await outcome(env.DB, slot, "daily_limit");
    return;
  }

  const claimed = await env.DB.prepare("UPDATE tasks SET status='researching' WHERE id=? AND status IN ('queued','qa_retry_pending')")
    .bind(task.id).run();
  if (!claimed.meta?.changes) {
    await outcome(env.DB, slot, "task_already_claimed");
    return;
  }

  try {
    const prompt = [
      "Создай только черновик плана исследования для QuantDeus Warp Research.",
      "Тема задачи: " + task.title,
      "Номер профиля: AG-" + String(task.agent_id).padStart(5, "0"),
      "Проверенные как публикации библиографические ориентиры (полные тексты в контекст НЕ загружены):",
      refs.join("; "),
      "На русском языке, 4 нумерованных пункта: (1) конкретная гипотеза;",
      "(2) как проверить численно и какой контроль;",
      "(3) возможное опровержение или научное ограничение;",
      "(4) какие дополнительные источники и данные понадобятся.",
      "Никаких выдуманных цифр, полученных результатов, неподтверждённых цитат или",
      "заявлений о существующем сверхсветовом двигателе.",
      "Это ТОЛЬКО план, не выполненный численный эксперимент. 100-180 слов."
    ].join("\n");

    const inferenceInput = {
      messages: [
        { role: "system", content: "Ты научный ассистент. Давай проверяемые планы, избегай выдуманных данных. Пиши только по-русски." },
        { role: "user", content: prompt }
      ],
      max_tokens: 750,
      temperature: 0.1
    };

    let result;
    let usedModel = MODEL;
    try {
      result = await env.AI.run(MODEL, inferenceInput);
    } catch (primaryError) {
      console.error(JSON.stringify({
        event: "primary_model_failed",
        model: MODEL,
        message: String(primaryError?.message || primaryError).slice(0, 160)
      }));
      // Count the fallback inference separately so total model attempts never exceed DAILY_MAX.
      const fallbackReservation = await env.DB.prepare(
        "UPDATE swarm_scheduler_daily SET ai_calls=ai_calls+1 WHERE day=? AND ai_calls<?"
      ).bind(day, DAILY_MAX).run();
      if (!fallbackReservation.meta?.changes) {
        throw new Error("daily_ai_call_limit_before_fallback");
      }
      usedModel = FALLBACK_MODEL;
      result = await env.AI.run(FALLBACK_MODEL, inferenceInput);
    }

    const text = responseText(result).trim();
    const qa = basicQa(text);
    const prev = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM swarm_scheduler_ticks WHERE task_id=? AND outcome IN ('qa_retry_pending','qa_rejected')"
    ).bind(task.id).first();
    const status = qa.status === "qa_retry_pending" && Number(prev?.n || 0) >= 1
      ? "qa_rejected"
      : qa.status;
    const report = "ЧЕРНОВИК ДЛЯ РЕЦЕНЗИИ; не завершённый расчёт.\nQA: " + qa.reason + "\n\n" + text;

    await env.DB.prepare(
      "INSERT OR REPLACE INTO warp_reports (id,title,body,status,model) VALUES (?,?,?,?,?)"
    ).bind("scheduler-" + task.id, task.title, report, status, usedModel).run();
    await env.DB.prepare("UPDATE tasks SET status=? WHERE id=?").bind(status, task.id).run();
    await outcome(env.DB, slot, status, task.id);
    console.log(JSON.stringify({ event: "warp_tick", slot, task: task.id, status, model: usedModel }));
  } catch (err) {
    console.error(JSON.stringify({
      event: "warp_tick_failed",
      slot,
      task: task.id,
      message: String(err?.message || err).slice(0, 180)
    }));
    await env.DB.prepare("UPDATE tasks SET status='worker_error' WHERE id=?").bind(task.id).run();
    await outcome(env.DB, slot, "worker_error", task.id);
  }
}

export default {
  async fetch() {
    return new Response("Not found", { status: 404 });
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runTick(controller, env));
  }
};
