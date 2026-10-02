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

  function bindGithubAdmin() {
    const buttons = qsa('[data-github-admin-login]');
    const status = qsa('[data-github-status]');
    if (!buttons.length) return;
    if (!cfg.githubConfigured || !cfg.githubStartUrl) {
      buttons.forEach(button => {
        button.disabled = true;
        button.setAttribute('aria-disabled','true');
        button.title = 'GitHub OAuth ещё не подключён к server-side runtime';
      });
      status.forEach(el => el.textContent = 'GitHub OAuth · нужен server-side OAuth App для staff-входа');
      return;
    }
    status.forEach(el => el.textContent = 'GitHub · права write/maintain/admin проверяются при входе');
    buttons.forEach(button => {
      button.disabled = false;
      button.removeAttribute('aria-disabled');
      button.addEventListener('click', async () => {
        const original = button.textContent;
        button.disabled = true;
        button.textContent = 'Проверяю GitHub…';
        try {
          const body = await json(cfg.githubStartUrl, {method:'POST', body:'{}'});
          if (!body.authorize_url) throw new Error('GitHub authorize URL missing');
          window.top.location.href = body.authorize_url;
        } catch (err) {
          button.disabled = false;
          button.textContent = original;
          status.forEach(el => el.textContent = 'GitHub: ' + err.message);
        }
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
    bindGithubAdmin();
    bindInquiry();
    bindForum();
    await miniAppLogin();
  });
})();