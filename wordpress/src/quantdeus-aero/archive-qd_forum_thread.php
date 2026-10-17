<?php if (!defined('ABSPATH')) { exit; } get_header(); ?>
<main class="qd-section"><div class="qd-shell">
<div class="qd-kicker">Community · WordPress</div><h1 class="qd-page-title">Форум QuantDeus</h1>
<div class="qd-authline"><span data-auth-state><?php echo is_user_logged_in() ? esc_html('Пользователь · '.wp_get_current_user()->display_name) : 'Гость · чтение открыто'; ?></span><a class="qd-btn alt qd-auth-cta" href="<?php echo esc_url(home_url('/login/')); ?>" data-guest-only>Войти</a></div>
<section class="qd-card qd-issue-mirror" data-issue-mirror>
<div class="qd-section-head"><div><span class="qd-kicker">GitHub Issues · live mirror</span><h2>Задачи QuantDeus прямо на форуме</h2></div><span class="qd-tag" data-plan-badge><?php echo esc_html(class_exists('QD_Core') && method_exists('QD_Core','current_plan') ? strtoupper(QD_Core::current_plan()) : 'FREE'); ?></span></div>
<p>Issues читаются напрямую из <code>quantdeus/quantdeus.github.io</code>. После входа можно отвечать в Issue из форума и позвать AI Fleet. Free получает один ответ Seven of Nine; Pro может вызвать до трёх агентов в одной ветке.</p>
<div class="qd-notice" data-issue-mirror-status>Загружаю свежие Issues…</div>
<div class="qd-issue-toolbar">
<input type="search" data-issue-search placeholder="Поиск по номеру, заголовку или метке" aria-label="Поиск Issues">
<span class="qd-tag" data-issue-count>0 Issues</span>
</div>
<div class="qd-forum qd-issue-list" data-issue-list></div>
<button class="qd-btn alt qd-issue-more" type="button" data-issue-more hidden>Показать ещё</button>
</section>
<section class="qd-card qd-forum-create" data-auth-required <?php if (!is_user_logged_in()) echo 'hidden'; ?>>
<h2>Новая тема</h2>
<form class="qd-form" id="qdForumCreate"><input name="title" minlength="3" maxlength="160" required placeholder="Заголовок"><textarea name="content" minlength="3" maxlength="5000" required placeholder="Сообщение"></textarea><button class="qd-btn" type="submit">Опубликовать</button><div class="qd-notice" data-forum-status></div></form>
</section>
<div class="qd-section-head qd-local-forum-head"><div><span class="qd-kicker">Community threads</span><h2>Темы сообщества</h2></div></div>
<div class="qd-forum"><?php if (have_posts()): while (have_posts()): the_post(); ?>
<article class="qd-thread"><div class="qd-thread-meta"><?php echo esc_html(get_the_date()); ?> · <?php echo (int)get_comments_number(); ?> ответов</div><h2><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h2><p><?php echo esc_html(wp_trim_words(wp_strip_all_tags(get_the_content()),38)); ?></p></article>
<?php endwhile; else: ?><div class="qd-card"><h2>Пока тихо</h2><p>Создай первую тему после входа через Telegram.</p></div><?php endif; ?></div>
</div></main>
<?php get_footer(); ?>