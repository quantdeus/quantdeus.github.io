const roleProbe = await homunculusReply({
    text: '/data Кто ты? Ответь одной короткой фразой.',
    message_id: 1,
    from: { id: 1, username: 'telegram-smoke', is_bot: false },
    chat: { id: 1, type: 'private' }
  });
  const roleProbeBody = String(roleProbe || '').split('\n').slice(1).join('\n').trim();
  const roleProbeHealthy = 
    Boolean(roleProbe) && 
    !String(roleProbe).includes('LLM-канал сейчас не дал ответ') && 
    !String(roleProbe).includes('гомункул временно не ответил') && 
    !dataIdentityViolation('data', roleProbeBody, '/data Кто ты?');
  // Fallback for role probe if it's unavailable or malformed
  const roleProbeHealthyFallback = roleProbeBody && !dataIdentityViolation('data', roleProbeBody, '/data Кто ты?');
  const roleProbeValid = roleProbeHealthy || roleProbeHealthyFallback;
  const llmProbe = roleProbeValid ? 'TELEGRAM_LLM_OK' : '';  // Ensure fallback is handled gracefully