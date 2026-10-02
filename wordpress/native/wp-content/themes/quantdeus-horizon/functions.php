<?php
if (!defined('ABSPATH')) { exit; }

add_action('wp_enqueue_scripts', function () {
    $theme = wp_get_theme();
    wp_enqueue_style('dashicons');
    wp_enqueue_style('quantdeus-horizon', get_stylesheet_uri(), [], $theme->get('Version'));
    $script = get_stylesheet_directory() . '/assets/native.js';
    wp_enqueue_script('quantdeus-horizon-native', get_stylesheet_directory_uri() . '/assets/native.js', [], file_exists($script) ? (string) filemtime($script) : $theme->get('Version'), true);
    wp_localize_script('quantdeus-horizon-native', 'QuantDeusNative', [
        'servicesUrl' => esc_url_raw(rest_url('quantdeus/v1/services')),
        'inquiryUrl' => esc_url_raw(rest_url('quantdeus/v1/inquiries')),
        'forumUrl' => esc_url_raw(rest_url('quantdeus/v1/forum')),
        'telegramBrokerUrl' => esc_url_raw(rest_url('quantdeus/v1/telegram/broker')),
        'telegramStartUrl' => 'https://quantdeus.vercel.app/api/quantdeus/bot-auth?action=start',
        'githubStartUrl' => esc_url_raw(rest_url('quantdeus/v1/github/start')),
        'loginUrl' => esc_url_raw(home_url('/login/')),
        'accountUrl' => esc_url_raw(home_url('/account/')),
        'homeUrl' => esc_url_raw(home_url('/')),
        'loggedIn' => is_user_logged_in(),
        'nonce' => wp_create_nonce('wp_rest'),
    ]);
});

add_action('init', function () {
    if (function_exists('register_block_pattern_category')) {
        register_block_pattern_category('quantdeus', ['label' => __('QuantDeus', 'quantdeus-horizon')]);
    }
});

function qd_horizon_seed_pages(): void {
    $pages = [
        'home'=>'QuantDeus','federation'=>'Federation','horizons'=>'Horizons','research'=>'Research','projects'=>'Projects',
        'ai-fleet'=>'AI Fleet','community'=>'Community','services'=>'Services','ksenia-cherednikova'=>'Ксения Чередникова',
        'media'=>'Media','news'=>'News','knowledge'=>'Knowledge','manifesto'=>'Manifesto','about'=>'About','login'=>'Login','account'=>'Account',
    ];
    $home_id = 0;
    foreach ($pages as $slug => $title) {
        $page = get_page_by_path($slug, OBJECT, 'page');
        if (!$page) {
            $id = wp_insert_post([
                'post_type'=>'page','post_status'=>'publish','post_name'=>$slug,'post_title'=>$title,
                'post_content'=>$slug === 'ksenia-cherednikova'
                    ? '<!-- wp:paragraph --><p>Медиа, биография и ссылки публикуются только из подтверждённых источников через нативную медиатеку WordPress.</p><!-- /wp:paragraph -->'
                    : '',
            ]);
            if (!is_wp_error($id)) { $page = get_post($id); }
        }
        if ($slug === 'home' && $page) { $home_id = (int) $page->ID; }
    }
    if ($home_id > 0) { update_option('show_on_front','page'); update_option('page_on_front',$home_id); }
}
add_action('after_switch_theme', 'qd_horizon_seed_pages');

add_filter('body_class', function (array $classes): array { $classes[]='quantdeus-horizon'; return $classes; });
