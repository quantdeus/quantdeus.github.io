(()=> {
  const cfg = window.QuantDeus || {};
  let nonce = cfg.nonce || '';
  let currentPlan = cfg.userPlan === 'pro' ? 'pro' : 'free';
  let currentUser = cfg.loggedIn
    ? {name: cfg.userName || 'Пользователь', role: cfg.userRole || 'qd_member', provider: cfg.authProvider || 'wordpress', plan: currentPlan}
    : null;

  const qs = (s, root=document) => root.querySelector(s);
  const qsa = (s, root=document) => [...root.querySelectorAll(s)];
  const canonicalOrigin = String(cfg.canonicalOrigin || 'https://quantdeus.github.io').replace(/\/$/,'');
  const telegramBrokerUrl = cfg.telegramBrokerUrl || cfg.telegramMiniappUrl || '';
  const telegramStartUrl = cfg.telegramStartUrl || '';
  const githubBrokerUrl = cfg.githubBrokerUrl || '';
  const githubStartUrl = cfg.githubStartUrl || '';
  const githubConfigUrl = cfg.githubConfigUrl || '';
  const logoutEndpoint = cfg.logoutEndpoint || '';
  const issueMirrorUrl = cfg.issueMirrorUrl || '';
  const proUrl = cfg.proUrl || '/ai-fleet/pro/';

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
    currentPlan = currentUser?.plan === 'pro' ? 'pro' : (currentUser ? currentPlan : 'free');
    qsa('[data-plan-badge]').forEach(el => { el.textContent = currentPlan.toUpperCase(); });
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

  function consumeQueryParam(name) {
    const url = new URL(window.location.href);
    const value = url.searchParams.get(name) || '';
    if (!value) return '';
    url.searchParams.delete(name);
    const cleanUrl = url.pathname + (url.search || '') + (url.hash || '');
    history.replaceState({}, document.title, cleanUrl || '/');
    return value;
  }

  function requestTelegramAssertionFromParent() {
    return new Promise((resolve,reject) => {
      if (window.parent === window) {
        reject(new Error('canonical_origin_required'));
        return;
      }
      const timeout = setTimeout(() => {
        window.removeEventListener('message', onMessage);
        reject(new Error('telegram_bridge_timeout'));
      }, 8000);
      function onMessage(event) {
        if (event.source !== window.parent || event.origin !== canonicalOrigin) return;
        const message = event.data || {};
        if (message.type !== 'qd:telegram-result') return;
        clearTimeout(timeout);
        window.removeEventListener('message', onMessage);
        if (!message.ok || !message.assertion) {
          if (message.error === 'telegram_no_pending_assertion') return resolve(null);
          return reject(new Error(message.error || 'telegram_auth_failed'));
        }
        resolve(message);
      }
      window.addEventListener('message', onMessage);
      window.parent.postMessage({type:'qd:telegram-login',action:'consume'}, canonicalOrigin);
    });
  }

  async function syncTelegramBotSession() {
    if (!telegramBrokerUrl) return false;

    const directAssertion = consumeQueryParam('qd_telegram_assertion');
    if (directAssertion) {
      try {
        setTelegramStatus('QuantDeus Store Bot · создаю WordPress-сессию…');
        await establish(telegramBrokerUrl, {assertion:directAssertion});
        location.replace(cfg.loginUrl || '/login/');
        return true;
      } catch (err) {
        const map = {
          telegram_bot_assertion_invalid:'Ссылка Store Bot истекла. Войди ещё раз.',
          telegram_invalid:'Store Bot не подтвердил вход.',
          telegram_broker_unavailable:'Store Bot verifier временно недоступен.'
        };
        setTelegramStatus(map[err.message] || ('Telegram: ' + String(err.message || 'ошибка входа')));
        return false;
      }
    }

    if (window.parent === window) return false;
    try {
      const result = await requestTelegramAssertionFromParent();
      if (!result?.assertion) return false;
      setTelegramStatus('QuantDeus Store Bot · создаю сессию…');
      await establish(telegramBrokerUrl, {assertion:result.assertion});
      window.parent.postMessage({type:'qd:telegram-consumed',ok:true}, canonicalOrigin);
      location.reload();
      return true;
    } catch (err) {
      const map = {
        telegram_bridge_timeout:'Store Bot bridge не ответил. Обнови страницу и повтори вход.',
        telegram_bot_assertion_invalid:'Ссылка Store Bot истекла. Войди ещё раз.',
        telegram_invalid:'Store Bot не подтвердил вход.'
      };
      setTelegramStatus(map[err.message] || ('Telegram: ' + String(err.message || 'ошибка входа')));
      return false;
    }
  }

  async function telegramBrowserLogin(button) {
    if (!telegramBrokerUrl) throw new Error('telegram_broker_missing');
    button.disabled = true;
    button.textContent = 'Открываю Store Bot…';
    setTelegramStatus('QuantDeus Store Bot · откроется Telegram для подтверждения');

    if (window.parent === window) {
      if (!telegramStartUrl) throw new Error('telegram_bot_auth_unconfigured');
      const start = new URL(telegramStartUrl, window.location.href);
      start.searchParams.set('start','1');
      location.assign(start.toString());
      return;
    }

    window.parent.postMessage({type:'qd:telegram-login',action:'start'}, canonicalOrigin);
  }

  function bindTelegramLogin() {
    qsa('[data-telegram-login]').forEach(button => {
      button.addEventListener('click', async () => {
        try {
          await telegramBrowserLogin(button);
        } catch (err) {
          const map = {
            canonical_origin_required:'Открой QuantDeus через https://quantdeus.github.io/ — прямой Playground не поддерживает безопасный вход.',
            telegram_bridge_timeout:'Store Bot bridge не ответил. Попробуй ещё раз.',
            telegram_bot_auth_unconfigured:'QuantDeus Store Bot временно не готов к входу.',
            telegram_invalid:'Store Bot не подтвердил сессию.'
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
    if (!githubBrokerUrl) return false;

    const directError = consumeQueryParam('qd_github_error');
    if (directError) {
      const map = {
        github_staff_required:'Этот GitHub-аккаунт не имеет прав модератора/администратора QuantDeus.',
        github_assertion_invalid:'GitHub-сессия истекла. Войди ещё раз.',
        github_oauth_unconfigured:'GitHub OAuth ещё не настроен на Vercel.',
        github_oauth_exchange:'GitHub не завершил OAuth-обмен.'
      };
      qsa('[data-github-status]').forEach(el => el.textContent = map[directError] || ('GitHub: ' + directError));
      return false;
    }

    const directAssertion = consumeQueryParam('qd_github_assertion');
    if (directAssertion) {
      try {
        qsa('[data-github-status]').forEach(el => el.textContent = 'GitHub · подтверждаю права репозитория…');
        await establish(githubBrokerUrl, {assertion:directAssertion});
        location.replace(cfg.loginUrl || '/login/');
        return true;
      } catch (err) {
        const map = {
          github_staff_required:'Этот GitHub-аккаунт не имеет прав модератора/администратора QuantDeus.',
          github_assertion_invalid:'GitHub-сессия истекла. Войди ещё раз.',
          github_auth_invalid:'GitHub-проверка не прошла. Войди ещё раз.',
          github_oauth_unconfigured:'GitHub OAuth ещё не настроен на Vercel.',
          github_broker_unavailable:'GitHub verifier временно недоступен.'
        };
        qsa('[data-github-status]').forEach(el => el.textContent = map[err.message] || ('GitHub: ' + err.message));
        return false;
      }
    }

    if (window.parent === window) return false;
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

    if (!githubStartUrl || !githubBrokerUrl) {
      status.forEach(el => el.textContent = 'GitHub OAuth · broker не настроен');
      return;
    }

    // Native WordPress production can start OAuth directly. This path does not
    // depend on cross-origin CORS health checks or an iframe parent.
    if (window.parent === window) {
      status.forEach(el => el.textContent = 'GitHub OAuth · прямой защищённый вход для staff');
      buttons.forEach(button => {
        button.disabled = false;
        button.removeAttribute('aria-disabled');
        button.addEventListener('click', () => {
          button.disabled = true;
          button.textContent = 'Открываю GitHub…';
          const start = new URL(githubStartUrl, window.location.href);
          start.searchParams.set('start','1');
          start.searchParams.set('return_to', cfg.loginUrl || (canonicalOrigin + '/login/'));
          location.assign(start.toString());
        });
      });
      return;
    }

    if (!githubConfigUrl) {
      status.forEach(el => el.textContent = 'GitHub OAuth · health endpoint не настроен');
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
        : 'не настроена подпись сессии';
      status.forEach(el => el.textContent = 'GitHub OAuth · ' + missing);
      return;
    }

    status.forEach(el => el.textContent = 'GitHub · права write/maintain/admin проверяются сервером');
    buttons.forEach(button => {
      button.disabled = false;
      button.removeAttribute('aria-disabled');
      button.addEventListener('click', () => {
        button.disabled = true;
        button.textContent = 'Открываю GitHub…';
        window.parent.postMessage({type:'qd:github-login',action:'start'}, canonicalOrigin);
      });
    });
  }

  function notifyParentLogout() {
    if (window.parent !== window) {
      window.parent.postMessage({type:'qd:logout'}, canonicalOrigin);
    }
  }

  function bindLogout() {
    qsa('[data-qd-logout]').forEach(link => {
      link.addEventListener('click', async event => {
        event.preventDefault();
        const fallback = link.href;
        link.setAttribute('aria-disabled','true');
        link.textContent = 'Выхожу…';
        notifyParentLogout();
        try {
          if (logoutEndpoint) {
            await json(logoutEndpoint, {method:'POST', body:'{}'});
            nonce = '';
            currentUser = null;
            location.replace(cfg.loginUrl || '/login/');
            return;
          }
        } catch {}
        location.href = fallback;
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

  function issueDate(value) {
    if (!value) return '';
    try { return new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)); }
    catch { return String(value); }
  }

  function issueNode(tag, className='', text='') {
    const node=document.createElement(tag);
    if(className) node.className=className;
    if(text) node.textContent=text;
    return node;
  }

  function issueSummary(issue) {
    const parts=['#'+issue.number, String(issue.state || 'open').toUpperCase()];
    if (Array.isArray(issue.labels) && issue.labels.length) parts.push(issue.labels.slice(0,5).join(' · '));
    if (issue.comments) parts.push(issue.comments+' comments');
    return parts.join(' · ');
  }

  async function renderIssueDetail(issueId, host) {
    host.hidden=false;
    host.replaceChildren(issueNode('div','qd-notice','Загружаю ветку Issue #'+issueId+'…'));
    try {
      const data=await json(issueMirrorUrl+'/'+encodeURIComponent(issueId));
      const issue=data.issue || {};
      host.replaceChildren();

      const head=issueNode('div','qd-issue-detail-head');
      const title=issueNode('h3','',('#'+issue.number+' · '+(issue.title || 'Issue')));
      head.append(title);
      if(issue.url){
        const link=issueNode('a','qd-text-link','Открыть на GitHub ↗');
        link.href=issue.url; link.target='_blank'; link.rel='noopener noreferrer';
        head.append(link);
      }
      host.append(head);
      if(issue.body) host.append(issueNode('p','qd-issue-body',issue.body));

      const comments=issueNode('div','qd-issue-comments');
      (data.comments || []).forEach(comment=>{
        const item=issueNode('article','qd-issue-comment'+(comment.agent_reply?' is-agent':''));
        item.append(issueNode('div','qd-thread-meta',(comment.agent_reply?'🤖 ':'')+(comment.author || 'github')+' · '+issueDate(comment.created_at)));
        item.append(issueNode('p','',comment.body || ''));
        comments.append(item);
      });
      if(!(data.comments || []).length) comments.append(issueNode('div','qd-notice','Комментариев пока нет.'));
      host.append(comments);

      if(!currentUser || issue.state!=='open'){
        const msg=!currentUser ? 'Войди через Telegram, чтобы отвечать в Issue и общаться с AI Fleet.' : 'Issue закрыт: новые ответы через форум отключены.';
        host.append(issueNode('div','qd-notice',msg));
        return;
      }

      const form=issueNode('form','qd-form qd-issue-reply');
      const textarea=document.createElement('textarea');
      textarea.name='content'; textarea.required=true; textarea.minLength=2; textarea.maxLength=8000;
      textarea.placeholder='Ответить в Issue #'+issue.number+'…';
      form.append(textarea);

      const aiRow=issueNode('label','qd-agent-toggle');
      const checkbox=document.createElement('input');
      checkbox.type='checkbox'; checkbox.name='ask_agents'; checkbox.value='1';
      aiRow.append(checkbox, document.createTextNode(' Позвать AI Fleet в эту ветку'));
      form.append(aiRow);

      const entitlement=issueNode('div','qd-notice');
      if(currentPlan==='pro'){
        entitlement.textContent='⭐ Pro: можно указать до 3 агентов через запятую. Например: seven-of-nine, data, sherlock.';
        const agents=document.createElement('input');
        agents.name='agents'; agents.placeholder='seven-of-nine, data, sherlock'; agents.maxLength=160;
        agents.dataset.proAgents='1'; agents.hidden=true;
        form.append(agents);
        checkbox.addEventListener('change',()=>{agents.hidden=!checkbox.checked;});
      } else {
        entitlement.textContent='🆓 Free: AI Fleet отвечает через Seven of Nine. Pro открывает multi-agent до 3 ролей.';
        const upgrade=issueNode('a','qd-text-link','Открыть QuantDeus Pro →');
        upgrade.href=proUrl;
        entitlement.append(document.createElement('br'),upgrade);
      }
      form.append(entitlement);

      const submit=issueNode('button','qd-btn','Отправить в Issue');
      submit.type='submit';
      const status=issueNode('div','qd-notice','');
      form.append(submit,status);
      form.addEventListener('submit',async event=>{
        event.preventDefault();
        submit.disabled=true;
        status.textContent='Публикую комментарий…';
        const payload={
          content: textarea.value,
          ask_agents: checkbox.checked,
          agents: currentPlan==='pro' ? (qs('[data-pro-agents]',form)?.value || '') : ''
        };
        try{
          const result=await json(issueMirrorUrl+'/'+encodeURIComponent(issue.number)+'/reply',{
            method:'POST', body:JSON.stringify(payload)
          });
          textarea.value='';
          checkbox.checked=false;
          const agentsInput=qs('[data-pro-agents]',form); if(agentsInput){agentsInput.value='';agentsInput.hidden=true;}
          status.textContent=result.agent_request
            ? ('✅ Комментарий в GitHub. AI Fleet: '+(result.agents || []).join(', ')+' · '+String(result.plan || 'free').toUpperCase())
            : '✅ Комментарий опубликован в GitHub Issue.';
          await renderIssueDetail(issue.number,host);
        } catch(err){
          status.textContent='Ошибка: '+err.message;
        } finally {
          submit.disabled=false;
        }
      });
      host.append(form);

      const refresh=issueNode('button','qd-btn alt qd-issue-refresh','Обновить ответы');
      refresh.type='button';
      refresh.addEventListener('click',()=>renderIssueDetail(issue.number,host));
      host.append(refresh);
    } catch(err) {
      host.replaceChildren(issueNode('div','qd-notice','Issue mirror: '+err.message));
    }
  }

  function renderIssueList(issues, limit=60) {
    const list=qs('[data-issue-list]');
    const count=qs('[data-issue-count]');
    const more=qs('[data-issue-more]');
    const search=String(qs('[data-issue-search]')?.value || '').trim().toLowerCase();
    if(!list) return 0;
    const filtered=(issues || []).filter(issue=>{
      if(!search) return true;
      const hay=[issue.number,issue.title,issue.body,...(issue.labels || [])].join(' ').toLowerCase();
      return hay.includes(search);
    });
    list.replaceChildren();
    filtered.slice(0,limit).forEach(issue=>{
      const card=issueNode('article','qd-thread qd-issue-card');
      card.append(issueNode('div','qd-thread-meta',issueSummary(issue)));
      card.append(issueNode('h2','',issue.title || ('Issue #'+issue.number)));
      if(issue.body) card.append(issueNode('p','',issue.body));
      const actions=issueNode('div','qd-community-actions');
      const open=issueNode('button','qd-btn alt','Открыть ветку');
      open.type='button';
      const detail=issueNode('div','qd-issue-detail');
      detail.hidden=true;
      open.addEventListener('click',()=>{
        if(!detail.hidden){ detail.hidden=true; open.textContent='Открыть ветку'; return; }
        open.textContent='Скрыть ветку';
        renderIssueDetail(issue.number,detail);
      });
      actions.append(open);
      if(issue.url){
        const gh=issueNode('a','qd-text-link','GitHub ↗'); gh.href=issue.url; gh.target='_blank'; gh.rel='noopener noreferrer'; actions.append(gh);
      }
      card.append(actions,detail);
      list.append(card);
    });
    if(count) count.textContent=filtered.length+' Issues';
    if(more){
      more.hidden=filtered.length<=limit;
      more.dataset.nextLimit=String(Math.min(filtered.length,limit+60));
    }
    return filtered.length;
  }

  async function bindIssueMirror() {
    const root=qs('[data-issue-mirror]');
    if(!root || !issueMirrorUrl) return;
    const status=qs('[data-issue-mirror-status]',root);
    const search=qs('[data-issue-search]',root);
    const more=qs('[data-issue-more]',root);
    let issues=[], limit=60;
    try{
      const data=await json(issueMirrorUrl+'?state=open');
      issues=Array.isArray(data.issues)?data.issues:[];
      if(status) status.textContent='LIVE · '+issues.length+' открытых Issues · источник '+(data.repository || 'GitHub');
      renderIssueList(issues,limit);
    }catch(err){
      if(status) status.textContent='Issue mirror: '+err.message;
      return;
    }
    search?.addEventListener('input',()=>{limit=60;renderIssueList(issues,limit);});
    more?.addEventListener('click',()=>{
      limit=Number(more.dataset.nextLimit || (limit+60));
      renderIssueList(issues,limit);
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

  function bindThemeToggle() {
    const button=qs('[data-theme-toggle]');
    const apply=mode=>{
      const next=mode==='night'?'night':'day';
      document.documentElement.dataset.qdTheme=next;
      if(button){button.setAttribute('aria-pressed',String(next==='night'));button.textContent=next==='night'?'NIGHT / HORIZON':'DAY / EARTH';}
    };
    let stored=''; try{stored=localStorage.getItem('qd_theme')||'';}catch{}
    if(!stored){try{stored=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'night':'day';}catch{stored='day';}}
    apply(stored);
    button?.addEventListener('click',()=>{const next=document.documentElement.dataset.qdTheme==='night'?'day':'night';apply(next);try{localStorage.setItem('qd_theme',next);}catch{}});
  }

  document.addEventListener('DOMContentLoaded', async () => {
    bindThemeToggle();
    setAuth(currentUser);
    bindPrimaryMenu();
    bindLogout();
    bindTelegramLogin();
    bindInquiry();
    bindForum();
    await bindIssueMirror();
    let restored=await syncTelegramBotSession();
    if(!restored) restored=await syncGithubSession();
    await bindGithubAdmin();
    if(!restored) await miniAppLogin();
  });
})();