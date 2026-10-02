<?php
/**
 * Plugin Name: QuantDeus Core
 * Description: Canonical WordPress application layer for QuantDeus.
 * Version: 1.1.0
 * Requires PHP: 8.1
 * Text Domain: quantdeus
 */
if (!defined('ABSPATH')) { exit; }

final class QD_Core {
    public const NS = 'quantdeus/v1';
    public const VERSION = '1.1.0';

    public static function boot(): void {
        add_action('init', [self::class, 'register_types']);
        add_action('init', [self::class, 'maybe_upgrade'], 20);
        add_action('rest_api_init', [self::class, 'routes']);
        add_action('admin_menu', [self::class, 'admin_menu']);
        add_action('wp_head', [self::class, 'schema'], 40);
    }

    public static function activate(): void {
        self::register_types();
        self::roles();
        self::seed_services();
        update_option('qd_core_version', self::VERSION, false);
        flush_rewrite_rules(false);
    }

    public static function maybe_upgrade(): void {
        if ((string)get_option('qd_core_version') === self::VERSION) return;
        self::roles();
        self::seed_services();
        update_option('qd_core_version', self::VERSION, false);
        flush_rewrite_rules(false);
    }

    public static function deactivate(): void { flush_rewrite_rules(false); }

    private static function roles(): void {
        $definitions = [
            'qd_member' => ['QuantDeus Member', ['read' => true]],
            'qd_agent' => ['QuantDeus Agent', ['read' => true, 'qd_agent_context' => true]],
            'qd_moderator' => ['QuantDeus Moderator', [
                'read' => true, 'edit_posts' => true, 'edit_others_posts' => true,
                'publish_posts' => true, 'moderate_comments' => true,
                'qd_moderate_forum' => true,
            ]],
        ];
        foreach ($definitions as $slug => [$label, $caps]) {
            if (!get_role($slug)) add_role($slug, $label, $caps);
            $role = get_role($slug);
            if ($role) foreach ($caps as $cap => $grant) $role->add_cap($cap, $grant);
        }
        $admin = get_role('administrator');
        if ($admin) {
            $admin->add_cap('qd_agent_context');
            $admin->add_cap('qd_moderate_forum');
        }
    }

    public static function register_types(): void {
        register_post_type('qd_service', [
            'label' => 'Services', 'public' => true, 'show_in_rest' => true,
            'supports' => ['title','editor','excerpt','thumbnail'], 'rewrite' => ['slug'=>'services'],
        ]);
        register_post_type('qd_inquiry', [
            'label' => 'Inquiries', 'public' => false, 'show_ui' => true, 'show_in_rest' => false,
            'supports' => ['title','editor','custom-fields'],
        ]);
        register_post_type('qd_forum_thread', [
            'label' => 'Forum', 'public' => true, 'show_in_rest' => true, 'has_archive' => 'forum',
            'supports' => ['title','editor','author','comments'], 'rewrite' => ['slug'=>'forum'],
        ]);
        register_post_type('qd_project', [
            'label' => 'Projects', 'public' => true, 'show_in_rest' => true,
            'supports' => ['title','editor','excerpt','thumbnail'], 'rewrite' => ['slug'=>'projects'],
        ]);
        register_post_type('qd_evidence', [
            'label' => 'Evidence', 'public' => false, 'show_ui' => true, 'show_in_rest' => false,
            'supports' => ['title','editor','custom-fields'],
        ]);
    }

    private static function service_seed(): array {
        return [
            'business-automation' => ['Автоматизация бизнеса','Автоматизация процессов, интеграции, AI-агенты и цифровые рабочие контуры.'],
            'ksenia-cherednikova-concert' => ['Концерт Ксении Чередниковой','Концертные и event-заявки Ксении Чередниковой.'],
        ];
    }

    private static function seed_services(): void {
        foreach (self::service_seed() as $slug => [$title,$description]) {
            $existing = get_page_by_path($slug, OBJECT, 'qd_service');
            $id = $existing ? $existing->ID : wp_insert_post([
                'post_type'=>'qd_service','post_status'=>'publish','post_name'=>$slug,
                'post_title'=>$title,'post_content'=>$description,
            ]);
            if ($id && !is_wp_error($id)) {
                update_post_meta($id,'qd_service_id',$slug);
                update_post_meta($id,'qd_pricing_mode','quote');
                update_post_meta($id,'qd_available','1');
            }
        }
    }

