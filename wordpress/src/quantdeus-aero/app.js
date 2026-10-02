(()=> {
  const cfg = window.QuantDeus || {};
  let nonce = cfg.nonce || '';
  let currentUser = cfg.loggedIn ? {name: cfg.userName || 'Пользователь'} : null;

  const qs = (s, root=document) => root.querySelector(s);
  const qsa = (s, root=document) => [...root.querySelectorAll(s)];

  function setAuth(user) {
    currentUser = user || null;
    qsa('[data-auth-state]').forEach(el => {
      el.textContent = currentUser ? ('Telegram · ' + (currentUser.name || 'авторизован')) : 'Гость · можно отправлять заявки без регистрации';
    });
    qsa('[data-auth-required]').forEach(el => { el.hidden = !currentUser; });
    qsa('[data-guest-only]').forEach(el => { el.hidden = !!currentUser; });
  }

  async function json(url, options={}) {
    const headers = {'content-type':'application/json', ...(options.headers || {})};
    if (nonce) headers['X-WP-Nonce'] = nonce;
    const response = await fetch(url, {...options, headers, credentials:'same-origin'});
    let body = {};
    try { body = await response.json(); } catch {}
    if (!response.ok) throw new Error(body.message || ('HTTP ' + response.status));
    return body;
  }

  async function establish(url, payload) {
    const body = await json(url, {method:'POST', body:JSON.stringify(payload)});
    if (body.nonce) nonce = body.nonce;
    setAuth(body.user || null);
    return body;
  }

  window.QDTelegramAuth = async function(user) {
    try {
      await establish(cfg.telegramLoginUrl, user || {});
    } catch (err) {
      qsa('[data-auth-state]').forEach(el => el.textContent = 'Ошибка Telegram: ' + err.message);
    }
  };

  function mountTelegramWidget() {
    qsa('[data-telegram-widget]').forEach(host => {
      if (host.dataset.mounted === '1' || currentUser || !cfg.telegramBotUsername) return;
      host.dataset.mounted = '1';
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://telegram.org/js/telegram-widget.js?22';
      script.setAttribute('data-telegram-login', cfg.telegramBotUsername);
      script.setAttribute('data-size', 'large');
      script.setAttribute('data-radius', '18');
      script.setAttribute('data-userpic', 'false');
      script.setAttribute('data-request-access', 'write');
      script.setAttribute('data-onauth', 'QDTelegramAuth(user)');
      host.appendChild(script);
    });
  }

  async function miniAppLogin() {
    const tg = window.Telegram && window.Telegram.WebApp;
    if (!tg || !tg.initData || !cfg.telegramMiniappUrl) return false;
    try {
      tg.ready();
      tg.expand();
      await establish(cfg.telegramMiniappUrl, {init_data: tg.initData});
      return true;
    } catch (err) {
      qsa('[data-auth-state]').forEach(el => el.textContent = 'Telegram Mini App: ' + err.message);
      return false;
    }
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
        location.href = '/forum/' + result.id + '/';
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
    bindInquiry();
    bindForum();
    const mini = await miniAppLogin();
    if (!mini) mountTelegramWidget();
  });
})();