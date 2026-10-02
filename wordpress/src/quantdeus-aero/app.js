(()=> {
  const cfg = window.QuantDeus || {};
  let nonce = cfg.nonce || '';
  let currentUser = cfg.loggedIn
    ? {name: cfg.userName || 'Пользователь', role: cfg.userRole || 'qd_member', provider: cfg.authProvider || 'wordpress'}
    : null;

  const qs = (s, root=document) => root.querySelector(s);
  const qsa = (s, root=document) => [...root.querySelectorAll(s)];
  const canonicalOrigin = String(cfg.canonicalOrigin || 'https://quantdeus.github.io').replace(/\/$/,'');
  const telegramBrokerUrl = cfg.telegramBrokerUrl || cfg.telegramMiniappUrl || '';
  const githubBrokerUrl = cfg.githubBrokerUrl || '';
  const githubStartUrl = cfg.githubStartUrl || '';
  const githubConfigUrl = cfg.githubConfigUrl || '';

  function roleLabel(role) {
    return ({
      qd_member:'Пользователь',
      qd_moderator:'Модератор',
      administrator:'Администратор',
      qd_agent:'Агент'
    })[role] || role || '';
  }

  function setAuth(user) {
    currentUser = user || null;
    qsa('[data-auth-state]').forEach(el => {
      const provider = currentUser?.provider === 'github' ? 'GitHub' : (currentUser ? 'Telegram' : '');
      const role = currentUser?.role ? (' · ' + roleLabel(currentUser.role)) : '';
      el.textContent = currentUser
        ? (provider + ' · ' + (currentUser.name || 'авторизован') + role)
        : 'Гость · можно отправлять заявки без регистрации';
    });
    qsa('[data-auth-required]').forEach(el => { el.hidden = !currentUser; });
    qsa('[data-guest-only]').forEach(el => { el.hidden = !!currentUser; });
  }

  function setTelegramStatus(text) {
    qsa('[data-telegram-status]').forEach(el => { el.textContent = text; });
  }

  async function json(url, options={}) {
    const headers = {'content-type':'application/json', ...(options.headers || {})};
    if (nonce) headers['X-WP-Nonce'] = nonce;
    const response = await fetch(url, {...options, headers, credentials:'same-origin'});
    let body = {};
    try { body = await response.json(); } catch {}
    if (!response.ok) throw new Error(body.message || body.code || ('HTTP ' + response.status));
    return body;
  }

  async function establish(url, payload) {
    const body = await json(url, {method:'POST', body:JSON.stringify(payload)});
    if (body.nonce) nonce = body.nonce;
    setAuth(body.user || null);
    return body;
  }

  function requestTelegramFromParent() {
    return new Promise((resolve,reject) => {
      if (window.parent === window) {
        reject(new Error('canonical_origin_required'));
        return;
      }
      const timeout = setTimeout(() => {
        window.removeEventListener('message', onMessage);
        reject(new Error('telegram_login_timeout'));
      }, 120000);
      function onMessage(event) {
        if (event.source !== window.parent || event.origin !== canonicalOrigin) return;
        const message = event.data || {};
        if (message.type !== 'qd:telegram-result') return;
        clearTimeout(timeout);
        window.removeEventListener('message', onMessage);
        if (!message.ok || !message.id_token) {
          reject(new Error(message.error || 'telegram_auth_failed'));
          return;
        }
        resolve(message);
      }
      window.addEventListener('message', onMessage);
      window.parent.postMessage({type:'qd:telegram-login'}, canonicalOrigin);
    });
  }

  async function telegramBrowserLogin(button) {
    if (!telegramBrokerUrl) throw new Error('telegram_broker_missing');
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Открываю Telegram…';
    setTelegramStatus('Telegram · подтверждение личности…');
    try {
      const result = await requestTelegramFromParent();
      button.textContent = 'Проверяю…';
      await establish(telegramBrokerUrl, {id_token: result.id_token});
      setTelegramStatus('Telegram · вход выполнен');
      if (qs('[data-login-page]')) location.reload();
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  function bindTelegramLogin() {
    qsa('[data-telegram-login]').forEach(button => {
      button.addEventListener('click', async () => {
        try {
          await telegramBrowserLogin(button);
        } catch (err) {
          const map = {
            canonical_origin_required:'Открой QuantDeus через https://quantdeus.github.io/ — прямой Playground не поддерживает безопасный вход.',
            telegram_login_timeout:'Telegram не ответил. Попробуй ещё раз.',
            telegram_login_cancelled:'Вход через Telegram отменён.',
            telegram_login_sdk_unavailable:'Telegram Login SDK временно недоступен.',
            telegram_id_token_missing:'Telegram не вернул токен входа.',
            telegram_auth_invalid:'Telegram-сессия не прошла проверку.'
          };
          setTelegramStatus(map[err.message] || ('Telegram: ' + String(err.message || 'ошибка входа')));
        }
      });
    });
  }

  async function miniAppLogin() {
    if (currentUser || !telegramBrokerUrl) return false;
    const tg = window.Telegram && window.Telegram.WebApp;
    if (!tg || !tg.initData) return false;
    try {
      tg.ready();
      tg.expand();
      setTelegramStatus('Telegram Mini App · проверяю сессию…');
      await establish(telegramBrokerUrl, {init_data: tg.initData});
      setTelegramStatus('Telegram Mini App · вход выполнен');
      if (qs('[data-login-page]')) location.reload();
      return true;
    } catch (err) {
      setTelegramStatus('Telegram Mini App: ' + err.message);
      return false;
    }
  }

  function bindPrimaryMenu() {
    const toggle = qs('[data-menu-toggle]');
    const nav = qs('[data-primary-nav]');
    if (!toggle || !nav) return;
    const close = () => {
      toggle.setAttribute('aria-expanded','false');
      nav.classList.remove('is-open');
      document.documentElement.classList.remove('qd-menu-open');
    };
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      nav.classList.toggle('is-open', open);
      document.documentElement.classList.toggle('qd-menu-open', open);
    });
    qsa('a', nav).forEach(link => link.addEventListener('click', close));
    document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
    document.addEventListener('click', event => {
      if (toggle.getAttribute('aria-expanded') !== 'true') return;
      if (nav.contains(event.target) || toggle.contains(event.target)) return;
      close();
    });
  }

  function requestGithubFromParent() {
    return new Promise((resolve,reject) => {
      if (window.parent === window) {
        reject(new Error('canonical_origin_required'));
        return;
      }
      const timeout = setTimeout(() => {
        window.removeEventListener('message', onMessage);
        reject(new Error('github_bridge_timeout'));
      }, 8000);
      function onMessage(event) {
        if (event.source !== window.parent || event.origin !== canonicalOrigin) return;
        const message = event.data || {};
        if (message.type !== 'qd:github-result') return;
        clearTimeout(timeout);
        window.removeEventListener('message', onMessage);
        if (!message.ok || !message.assertion) {
          if (message.error === 'github_no_pending_assertion') return resolve(null);
          return reject(new Error(message.error || 'github_auth_failed'));
        }
        resolve(message);
      }
      window.addEventListener('message', onMessage);
      window.parent.postMessage({type:'qd:github-login',action:'consume'}, canonicalOrigin);
    });
  }

  async function syncGithubSession() {
    if (!githubBrokerUrl || window.parent === window) return false;
    try {
      const result = await requestGithubFromParent();
      if (!result?.assertion) return false;
      qsa('[data-github-status]').forEach(el => el.textContent = 'GitHub · подтверждаю права репозитория…');
      await establish(githubBrokerUrl, {assertion:result.assertion});
      window.parent.postMessage({type:'qd:github-consumed',ok:true}, canonicalOrigin);
      location.reload();
      return true;
    } catch (err) {
      const map = {
        canonical_origin_required:'Открой QuantDeus через https://quantdeus.github.io/.',
        github_bridge_timeout:'GitHub bridge не ответил. Обнови страницу и повтори вход.',
        github_staff_required:'Этот GitHub-аккаунт не имеет прав модератора/администратора QuantDeus.',
        github_assertion_invalid:'GitHub-сессия истекла. Войди ещё раз.',
        github_auth_invalid:'GitHub-проверка не прошла. Войди ещё раз.',
        github_oauth_unconfigured:'GitHub OAuth ещё не настроен на Vercel.'
      };
      qsa('[data-github-status]').forEach(el => el.textContent = map[err.message] || ('GitHub: ' + err.message));
      return false;
    }
  }

  async function bindGithubAdmin() {
    const buttons = qsa('[data-github-admin-login]');
    const status = qsa('[data-github-status]');
    if (!buttons.length) return;
    buttons.forEach(button => {
      button.disabled = true;
      button.setAttribute('aria-disabled','true');
    });
    if (!githubStartUrl || !githubBrokerUrl || !githubConfigUrl) {
      status.forEach(el => el.textContent = 'GitHub OAuth · broker не настроен');
      return;
    }
    let health = null;
    try {
      const response = await fetch(githubConfigUrl, {cache:'no-store', credentials:'omit'});
      health = await response.json();
      if (!response.ok || !health?.ok) throw new Error(health?.error || ('HTTP ' + response.status));
    } catch (err) {
      status.forEach(el => el.textContent = 'GitHub OAuth · Vercel broker недоступен');
      return;
    }
    if (!health.configured) {
      const missing = !health.oauth_configured
        ? 'нужны OAuth Client ID/Secret'
        : (!health.permission_verifier_configured ? 'нужен GitHub permission token' : 'не настроена подпись сессии');
      status.forEach(el => el.textContent = 'GitHub OAuth · ' + missing);
      return;
    }
    status.forEach(el => el.textContent = 'GitHub · права write/maintain/admin проверяются сервером');
    buttons.forEach(button => {
      button.disabled = false;
      button.removeAttribute('aria-disabled');
      button.addEventListener('click', () => {
        if (window.parent === window) {
          status.forEach(el => el.textContent = 'Открой QuantDeus через https://quantdeus.github.io/.');
          return;
        }
        button.disabled = true;
        button.textContent = 'Открываю GitHub…';
        window.parent.postMessage({type:'qd:github-login',action:'start'}, canonicalOrigin);
      });
    });
  }

  function bindInquiry() {
    const box = qs('#inquiryBox'), form = qs('#qdInquiry'), status = qs('#qdInquiryStatus');
    qsa('[data-service]').forEach(button => button.addEventListener('click', () => {
      if (!box || !form) return;
      box.hidden = false;
      form.service_id.value = button.dataset.service || '';
      box.scrollIntoView({behavior:'smooth', block:'start'});
    }));
    form?.addEventListener('submit', async event => {
      event.preventDefault();
      status.textContent = 'Отправляю…';
      const body = Object.fromEntries(new FormData(form).entries());
      try {
        const result = await json(cfg.inquiryUrl, {method:'POST', body:JSON.stringify(body)});
        status.textContent = 'Заявка принята WordPress · #' + result.id;
        const service = body.service_id;
        form.reset();
        form.service_id.value = service;
      } catch (err) {
        status.textContent = 'Ошибка: ' + err.message;
      }
    });
  }

  function bindForum() {
    const create = qs('#qdForumCreate');
    create?.addEventListener('submit', async event => {
      event.preventDefault();
      const status = qs('[data-forum-status]', create) || qs('[data-forum-status]');
      if (!currentUser) {
        if (status) status.textContent = 'Сначала войди через Telegram.';
        return;
      }
      if (status) status.textContent = 'Публикую…';
      const body = Object.fromEntries(new FormData(create).entries());
      try {
        const result = await json(cfg.forumUrl, {method:'POST', body:JSON.stringify(body)});
        location.href = result.url || '/forum/';
      } catch (err) {
        if (status) status.textContent = 'Ошибка: ' + err.message;
      }
    });

    const reply = qs('#qdForumReply');
    reply?.addEventListener('submit', async event => {
      event.preventDefault();
      const status = qs('[data-forum-status]', reply) || qs('[data-forum-status]');
      if (!currentUser) {
        if (status) status.textContent = 'Сначала войди через Telegram.';
        return;
      }
      if (status) status.textContent = 'Отправляю ответ…';
      const id = reply.dataset.threadId;
      const body = Object.fromEntries(new FormData(reply).entries());
      try {
        await json(cfg.forumUrl + '/' + encodeURIComponent(id) + '/reply', {method:'POST', body:JSON.stringify(body)});
        location.reload();
      } catch (err) {
        if (status) status.textContent = 'Ошибка: ' + err.message;
      }
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    setAuth(currentUser);
    bindPrimaryMenu();
    bindTelegramLogin();
    const githubRestored = await syncGithubSession();
    if (githubRestored) return;
    await bindGithubAdmin();
    bindInquiry();
    bindForum();
    await miniAppLogin();
  });
})();