    private static function service_data(WP_Post $post): array {
        return [
            'id' => (string) (get_post_meta($post->ID,'qd_service_id',true) ?: $post->post_name),
            'name' => get_the_title($post),
            'description' => wp_strip_all_tags($post->post_content),
            'pricing_mode' => (string) (get_post_meta($post->ID,'qd_pricing_mode',true) ?: 'quote'),
            'available' => get_post_meta($post->ID,'qd_available',true) !== '0',
        ];
    }

    public static function routes(): void {
        register_rest_route(self::NS, '/health', [
            'methods'=>'GET','permission_callback'=>'__return_true',
            'callback'=>fn()=>rest_ensure_response([
                'ok'=>true,'engine'=>'wordpress','version'=>self::VERSION,
                'storage'=>'wordpress','make_dependency'=>false,
            ]),
        ]);
        register_rest_route(self::NS, '/services', [
            'methods'=>'GET','permission_callback'=>'__return_true',
            'callback'=>function() {
                $posts=get_posts(['post_type'=>'qd_service','post_status'=>'publish','numberposts'=>100,'orderby'=>'menu_order title','order'=>'ASC']);
                return rest_ensure_response(array_map([self::class,'service_data'],$posts));
            },
        ]);
        register_rest_route(self::NS, '/inquiries', [
            'methods'=>'POST','permission_callback'=>'__return_true','callback'=>[self::class,'create_inquiry'],
        ]);
        register_rest_route(self::NS, '/forum', [
            ['methods'=>'GET','permission_callback'=>'__return_true','callback'=>[self::class,'forum_list']],
            ['methods'=>'POST','permission_callback'=>fn()=>is_user_logged_in(),'callback'=>[self::class,'forum_create']],
        ]);
        register_rest_route(self::NS, '/forum/(?P<id>\d+)/reply', [
            'methods'=>'POST','permission_callback'=>fn()=>is_user_logged_in(),'callback'=>[self::class,'forum_reply'],
        ]);
        register_rest_route(self::NS, '/telegram/config', [
            'methods'=>'GET','permission_callback'=>'__return_true','callback'=>fn()=>rest_ensure_response([
                'client_id'=>defined('QD_TELEGRAM_CLIENT_ID') ? (string)QD_TELEGRAM_CLIENT_ID : '8122160274',
                'username'=>defined('QD_TELEGRAM_BOT_USERNAME') ? (string)QD_TELEGRAM_BOT_USERNAME : 'QuantDeus_bot',
            ]),
        ]);
        register_rest_route(self::NS, '/telegram/miniapp', [
            'methods'=>'POST','permission_callback'=>'__return_true','callback'=>[self::class,'telegram_login'],
        ]);
        register_rest_route(self::NS, '/telegram/login', [
            'methods'=>'POST','permission_callback'=>'__return_true','callback'=>[self::class,'telegram_web_login'],
        ]);
        register_rest_route(self::NS, '/agent/context', [
            'methods'=>'GET','permission_callback'=>fn()=>current_user_can('qd_agent_context') || current_user_can('manage_options'),
            'callback'=>fn()=>rest_ensure_response([
                'site'=>get_bloginfo('name'),'engine'=>'wordpress',
                'services'=>(int)(wp_count_posts('qd_service')->publish ?? 0),
                'forum_threads'=>(int)(wp_count_posts('qd_forum_thread')->publish ?? 0),
            ]),
        ]);
    }

    private static function text($value, int $max): string {
        return mb_substr(trim(wp_strip_all_tags((string)$value)),0,$max);
    }

