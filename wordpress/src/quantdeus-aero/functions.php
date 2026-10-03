<?php
if (!defined('ABSPATH')) { exit; }

add_action('after_setup_theme', function(){
    add_theme_support('title-tag');
    add_theme_support('post-thumbnails');
    add_theme_support('html5',['search-form','gallery','caption','style','script']);
    add_theme_support('custom-logo',['height'=>160,'width'=>640,'flex-height'=>true,'flex-width'=>true,'unlink-homepage-logo'=>false]);
    add_theme_support('align-wide');
    add_theme_support('responsive-embeds');
    add_theme_support('wp-block-styles');
    add_theme_support('editor-styles');
    add_theme_support('custom-spacing');
    add_theme_support('custom-line-height');
    add_editor_style('style.css');
    register_nav_menus(['primary'=>'QuantDeus Primary Menu']);
});

add_action('wp_enqueue_scripts', function(){
    $v=wp_get_theme()->get('Version');
    wp_enqueue_style('dashicons');
    wp_enqueue_style('quantdeus-aero',get_stylesheet_uri(),[],$v);
    wp_enqueue_script('telegram-web-app','https://telegram.org/js/telegram-web-app.js',[],null,true);
    wp_enqueue_script('quantdeus-aero-app',get_template_directory_uri().'/app.js',['telegram-web-app'],$v,true);
    wp_localize_script('quantdeus-aero-app','QuantDeus',[
        'inquiryUrl'=>rest_url('quantdeus/v1/inquiries'),'dashboardUrl'=>rest_url('quantdeus/v1/dashboard'),
        'forumUrl'=>rest_url('quantdeus/v1/forum'),'telegramMiniappUrl'=>rest_url('quantdeus/v1/telegram/miniapp'),
        'telegramLoginUrl'=>rest_url('quantdeus/v1/telegram/login'),'telegramBrokerUrl'=>rest_url('quantdeus/v1/telegram/broker'),
        'telegramClientId'=>defined('QD_TELEGRAM_CLIENT_ID')?(string)QD_TELEGRAM_CLIENT_ID:'8122160274',
        'canonicalOrigin'=>'https://quantdeus.whf.bz',
        'githubStartUrl'=>'https://quantdeus.vercel.app/api/quantdeus/github-auth',
        'githubConfigUrl'=>'https://quantdeus.vercel.app/api/quantdeus/github-auth?health=1',
        'githubBrokerUrl'=>rest_url('quantdeus/v1/github/broker'),'githubConfigured'=>true,
        'loginUrl'=>home_url('/login/'),'logoutUrl'=>wp_logout_url(home_url('/login/')),
        'logoutEndpoint'=>rest_url('quantdeus/v1/session/logout'),
        'telegramBotUsername'=>defined('QD_TELEGRAM_BOT_USERNAME')?(string)QD_TELEGRAM_BOT_USERNAME:'QuantDeus_bot',
        'loggedIn'=>is_user_logged_in(),'userName'=>is_user_logged_in()?wp_get_current_user()->display_name:'',
        'userRole'=>is_user_logged_in()?(wp_get_current_user()->roles[0]??'qd_member'):'',
        'authProvider'=>is_user_logged_in()&&get_user_meta(get_current_user_id(),'qd_github_login',true)?'github':(is_user_logged_in()?'telegram':''),
        'nonce'=>is_user_logged_in()?wp_create_nonce('wp_rest'):'',
    ]);
});

add_action('wp_head',function(){
    if(!is_front_page()) return;
    $title='QuantDeus // Neon Horizon — Federation of Nodes';
    $description='QuantDeus — операционная система Неонового Горизонта и Федерация автономных узлов: исследования, проекты, AI Fleet, open artifacts и community.';
    echo '<meta name="description" content="'.esc_attr($description).'">'."\n";
    echo '<meta property="og:type" content="website">'."\n";
    echo '<meta property="og:title" content="'.esc_attr($title).'">'."\n";
    echo '<meta property="og:description" content="'.esc_attr($description).'">'."\n";
    echo '<meta property="og:url" content="'.esc_url(home_url('/')).'">'."\n";
    echo '<meta property="og:image" content="https://eol.jsc.nasa.gov/DatabaseImages/ESC/large/ISS075/ISS075-E-22382.JPG">'."\n";
});


