<!doctype html>
<html <?php language_attributes(); ?>>
<head>
  <meta charset="<?php bloginfo('charset'); ?>">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <?php wp_head(); ?>
</head>
<body <?php body_class(); ?>><?php wp_body_open(); ?>
<?php $qd_header_image=qd_aero_visual_url('qd_visual_header','https://eol.jsc.nasa.gov/DatabaseImages/ESC/large/ISS075/ISS075-E-22382.JPG'); ?>
<header class="qd-nav" style="--qd-header-image:url('<?php echo esc_url($qd_header_image); ?>')">
  <div class="qd-shell qd-navin">
    <div class="qd-brand-wrap">
      <?php if (has_custom_logo()): ?>
        <?php the_custom_logo(); ?>
      <?php else: ?>
        <a class="qd-brand qd-brand-text" href="<?php echo esc_url(home_url('/')); ?>"><span class="qd-brand-orb" aria-hidden="true">◉</span><span><strong>QuantDeus</strong><small>NEON HORIZON</small></span></a>
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