    public static function create_inquiry(WP_REST_Request $req) {
        if (self::text($req->get_param('website'),100) !== '') return new WP_Error('spam','Rejected',['status'=>400]);
        $service=self::text($req->get_param('service_id'),100);
        $note=self::text($req->get_param('note'),1600);
        $contact=self::text($req->get_param('contact'),320);
        if (mb_strlen($note)<10) return new WP_Error('note_required','Describe the request',['status'=>400]);
        if (mb_strlen($contact)<3 && !is_user_logged_in()) return new WP_Error('contact_required','Contact required',['status'=>400]);
        $allowed=array_keys(self::service_seed());
        if (!in_array($service,$allowed,true)) return new WP_Error('service_unknown','Unknown service',['status'=>404]);

        $ip=$_SERVER['REMOTE_ADDR'] ?? 'unknown';
        $bucket='qd_inquiry_'.md5($ip.'|'.($_SERVER['HTTP_USER_AGENT'] ?? ''));
        $count=(int)get_transient($bucket);
        if ($count>=5) return new WP_Error('rate_limited','Too many inquiries',['status'=>429]);
        set_transient($bucket,$count+1,15*MINUTE_IN_SECONDS);

        $id=wp_insert_post([
            'post_type'=>'qd_inquiry','post_status'=>'private',
            'post_title'=>sprintf('Inquiry %s — %s',gmdate('Y-m-d H:i'),$service),
            'post_content'=>$note,
        ],true);
        if (is_wp_error($id)) return $id;
        update_post_meta($id,'qd_service_id',$service);
        update_post_meta($id,'qd_contact',$contact);
        update_post_meta($id,'qd_source','wordpress_guest');
        update_post_meta($id,'qd_status','new');
        return new WP_REST_Response(['ok'=>true,'id'=>$id,'status'=>'new','delivery'=>'wordpress'],201);
    }

    public static function forum_list() {
        $posts=get_posts(['post_type'=>'qd_forum_thread','post_status'=>'publish','numberposts'=>50,'orderby'=>'date','order'=>'DESC']);
        return rest_ensure_response(array_map(fn($p)=>[
            'id'=>$p->ID,'title'=>get_the_title($p),'content'=>apply_filters('the_content',$p->post_content),
            'date'=>get_post_time(DATE_ATOM,true,$p),'replies'=>(int)get_comments_number($p),
        ],$posts));
    }

    public static function forum_create(WP_REST_Request $req) {
        $title=self::text($req->get_param('title'),160); $body=self::text($req->get_param('content'),5000);
        if (mb_strlen($title)<3 || mb_strlen($body)<3) return new WP_Error('invalid_thread','Title/content required',['status'=>400]);
        $id=wp_insert_post(['post_type'=>'qd_forum_thread','post_status'=>'publish','post_title'=>$title,'post_content'=>$body,'post_author'=>get_current_user_id()],true);
        if (is_wp_error($id)) return $id;
        return new WP_REST_Response(['ok'=>true,'id'=>$id,'url'=>get_permalink($id)],201);
    }

    public static function forum_reply(WP_REST_Request $req) {
        $post=get_post((int)$req['id']); $body=self::text($req->get_param('content'),5000);
        if (!$post || $post->post_type!=='qd_forum_thread') return new WP_Error('thread_not_found','Not found',['status'=>404]);
        if (mb_strlen($body)<1) return new WP_Error('reply_required','Reply required',['status'=>400]);
        $user=wp_get_current_user();
        $comment=wp_insert_comment([
            'comment_post_ID'=>$post->ID,'comment_content'=>$body,'user_id'=>get_current_user_id(),'comment_approved'=>1,
            'comment_author'=>$user->display_name,'comment_author_email'=>$user->user_email,
        ]);
        return new WP_REST_Response(['ok'=>(bool)$comment,'id'=>$comment],201);
    }

    private static function telegram_bot_token(): string {
        return defined('QD_TELEGRAM_BOT_TOKEN') ? trim((string)QD_TELEGRAM_BOT_TOKEN) : '';
    }

    private static function verify_init_data(string $raw): ?array {
        $token=self::telegram_bot_token(); if ($token==='' || $raw==='') return null;
        parse_str($raw,$data); $hash=$data['hash'] ?? ''; unset($data['hash']);
        if (!$hash || empty($data['auth_date']) || abs(time()-(int)$data['auth_date'])>86400) return null;
        ksort($data); $pairs=[]; foreach($data as $k=>$v){ $pairs[]=$k.'='.$v; }
        $check=implode("\n",$pairs);
        $secret=hash_hmac('sha256',$token,'WebAppData',true);
        $calc=hash_hmac('sha256',$check,$secret);
        if (!hash_equals($calc,$hash)) return null;
        $user=json_decode((string)($data['user'] ?? '{}'),true);
        return is_array($user) && !empty($user['id']) ? $user : null;
    }

    private static function verify_login_widget(array $data): ?array {
        $token=self::telegram_bot_token(); if ($token==='') return null;
        $hash=(string)($data['hash'] ?? ''); unset($data['hash']);
        $auth=(int)($data['auth_date'] ?? 0);
        if ($hash==='' || $auth<1 || abs(time()-$auth)>86400) return null;
        ksort($data);
        $pairs=[];
        foreach($data as $k=>$v){
            if (is_array($v) || is_object($v)) return null;
            $pairs[]=$k.'='.(string)$v;
        }
        $check=implode("\n",$pairs);
        $secret=hash('sha256',$token,true);
        $calc=hash_hmac('sha256',$check,$secret);
        if (!hash_equals($calc,$hash) || empty($data['id'])) return null;
        return $data;
    }