function qd_aero_visual_url(string $key,string $fallback): string {
    $attachment_id=absint(get_theme_mod($key,0));
    if($attachment_id){
        $url=wp_get_attachment_image_url($attachment_id,'full');
        if($url) return (string)$url;
    }
    return $fallback;
}
function qd_aero_visual_alt(string $key,string $fallback): string {
    $attachment_id=absint(get_theme_mod($key,0));
    if($attachment_id){
        $alt=trim((string)get_post_meta($attachment_id,'_wp_attachment_image_alt',true));
        if($alt!=='') return $alt;
        $title=get_the_title($attachment_id);
        if($title) return (string)$title;
    }
    return $fallback;
}
function qd_aero_visual_credit(string $key,string $fallback): string {
    $attachment_id=absint(get_theme_mod($key,0));
    if($attachment_id){
        $caption=trim((string)wp_get_attachment_caption($attachment_id));
        if($caption!=='') return $caption;
        return 'QuantDeus Media Library';
    }
    return $fallback;
}
add_action('customize_register',function($wp_customize){
    $wp_customize->add_section('qd_aero_visuals',[
        'title'=>'QuantDeus · Cosmic Frutiger Aero',
        'description'=>'Нативные изображения портала из WordPress Media Library. Меняйте шапку, hero и галерею без правки PHP.',
        'priority'=>30,
    ]);
    $controls=[
        'qd_visual_header'=>['Header background','Космический фон шапки.'],
        'qd_visual_hero'=>['Hero image','Главное реальное изображение портала.'],
        'qd_visual_aero'=>['Earth / Aero image','Вода, зелень и голубое небо.'],
        'qd_visual_aurora'=>['Aurora image','Космос, атмосфера и сияние.'],
        'qd_visual_city'=>['Night Earth image','Ночной технологический слой.'],
        'qd_visual_ecology'=>['Ecology image','Экология и зелёный горизонт.'],
    ];
    foreach($controls as $key=>[$label,$description]){
        $wp_customize->add_setting($key,['default'=>0,'sanitize_callback'=>'absint','transport'=>'refresh']);
        $wp_customize->add_control(new WP_Customize_Media_Control($wp_customize,$key,[
            'label'=>$label,'description'=>$description,'section'=>'qd_aero_visuals','mime_type'=>'image',
        ]));
    }
});
add_filter('nav_menu_item_title',function($title,$item,$args,$depth){
    if(empty($args->theme_location) || $args->theme_location!=='primary' || $depth!==0) return $title;
    $map=[
        'QuantDeus'=>'dashicons-admin-home','Federation'=>'dashicons-networking','Horizons'=>'dashicons-chart-line',
        'Research'=>'dashicons-search','Build'=>'dashicons-hammer','Community'=>'dashicons-groups',
        'Knowledge'=>'dashicons-book-alt','About'=>'dashicons-info-outline',
    ];
    $plain=wp_strip_all_tags($title);
    if(!isset($map[$plain])) return $title;
    return '<span class="dashicons '.esc_attr($map[$plain]).'" aria-hidden="true"></span><span class="qd-menu-label">'.$title.'</span>';
},10,4);

function qd_aero_primary_menu_fallback(array $args=[]): void {
    $items=[
        ['QuantDeus',home_url('/')],['Federation',home_url('/federation/')],['Horizons',home_url('/horizons/')],
        ['Research',get_post_type_archive_link('qd_research')?:home_url('/research/')],
        ['Projects',get_post_type_archive_link('qd_project')?:home_url('/projects/')],
        ['AI Fleet',home_url('/ai-fleet/')],['Community',home_url('/community/')],
        ['Services',get_post_type_archive_link('qd_service')?:home_url('/services/')],
        ['Knowledge',home_url('/knowledge/')],['Manifesto',home_url('/manifesto/')],
    ];
    echo '<ul class="qd-menu">';
    foreach($items as [$label,$url]) echo '<li class="menu-item"><a href="'.esc_url($url).'">'.esc_html($label).'</a></li>';
    echo '</ul>';
}

function qd_aero_ensure_page(string $slug,string $title,string $content=''): int {
    $page=get_page_by_path($slug,OBJECT,'page'); if($page) return (int)$page->ID;
    $id=wp_insert_post(['post_type'=>'page','post_status'=>'publish','post_name'=>$slug,'post_title'=>$title,'post_content'=>$content],true);
    return is_wp_error($id)?0:(int)$id;
}
function qd_aero_ensure_login_page(): void {
    qd_aero_ensure_page('login','Вход','');
}
function qd_aero_ensure_portal_pages(): void {
    $pages=[
        'login'=>['Вход',''],'federation'=>['Federation','Каталог автономных совместимых узлов QuantDeus Federation.'],
        'horizons'=>['Horizons','2028 / 2041 / 2126.'],'ai-fleet'=>['AI Fleet','Digital Fleet Operations под Human Override.'],
        'community'=>['Community','Участие, contributors, onboarding, форум и право EXIT.'],
        'ksenia-cherednikova'=>['Ксения Чередникова','Media hub и booking. Контент только из подтверждённых источников.'],
        'media'=>['Media','Gallery, video, presentations and source-attributed media.'],
        'news'=>['News','Новости QuantDeus и Living Manifest.'],'knowledge'=>['Knowledge','Документы, публикации и open artifacts.'],
        'manifesto'=>['Manifesto','Neon Horizon v4.0 — CURRENT CANON.'],'about'=>['About','Миссия и Federation of Nodes.'],
        'account'=>['Account','Профиль пользователя и переносимость участия.'],
    ];
    foreach($pages as $slug=>[$title,$content]) qd_aero_ensure_page($slug,$title,$content);
}
add_action('init','qd_aero_ensure_portal_pages',35);

