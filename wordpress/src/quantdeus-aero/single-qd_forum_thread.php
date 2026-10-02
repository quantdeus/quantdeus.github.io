<?php if (!defined('ABSPATH')) { exit; } the_post(); $thread_id=get_the_ID(); ?><!doctype html>
<html <?php language_attributes(); ?>><head><meta charset="<?php bloginfo('charset'); ?>"><meta name="viewport" content="width=device-width,initial-scale=1"><?php wp_head(); ?></head>
<body <?php body_class(); ?>><?php wp_body_open(); ?>
<header class="qd-nav"><div class="qd-shell qd-navin"><a class="qd-brand" href="<?php echo esc_url(home_url('/')); ?>"><span class="qd-orb"></span><span>QuantDeus</span></a><nav class="qd-links"><a href="<?php echo esc_url(get_post_type_archive_link('qd_forum_thread')); ?>">← Форум</a><a href="<?php echo esc_url(home_url('/')); ?>">Холдинг</a></nav></div></header>
<main class="qd-section"><div class="qd-shell">
<article class="qd-card qd-thread-view"><div class="qd-thread-meta"><?php echo esc_html(get_the_date()); ?> · <?php echo (int)get_comments_number(); ?> ответов</div><h1><?php the_title(); ?></h1><div class="qd-thread-body"><?php echo wp_kses_post(wpautop(get_the_content())); ?></div></article>
<section class="qd-section-tight"><h2>Ответы</h2><div class="qd-forum"><?php
$comments=get_comments(['post_id'=>$thread_id,'status'=>'approve','orderby'=>'comment_date_gmt','order'=>'ASC']);
if ($comments): foreach($comments as $comment): ?>
<article class="qd-thread"><div class="qd-thread-meta"><?php echo esc_html(get_comment_author($comment)); ?> · <?php echo esc_html(get_comment_date('', $comment)); ?></div><div><?php echo wp_kses_post(wpautop($comment->comment_content)); ?></div></article>
<?php endforeach; else: ?><div class="qd-card"><p>Ответов пока нет.</p></div><?php endif; ?></div></section>
<section class="qd-card qd-forum-create"><div class="qd-authline"><span data-auth-state><?php echo is_user_logged_in() ? esc_html('Пользователь · '.wp_get_current_user()->display_name) : 'Войди через Telegram, чтобы ответить'; ?></span><div data-telegram-widget data-guest-only></div></div>
<form class="qd-form" id="qdForumReply" data-thread-id="<?php echo (int)$thread_id; ?>" data-auth-required <?php if (!is_user_logged_in()) echo 'hidden'; ?>><textarea name="content" minlength="1" maxlength="5000" required placeholder="Твой ответ"></textarea><button class="qd-btn" type="submit">Ответить</button><div class="qd-notice" data-forum-status></div></form></section>
</div></main>
<footer><div class="qd-shell">QuantDeus Forum · WordPress canonical runtime</div></footer>
<?php wp_footer(); ?></body></html>