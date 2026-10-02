<!doctype html>
<html <?php language_attributes(); ?>>
<head>
  <meta charset="<?php bloginfo('charset'); ?>">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <?php wp_head(); ?>
</head>
<body <?php body_class(); ?>><?php wp_body_open(); ?>
<header class="qd-nav">
  <div class="qd-shell qd-navin">
    <div class="qd-brand-wrap">
      <?php if (has_custom_logo()): ?>
        <?php the_custom_logo(); ?>
      <?php else: ?>
        <a class="qd-brand" href="<?php echo esc_url(home_url('/')); ?>"><img src="<?php echo esc_url(get_template_directory_uri().'/logo.svg'); ?>" alt="QuantDeus"></a>
      <?php endif; ?>
    </div>
    <button class="qd-menu-toggle" type="button" aria-expanded="false" aria-controls="qd-primary-nav" data-menu-toggle>
      <span></span><span></span><span></span><span class="screen-reader-text">Открыть меню</span>
    </button>
    <nav class="qd-primary-nav" id="qd-primary-nav" aria-label="<?php esc_attr_e('Верхнее меню','quantdeus-aero'); ?>" data-primary-nav>
      <?php wp_nav_menu([
        'theme_location'=>'primary',
        'container'=>false,
        'menu_class'=>'qd-menu',
        'menu_id'=>'qd-primary-menu',
        'fallback_cb'=>'qd_aero_primary_menu_fallback',
        'depth'=>3,
      ]); ?>
    </nav>
    <button class="qd-theme-toggle" type="button" data-theme-toggle aria-pressed="false" aria-label="Переключить Day / Night режим">DAY / NIGHT</button>
    <a class="qd-login-link<?php echo is_page('login') ? ' is-active' : ''; ?>" href="<?php echo esc_url(home_url('/login/')); ?>">
      <?php echo is_user_logged_in() ? 'Аккаунт' : 'Войти'; ?>
    </a>
  </div>
</header>