function qd_aero_ensure_primary_menu(): void {
    $locations=get_theme_mod('nav_menu_locations',[]); $menu=null;
    if(!empty($locations['primary'])){
        $assigned=wp_get_nav_menu_object((int)$locations['primary']);
        if($assigned && $assigned->name!=='QuantDeus Primary') return;
        if($assigned) $menu=$assigned;
    }
    if(!$menu) $menu=wp_get_nav_menu_object('QuantDeus Primary');
    if(!$menu){ $id=wp_create_nav_menu('QuantDeus Primary'); if(is_wp_error($id)) return; $menu=wp_get_nav_menu_object($id); }
    if(!$menu) return;

    $version='neon-horizon-v4-portal-1';
    if(get_option('qd_primary_menu_version')!==$version){
        foreach(wp_get_nav_menu_items($menu->term_id)?:[] as $item) wp_delete_post($item->ID,true);
        $archives=[
            'nodes'=>get_post_type_archive_link('qd_node')?:home_url('/federation/nodes/'),
            'research'=>get_post_type_archive_link('qd_research')?:home_url('/research/'),
            'projects'=>get_post_type_archive_link('qd_project')?:home_url('/projects/'),
            'services'=>get_post_type_archive_link('qd_service')?:home_url('/services/'),
            'artifacts'=>get_post_type_archive_link('qd_artifact')?:home_url('/knowledge/artifacts/'),
            'results'=>get_post_type_archive_link('qd_result')?:home_url('/evidence/results/'),
        ];
        $spec=[
            ['q','QuantDeus',home_url('/'),null],['fed','Federation',home_url('/federation/'),null],['nodes','Nodes',$archives['nodes'],'fed'],
            ['hor','Horizons',home_url('/horizons/'),null],['research','Research',$archives['research'],null],
            ['warp','Warp / Gravity',home_url('/research/domain/warp-gravity/'),'research'],['space','Space',home_url('/research/domain/space/'),'research'],
            ['energy','Energy',home_url('/research/domain/energy/'),'research'],['ai','AI',home_url('/research/domain/ai/'),'research'],
            ['eco','Ecology',home_url('/research/domain/ecology/'),'research'],['human','Human Potential',home_url('/research/domain/human-potential/'),'research'],
            ['exp','Experimental Research',home_url('/research/domain/experimental/'),'research'],
            ['build','Build',home_url('/projects/'),null],['projects','Projects',$archives['projects'],'build'],
            ['fleet','AI Fleet',home_url('/ai-fleet/'),'build'],['services','Store / Services',$archives['services'],'build'],
            ['community','Community',home_url('/community/'),null],['forum','Forum',home_url('/forum/'),'community'],
            ['ksenia','Ksenia Cherednikova',home_url('/ksenia-cherednikova/'),'community'],['media','Media',home_url('/media/'),'community'],
            ['gallery','Gallery',home_url('/#visuals'),'community'],['news','News',home_url('/news/'),'community'],
            ['knowledge','Knowledge',home_url('/knowledge/'),null],['artifacts','Open Artifacts',$archives['artifacts'],'knowledge'],
            ['results','Evidence Results',$archives['results'],'knowledge'],['manifesto','Manifesto',home_url('/manifesto/'),'knowledge'],
            ['about','About',home_url('/about/'),null],
        ];
        $ids=[];
        foreach($spec as [$key,$title,$url,$parent]){
            $id=wp_update_nav_menu_item($menu->term_id,0,[
                'menu-item-title'=>$title,'menu-item-url'=>$url,'menu-item-status'=>'publish','menu-item-type'=>'custom',
                'menu-item-parent-id'=>$parent?($ids[$parent]??0):0,
            ]);
            if(!is_wp_error($id)) $ids[$key]=(int)$id;
        }
        update_option('qd_primary_menu_version',$version,false);
    }
    $locations['primary']=(int)$menu->term_id; set_theme_mod('nav_menu_locations',$locations);
}
add_action('after_switch_theme','qd_aero_ensure_primary_menu');
add_action('init','qd_aero_ensure_primary_menu',45);
