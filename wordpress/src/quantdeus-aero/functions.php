<?php
if (!defined('ABSPATH')) { exit; }

add_action('after_setup_theme', function(){
    add_theme_support('title-tag');
    add_theme_support('post-thumbnails');
    add_theme_support('html5',['search-form','gallery','caption','style','script']);
    register_nav_menus(['primary'=>'Primary']);
});

add_action('wp_enqueue_scripts', function(){
    $version = wp_get_theme()->get('Version');
    wp_enqueue_style('quantdeus-aero', get_stylesheet_uri(), [], $version);
    wp_enqueue_script('telegram-web-app', 'https://telegram.org/js/telegram-web-app.js', [], null, true);
    wp_enqueue_script('quantdeus-aero-app', get_template_directory_uri().'/app.js', ['telegram-web-app'], $version, true);
    wp_localize_script('quantdeus-aero-app', 'QuantDeus', [
        'inquiryUrl' => rest_url('quantdeus/v1/inquiries'),
        'forumUrl' => rest_url('quantdeus/v1/forum'),
        'telegramMiniappUrl' => rest_url('quantdeus/v1/telegram/miniapp'),
        'telegramLoginUrl' => rest_url('quantdeus/v1/telegram/login'),
        'githubStartUrl' => rest_url('quantdeus/v1/github/start'),
        'githubConfigured' => defined('QD_GITHUB_CLIENT_ID') && defined('QD_GITHUB_CLIENT_SECRET') && trim((string)QD_GITHUB_CLIENT_ID)!=='' && trim((string)QD_GITHUB_CLIENT_SECRET)!=='',
        'telegramBotUsername' => defined('QD_TELEGRAM_BOT_USERNAME') ? (string)QD_TELEGRAM_BOT_USERNAME : 'QuantDeus_bot',
        'loggedIn' => is_user_logged_in(),
        'userName' => is_user_logged_in() ? wp_get_current_user()->display_name : '',
        'nonce' => is_user_logged_in() ? wp_create_nonce('wp_rest') : '',
    ]);
});

add_action('wp_head', function(){
    if (!is_front_page()) return;
    $title = 'QuantDeus — технологии, исследования, медиа и сообщество';
    $description = 'QuantDeus Holding: автоматизация бизнеса, исследования, медиа-проекты, концерты и сообщество на единой WordPress-платформе.';
    echo '<meta name="description" content="'.esc_attr($description).'">'."\n";
    echo '<meta property="og:type" content="website">'."\n";
    echo '<meta property="og:title" content="'.esc_attr($title).'">'."\n";
    echo '<meta property="og:description" content="'.esc_attr($description).'">'."\n";
    echo '<meta property="og:url" content="'.esc_url(home_url('/')).'">'."\n";
    echo '<meta property="og:image" content="https://eol.jsc.nasa.gov/DatabaseImages/ESC/large/ISS075/ISS075-E-22382.JPG">'."\n";
});
