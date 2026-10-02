<?php
if (!defined('ABSPATH')) { exit; }

add_action('after_setup_theme', function(){
    add_theme_support('title-tag');
    add_theme_support('post-thumbnails');
    add_theme_support('html5',['search-form','gallery','caption','style','script']);
    add_theme_support('custom-logo',[
        'height'=>160,
        'width'=>640,
        'flex-height'=>true,
        'flex-width'=>true,
        'unlink-homepage-logo'=>false,
    ]);
    register_nav_menus(['primary'=>'Верхнее меню']);
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
        'telegramBrokerUrl' => rest_url('quantdeus/v1/telegram/broker'),
        'telegramClientId' => defined('QD_TELEGRAM_CLIENT_ID') ? (string)QD_TELEGRAM_CLIENT_ID : '8122160274',
        'canonicalOrigin' => 'https://quantdeus.github.io',
        'githubStartUrl' => 'https://quantdeus.vercel.app/api/quantdeus/github-auth',
        'githubConfigUrl' => 'https://quantdeus.vercel.app/api/quantdeus/github-auth?health=1',
        'githubBrokerUrl' => rest_url('quantdeus/v1/github/broker'),
        'githubConfigured' => true,
        'loginUrl' => home_url('/login/'),
        'logoutUrl' => wp_logout_url(home_url('/login/')),
        'logoutEndpoint' => rest_url('quantdeus/v1/session/logout'),
        'telegramBotUsername' => defined('QD_TELEGRAM_BOT_USERNAME') ? (string)QD_TELEGRAM_BOT_USERNAME : 'QuantDeus_bot',
        'loggedIn' => is_user_logged_in(),
        'userName' => is_user_logged_in() ? wp_get_current_user()->display_name : '',
        'userRole' => is_user_logged_in() ? (wp_get_current_user()->roles[0] ?? 'qd_member') : '',
        'authProvider' => is_user_logged_in() && get_user_meta(get_current_user_id(),'qd_github_login',true) ? 'github' : (is_user_logged_in() ? 'telegram' : ''),
        'nonce' => is_user_logged_in() ? wp_create_nonce('wp_rest') : '',
    ]);
});

add_action('wp_head', function(){
    if (!is_front_page()) return;
    $title = 'QuantDeus // Neon Horizon — Federation Portal & Civilization OS';
    $description = 'QuantDeus — WordPress-портал Неонового Горизонта: Федерация автономных узлов, исследования, проекты, AI Fleet, открытые артефакты, сообщество и услуги.';
    echo '<meta name="description" content="'.esc_attr($description).'">'."\n";
    echo '<meta property="og:type" content="website">'."\n";
    echo '<meta property="og:title" content="'.esc_attr($title).'">'."\n";
    echo '<meta property="og:description" content="'.esc_attr($description).'">'."\n";
    echo '<meta property="og:url" content="'.esc_url(home_url('/')).'">'."\n";
    echo '<meta property="og:image" content="https://eol.jsc.nasa.gov/DatabaseImages/ESC/large/ISS075/ISS075-E-22382.JPG">'."\n";
    echo '<link rel="canonical" href="'.esc_url(home_url('/')).'">'."\n";
});


function qd_aero_primary_items(): array {
    return [
        ['QuantDeus',home_url('/')],
        ['Federation',get_post_type_archive_link('qd_node') ?: home_url('/federation/nodes/')],
        ['Horizons',home_url('/#horizons')],
        ['Research',get_post_type_archive_link('qd_research') ?: home_url('/research/')],
        ['Projects',get_post_type_archive_link('qd_project') ?: home_url('/projects/')],
        ['AI Fleet',home_url('/#fleet')],
        ['Community',home_url('/#community')],
        ['Forum',get_post_type_archive_link('qd_forum_thread') ?: home_url('/forum/')],
        ['Services',home_url('/#services')],
        ['Ksenia',home_url('/#ksenia')],
        ['Knowledge',get_post_type_archive_link('qd_artifact') ?: home_url('/knowledge/artifacts/')],
        ['News',home_url('/#news')],
        ['Manifesto',home_url('/#manifesto')],
        ['About',home_url('/#about')],
    ];
}

function qd_aero_primary_menu_fallback(array $args=[]): void {
    echo '<ul class="qd-menu">';
    foreach(qd_aero_primary_items() as [$label,$url]){
        echo '<li class="menu-item"><a href="'.esc_url($url).'">'.esc_html($label).'</a></li>';
    }
    echo '</ul>';
}

function qd_aero_ensure_login_page(): void {
    $page=get_page_by_path('login',OBJECT,'page');
    if ($page) return;
    wp_insert_post([
        'post_type'=>'page',
        'post_status'=>'publish',
        'post_name'=>'login',
        'post_title'=>'Вход',
        'post_content'=>'',
    ]);
}

function qd_aero_ensure_primary_menu(): void {
    $locations=get_theme_mod('nav_menu_locations',[]);
    if (!empty($locations['primary'])) {
        $bound=wp_get_nav_menu_object((int)$locations['primary']);
        if ($bound && $bound->name!=='QuantDeus Primary') return;
    }

    $menu=wp_get_nav_menu_object('QuantDeus Primary');
    if (!$menu) {
        $menu_id=wp_create_nav_menu('QuantDeus Primary');
        if (is_wp_error($menu_id)) return;
        $menu=wp_get_nav_menu_object($menu_id);
    }
    if (!$menu) return;

    $existing=wp_get_nav_menu_items($menu->term_id) ?: [];
    $urls=[];
    foreach($existing as $item) $urls[untrailingslashit((string)$item->url)]=true;

    foreach(qd_aero_primary_items() as [$title,$url]){
        $key=untrailingslashit((string)$url);
        if (isset($urls[$key])) continue;
        wp_update_nav_menu_item($menu->term_id,0,[
            'menu-item-title'=>$title,
            'menu-item-url'=>$url,
            'menu-item-status'=>'publish',
            'menu-item-type'=>'custom',
        ]);
        $urls[$key]=true;
    }

    $locations['primary']=(int)$menu->term_id;
    set_theme_mod('nav_menu_locations',$locations);
}
add_action('after_switch_theme','qd_aero_ensure_primary_menu');
add_action('init','qd_aero_ensure_primary_menu',40);

add_action('init','qd_aero_ensure_login_page',35);
