// A read-only text fallback for QuantDeus chat when the OpenClaw route cannot answer.
// Secrets are used server-side only. No tool calls, privileged mutations or silent mock answers.
const configured = () => {
  const options = [
    { id: 'hermes', url: process.env.HERMES_LOCAL_BASE_URL, key: process.env.HERMES_LOCAL_API_KEY, model: process.env.HERMES_CLOUD_MODEL || process.env.HERMES_MODEL },
    { id: 'cerebras', url: 'https://api.cerebras.ai/v1', key: process.env.CEREBRAS_API_KEY, model: process.env.CEREBRAS_MODEL || 'gpt-oss-120b' },
    { id: 'groq', url: 'https://api.groq.com/openai/v1', key: process.env.GROQ_API_KEY, model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b' },
    { id: 'openrouter', url: 'https://openrouter.ai/api/v1', key: process.env.OPENROUTER_API_KEY, model: process.env.OPENROUTER_MODEL || 'openrouter/free' }
  ];
  return options.filter(item => {
    if (!String(item.key || '').trim() || !String(item.model || '').trim()) return false;
    try {
      const url = new URL(String(item.url || ''));
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
      return false;
    }
  }).slice(0, 2);
};

export async function telegramDirectModelReply({ system, user, agentId = '', fetchImpl = fetch }) {
  const candidates = configured();
  if (!candidates.length) {
    console.warn('[telegram-llm-fallback] status=unconfigured');
    return '';
  }
  // This route is inference-only. The caller must have performed ingress authorization,
  // entitlement routing and input filtering; output filtering is applied by the caller.
  for (const item of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const endpoint = String(item.url).replace(/\/+$/, '') + '/chat/completions';
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + String(item.key).trim(),
          'content-type': 'application/json',
          accept: 'application/json'
        },
        body: JSON.stringify({
          model: item.model,
          messages: [
            { role: 'system', content: String(system || '').slice(0, 32000) },
            { role: 'user', content: String(user || '').slice(0, 6500) }
          ],
          temperature: 0.3,
          max_tokens: 900
        }),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      const answer = typeof data?.choices?.[0]?.message?.content === 'string'
        ? data.choices[0].message.content.trim().slice(0, 3900)
        : '';
      if (response.ok && answer) {
        console.info('[telegram-llm-fallback] status=ok provider=' + item.id + ' agent=' + String(agentId).slice(0, 40));
        return answer;
      }
      console.warn('[telegram-llm-fallback] status=unavailable provider=' + item.id + ' http=' + response.status);
    } catch (error) {
      console.warn('[telegram-llm-fallback] status=error provider=' + item.id + ' kind=' + (error?.name === 'AbortError' ? 'timeout' : 'transport'));
    } finally {
      clearTimeout(timer);
    }
  }
  return '';
}
