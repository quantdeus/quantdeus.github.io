'use strict';

// QuantDeus low-cost, text-only inference lane. A model response is NOT a tool invocation.
const DIRECT_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'openrouter/free';

function modelIsFree(model) {
  return model === DEFAULT_MODEL || model.endsWith(':free');
}

function route(env = process.env) {
  const apiKey = String(env.OPENROUTER_API_KEY || '').trim();
  const proposedModel = String(env.OPENROUTER_MODEL || env.QD_LLM_MODEL || DEFAULT_MODEL).trim();
  const model = modelIsFree(proposedModel) ? proposedModel : DEFAULT_MODEL;
  const account = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const gateway = String(env.CLOUDFLARE_AI_GATEWAY_ID || '').trim();
  const gatewayToken = String(env.CLOUDFLARE_AI_GATEWAY_TOKEN || '').trim();
  const viaGateway = Boolean(account && gateway && gatewayToken);
  const endpoint = viaGateway
    ? 'https://gateway.ai.cloudflare.com/v1/' +
      encodeURIComponent(account) + '/' + encodeURIComponent(gateway) +
      '/openrouter/v1/chat/completions'
    : DIRECT_ENDPOINT;
  return { apiKey, model, endpoint, viaGateway, gatewayToken };
}

function configured(env = process.env) {
  return Boolean(route(env).apiKey);
}

function cleanMessages(messages) {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 26) {
    throw new Error('OPENROUTER_INVALID_MESSAGES');
  }
  let length = 0;
  const result = messages.map(message => {
    if (!['system', 'user', 'assistant'].includes(message?.role)) {
      throw new Error('OPENROUTER_UNSUPPORTED_ROLE');
    }
    const content = String(message.content || '').trim();
    if (!content || content.length > 50000) throw new Error('OPENROUTER_INVALID_CONTENT');
    length += content.length;
    return {role: message.role, content};
  });
  if (length > 95000) throw new Error('OPENROUTER_CONTEXT_TOO_LARGE');
  return result;
}

async function ask(messages, { env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 30000, maxTokens = 900 } = {}) {
  const target = route(env);
  if (!target.apiKey) throw new Error('OPENROUTER_API_KEY_REQUIRED');
  const requestMessages = cleanMessages(messages);
  const headers = {
    authorization: 'Bearer ' + target.apiKey,
    'content-type': 'application/json',
    accept: 'application/json',
    'HTTP-Referer': 'https://quantdeus.ru/',
    'X-Title': 'QuantDeus AI Fleet'
  };
  if (target.viaGateway) headers['cf-aig-authorization'] = 'Bearer ' + target.gatewayToken;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(45000, Math.max(1000, timeoutMs)));
  let response;
  try {
    response = await fetchImpl(target.endpoint, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: target.model,
        messages: requestMessages,
        temperature: 0.3,
        max_tokens: Math.min(900, Math.max(1, maxTokens)),
        stream: false
      })
    });
    if (!response.ok) {
      const err = new Error(response.status === 429
        ? 'OPENROUTER_FREE_QUOTA_EXHAUSTED_OR_RATE_LIMITED'
        : 'OPENROUTER_HTTP_' + response.status);
      err.status = response.status;
      throw err;
    }
    let data;
    try { data = await response.json(); }
    catch { throw new Error('OPENROUTER_NON_JSON_RESPONSE'); }
    const answer = data?.choices?.[0]?.message?.content;
    if (typeof answer !== 'string' || !answer.trim()) throw new Error('OPENROUTER_EMPTY_RESPONSE');
    const returnedModel = String(data.model || target.model);
    return {text: answer.trim(), provider: 'openrouter', model: returnedModel, transport: target.viaGateway ? 'cloudflare-ai-gateway' : 'direct'};
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('OPENROUTER_TIMEOUT');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {route, configured, cleanMessages, ask, modelIsFree};