    private static function role_for_telegram(string $id): string {
        $map=['QD_OWNER_TELEGRAM_IDS'=>'administrator','QD_ADMIN_TELEGRAM_IDS'=>'administrator','QD_MODERATOR_TELEGRAM_IDS'=>'qd_moderator'];
        foreach($map as $const=>$role){
            if (!defined($const)) continue;
            $ids=array_filter(array_map('trim',explode(',',(string)constant($const))));
            if (in_array($id,$ids,true)) return $role;
        }
        return 'qd_member';
    }

    private static function establish_telegram_session(array $tg) {
        $tgid=(string)($tg['id'] ?? '');
        if ($tgid==='') return new WP_Error('telegram_user_missing','Telegram user id missing',['status'=>401]);
        $users=get_users(['meta_key'=>'qd_telegram_id','meta_value'=>$tgid,'number'=>1]);
        $user=$users ? $users[0] : null;
        $role=self::role_for_telegram($tgid);
        if (!$user) {
            $display=self::text(($tg['first_name'] ?? '').' '.($tg['last_name'] ?? ''),120);
            $uid=wp_insert_user([
                'user_login'=>'telegram_'.$tgid,
                'user_pass'=>wp_generate_password(32,true,true),
                'display_name'=>$display ?: 'Telegram '.$tgid,
                'role'=>$role,
            ]);
            if (is_wp_error($uid)) return $uid;
            update_user_meta($uid,'qd_telegram_id',$tgid);
            if (!empty($tg['username'])) update_user_meta($uid,'qd_telegram_username',self::text($tg['username'],80));
            $user=get_user_by('id',$uid);
        }
        if ($user && !in_array($role,$user->roles,true)) $user->set_role($role);
        wp_set_current_user($user->ID);
        wp_set_auth_cookie($user->ID,true,is_ssl());
        return rest_ensure_response([
            'ok'=>true,
            'nonce'=>wp_create_nonce('wp_rest'),
            'user'=>['id'=>$user->ID,'name'=>$user->display_name,'role'=>$user->roles[0] ?? 'qd_member'],
        ]);
    }

    public static function telegram_login(WP_REST_Request $req) {
        $tg=self::verify_init_data((string)$req->get_param('init_data'));
        if (!$tg) return new WP_Error('telegram_invalid','Invalid Telegram initData',['status'=>401]);
        return self::establish_telegram_session($tg);
    }

    public static function telegram_web_login(WP_REST_Request $req) {
        $payload=$req->get_json_params();
        if (!is_array($payload)) $payload=[];
        $tg=self::verify_login_widget($payload);
        if (!$tg) return new WP_Error('telegram_invalid','Invalid Telegram Login Widget payload',['status'=>401]);
        return self::establish_telegram_session($tg);
    }

    public static function admin_menu(): void {
        add_menu_page('QuantDeus','QuantDeus','manage_options','quantdeus',[self::class,'dashboard'],'dashicons-admin-site-alt3',3);
    }

    public static function dashboard(): void {
        if (!current_user_can('manage_options')) return;
        echo '<div class="wrap"><h1>QuantDeus WordPress Control Deck</h1><p>WordPress is the canonical application/CMS runtime. Make.com is not part of the runtime architecture.</p>';
        echo '<p><a class="button button-primary" href="'.esc_url(admin_url('edit.php?post_type=qd_inquiry')).'">Inquiries</a> <a class="button" href="'.esc_url(admin_url('edit.php?post_type=qd_service')).'">Services</a> <a class="button" href="'.esc_url(admin_url('edit.php?post_type=qd_forum_thread')).'">Forum</a></p></div>';
    }

    public static function schema(): void {
        if (!is_front_page()) return;
        echo '<script type="application/ld+json">'.wp_json_encode(['@context'=>'https://schema.org','@type'=>'Organization','name'=>'QuantDeus','url'=>home_url('/')],JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE).'</script>';
    }
}
register_activation_hook(__FILE__,['QD_Core','activate']);
register_deactivation_hook(__FILE__,['QD_Core','deactivate']);
QD_Core::boot();
