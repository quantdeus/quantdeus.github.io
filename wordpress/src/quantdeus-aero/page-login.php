<?php
if (!defined('ABSPATH')) { exit; }
get_header();
$user=wp_get_current_user();
$role=$user->roles[0] ?? '';
$role_labels=[
  'qd_member'=>'Пользователь',
  'qd_moderator'=>'Модератор',
  'administrator'=>'Администратор',
  'qd_agent'=>'Агент',
];
$provider=is_user_logged_in() && get_user_meta(get_current_user_id(),'qd_github_login',true) ? 'GitHub' : (is_user_logged_in() ? 'Telegram' : '');
?>
<main class="qd-login-page" data-login-page>
  <section class="qd-login-hero">
    <div class="qd-shell">
      <div class="qd-login-heading">
        <span class="qd-kicker">QuantDeus Identity</span>
        <h1>Вход в QuantDeus</h1>
        <p>Обычные участники входят через Telegram. Модераторы и администраторы подтверждают рабочую роль через GitHub и права в каноническом репозитории.</p>
      </div>

      <?php if (is_user_logged_in()): ?>
        <section class="qd-session-card">
          <div class="qd-session-avatar"><?php echo esc_html(mb_substr($user->display_name ?: 'Q',0,1)); ?></div>
          <div>
            <span class="qd-kicker">Сессия активна</span>
            <h2><?php echo esc_html($user->display_name ?: $user->user_login); ?></h2>
            <p><?php echo esc_html($provider ?: 'WordPress'); ?> · <?php echo esc_html($role_labels[$role] ?? $role); ?></p>
          </div>
          <div class="qd-session-actions">
            <?php if ($role==='administrator'): ?>
              <a class="qd-btn" href="<?php echo esc_url(admin_url('admin.php?page=quantdeus')); ?>">Открыть админку</a>
            <?php elseif ($role==='qd_moderator'): ?>
              <a class="qd-btn" href="<?php echo esc_url(home_url('/forum/')); ?>">Перейти к модерации</a>
            <?php else: ?>
              <a class="qd-btn" href="<?php echo esc_url(home_url('/forum/')); ?>">Открыть форум</a>
            <?php endif; ?>
            <a class="qd-btn alt" href="<?php echo esc_url(wp_logout_url(home_url('/login/'))); ?>">Выйти</a>
          </div>
        </section>
      <?php else: ?>
        <div class="qd-login-grid">
          <article class="qd-login-card qd-login-telegram">
            <div class="qd-login-icon">✈️</div>
            <span class="qd-tag">Обычный пользователь</span>
            <h2>Войти через Telegram</h2>
            <p>Для форума, сообщества и пользовательского профиля. После проверки Telegram WordPress создаёт или открывает аккаунт с ролью <strong>Пользователь</strong>.</p>
            <button class="qd-btn qd-telegram-login" type="button" data-telegram-login>Войти через Telegram</button>
            <div class="qd-login-status" data-telegram-status>Telegram · работает на мобильном и ПК через защищённый OIDC bridge</div>
          </article>

          <article class="qd-login-card qd-login-github">
            <div class="qd-login-icon">⌘</div>
            <span class="qd-tag">Команда QuantDeus</span>
            <h2>Войти через GitHub</h2>
            <p>Для модераторов и администраторов. Роль определяется не вручную, а по текущим правам в <code>quantdeus/quantdeus.github.io</code>.</p>
            <div class="qd-permission-map">
              <div><strong>write / maintain</strong><span>→ Модератор</span></div>
              <div><strong>admin</strong><span>→ Администратор</span></div>
            </div>
            <button class="qd-btn qd-github-login" type="button" data-github-admin-login>Войти через GitHub</button>
            <div class="qd-login-status" data-github-status>GitHub · проверка прав репозитория</div>
          </article>
        </div>

        <div class="qd-login-note">
          <strong>Разделение ролей:</strong> Telegram не выдаёт права администратора или модератора. GitHub-вход не используется как обычная пользовательская регистрация.
        </div>
      <?php endif; ?>
    </div>
  </section>
</main>
<?php get_footer(); ?>
