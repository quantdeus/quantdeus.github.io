<?php if (!defined('ABSPATH')) { exit; } ?><!doctype html>
<html <?php language_attributes(); ?>><head><meta charset="<?php bloginfo('charset'); ?>"><meta name="viewport" content="width=device-width,initial-scale=1"><?php wp_head(); ?></head>
<body <?php body_class(); ?>><?php wp_body_open(); ?>
<header class="qd-nav"><div class="qd-shell qd-navin"><a class="qd-brand" href="<?php echo esc_url(home_url('/')); ?>"><span class="qd-orb"></span><span>QuantDeus</span></a><nav class="qd-links"><a href="<?php echo esc_url(home_url('/')); ?>">Холдинг</a><a href="<?php echo esc_url(home_url('/#services')); ?>">Услуги</a><a href="<?php echo esc_url(get_post_type_archive_link('qd_forum_thread')); ?>">Форум</a></nav></div></header>
<main class="qd-section"><div class="qd-shell">
<div class="qd-kicker">Community · WordPress</div><h1 class="qd-page-title">Форум QuantDeus</h1>
<div class="qd-authline"><span data-auth-state><?php echo is_user_logged_in() ? esc_html('Пользователь · '.wp_get_current_user()->display_name) : 'Гость · чтение открыто'; ?></span><div data-telegram-widget data-guest-only></div></div>
<section class="qd-card qd-forum-create" data-auth-required <?php if (!is_user_logged_in()) echo 'hidden'; ?>>
<h2>Новая тема</h2>
<form class="qd-form" id="qdForumCreate"><input name="title" minlength="3" maxlength="160" required placeholder="Заголовок"><textarea name="content" minlength="3" maxlength="5000" required placeholder="Сообщение"></textarea><button class="qd-btn" type="submit">Опубликовать</button><div class="qd-notice" data-forum-status></div></form>
</section>
<div class="qd-forum"><?php if (have_posts()): while (have_posts()): the_post(); ?>
<article class="qd-thread"><div class="qd-thread-meta"><?php echo esc_html(get_the_date()); ?> · <?php echo (int)get_comments_number(); ?> ответов</div><h2><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h2><p><?php echo esc_html(wp_trim_words(wp_strip_all_tags(get_the_content()),38)); ?></p></article>
<?php endwhile; else: ?><div class="qd-card"><h2>Пока тихо</h2><p>Создай первую тему после входа через Telegram.</p></div><?php endif; ?></div>
</div></main>
<footer><div class="qd-shell">QuantDeus Forum · WordPress posts/comments</div></footer>
<?php wp_footer(); ?></body></html>