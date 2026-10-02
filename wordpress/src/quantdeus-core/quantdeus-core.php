<?php
/**
 * Plugin Name: QuantDeus Core
 * Description: Canonical WordPress application layer for QuantDeus.
 * Version: 1.2.0
 * Requires PHP: 8.1
 * Text Domain: quantdeus
 */
if (!defined('ABSPATH')) { exit; }

final class QD_Core {
    public const NS = 'quantdeus/v1';
    public const VERSION = '1.2.0';

    public static function boot(): void {
        add_action('init', [self::class, 'register_types']);
        add_action('init', [self::class, 'maybe_upgrade'], 20);
        add_action('rest_api_init', [self::class, 'routes']);
        add_action('admin_menu', [self::class, 'admin_menu']);
        add_action('admin_init', [self::class, 'guard_admin']);
        add_action('wp_head', [self::class, 'schema'], 40);
        add_filter('show_admin_bar', [self::class, 'show_admin_bar']);
        add_filter('wp_authenticate_user', [self::class, 'block_password_admin'], 20, 2);
        add_filter('rest_authentication_errors', [self::class, 'guard_admin_rest'], 20);
        add_filter('xmlrpc_enabled', '__return_false');
        add_filter('wp_is_application_passwords_available', '__return_false');
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
        register_rest_route(self::NS, '/github/config', [
            'methods'=>'GET','permission_callback'=>'__return_true','callback'=>fn()=>rest_ensure_response([
                'configured'=>self::github_oauth_configured(),
                'repository'=>self::github_repo(),
            ]),
        ]);
        register_rest_route(self::NS, '/github/start', [
            'methods'=>'POST','permission_callback'=>'__return_true','callback'=>[self::class,'github_start'],
        ]);
        register_rest_route(self::NS, '/github/callback', [
            'methods'=>'GET','permission_callback'=>'__return_true','callback'=>[self::class,'github_callback'],
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
        // Telegram is the member identity layer. It can grant moderator status,
        // but it must never mint a WordPress administrator session.
        if (defined('QD_MODERATOR_TELEGRAM_IDS')) {
            $ids=array_filter(array_map('trim',explode(',',(string)QD_MODERATOR_TELEGRAM_IDS)));
            if (in_array($id,$ids,true)) return 'qd_moderator';
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

    private static function github_client_id(): string {
        return defined('QD_GITHUB_CLIENT_ID') ? trim((string)QD_GITHUB_CLIENT_ID) : '';
    }

    private static function github_client_secret(): string {
        return defined('QD_GITHUB_CLIENT_SECRET') ? trim((string)QD_GITHUB_CLIENT_SECRET) : '';
    }

    private static function github_repo(): string {
        return defined('QD_GITHUB_ADMIN_REPOSITORY') && trim((string)QD_GITHUB_ADMIN_REPOSITORY)!==''
            ? trim((string)QD_GITHUB_ADMIN_REPOSITORY)
            : 'quantdeus/quantdeus.github.io';
    }

    private static function github_oauth_configured(): bool {
        return self::github_client_id()!=='' && self::github_client_secret()!=='';
    }

    private static function github_callback_url(): string {
        return rest_url(self::NS.'/github/callback');
    }

    private static function github_headers(string $token): array {
        return [
            'Accept'=>'application/vnd.github+json',
            'Authorization'=>'Bearer '.$token,
            'X-GitHub-Api-Version'=>'2026-03-10',
            'User-Agent'=>'QuantDeus-WordPress',
        ];
    }

    private static function github_api(string $url, string $token): ?array {
        $response=wp_remote_get($url,['headers'=>self::github_headers($token),'timeout'=>12]);
        if (is_wp_error($response) || wp_remote_retrieve_response_code($response)!==200) return null;
        $body=json_decode((string)wp_remote_retrieve_body($response),true);
        return is_array($body) ? $body : null;
    }

    private static function github_permission(string $token, string $login): string {
        $repo=self::github_repo();
        if (!preg_match('~^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$~',$repo)) return 'none';
        $url='https://api.github.com/repos/'.$repo.'/collaborators/'.rawurlencode($login).'/permission';
        $data=self::github_api($url,$token);
        return strtolower((string)($data['permission'] ?? 'none'));
    }

    private static function role_for_github_permission(string $permission): string {
        if ($permission==='admin') return 'administrator';
        if (in_array($permission,['maintain','write'],true)) return 'qd_moderator';
        return 'qd_member';
    }

    private static function protect_github_token(string $token): string {
        if ($token==='' || !function_exists('openssl_encrypt')) return '';
        $key=hash('sha256',wp_salt('auth'),true);
        $iv=random_bytes(12); $tag='';
        $cipher=openssl_encrypt($token,'aes-256-gcm',$key,OPENSSL_RAW_DATA,$iv,$tag,'quantdeus-github');
        if ($cipher===false) return '';
        return base64_encode($iv.$tag.$cipher);
    }

    private static function unprotect_github_token(string $protected): string {
        if ($protected==='' || !function_exists('openssl_decrypt')) return '';
        $raw=base64_decode($protected,true);
        if ($raw===false || strlen($raw)<29) return '';
        $iv=substr($raw,0,12); $tag=substr($raw,12,16); $cipher=substr($raw,28);
        $key=hash('sha256',wp_salt('auth'),true);
        $plain=openssl_decrypt($cipher,'aes-256-gcm',$key,OPENSSL_RAW_DATA,$iv,$tag,'quantdeus-github');
        return is_string($plain) ? $plain : '';
    }

    public static function github_start() {
        if (!self::github_oauth_configured()) {
            return new WP_Error('github_oauth_unconfigured','GitHub admin login is not configured on this runtime',['status'=>503]);
        }
        $state=wp_generate_password(48,false,false);
        set_transient('qd_gh_state_'.hash('sha256',$state),'1',10*MINUTE_IN_SECONDS);
        $url=add_query_arg([
            'client_id'=>self::github_client_id(),
            'redirect_uri'=>self::github_callback_url(),
            'state'=>$state,
            'scope'=>'read:user',
            'allow_signup'=>'false',
        ],'https://github.com/login/oauth/authorize');
        return rest_ensure_response(['ok'=>true,'authorize_url'=>$url]);
    }

    public static function github_callback(WP_REST_Request $req) {
        $code=self::text($req->get_param('code'),500);
        $state=self::text($req->get_param('state'),500);
        $state_key='qd_gh_state_'.hash('sha256',$state);
        if ($code==='' || $state==='' || !get_transient($state_key)) {
            return new WP_Error('github_oauth_state','Invalid or expired GitHub OAuth state',['status'=>401]);
        }
        delete_transient($state_key);
        if (!self::github_oauth_configured()) return new WP_Error('github_oauth_unconfigured','GitHub OAuth not configured',['status'=>503]);

        $exchange=wp_remote_post('https://github.com/login/oauth/access_token',[
            'headers'=>['Accept'=>'application/json','User-Agent'=>'QuantDeus-WordPress'],
            'body'=>[
                'client_id'=>self::github_client_id(),
                'client_secret'=>self::github_client_secret(),
                'code'=>$code,
                'redirect_uri'=>self::github_callback_url(),
            ],
            'timeout'=>12,
        ]);
        if (is_wp_error($exchange) || wp_remote_retrieve_response_code($exchange)!==200) {
            return new WP_Error('github_oauth_exchange','GitHub token exchange failed',['status'=>502]);
        }
        $token_body=json_decode((string)wp_remote_retrieve_body($exchange),true);
        $token=is_array($token_body) ? trim((string)($token_body['access_token'] ?? '')) : '';
        if ($token==='') return new WP_Error('github_oauth_token','GitHub did not return an access token',['status'=>401]);

        $profile=self::github_api('https://api.github.com/user',$token);
        $login=is_array($profile) ? self::text($profile['login'] ?? '',80) : '';
        $github_id=is_array($profile) ? (string)($profile['id'] ?? '') : '';
        if ($login==='' || $github_id==='') return new WP_Error('github_profile','GitHub profile unavailable',['status'=>401]);

        $permission=self::github_permission($token,$login);
        $role=self::role_for_github_permission($permission);
        $users=get_users(['meta_key'=>'qd_github_id','meta_value'=>$github_id,'number'=>1]);
        $user=$users ? $users[0] : null;
        if (!$user) {
            $uid=wp_insert_user([
                'user_login'=>'github_'.$github_id,
                'user_pass'=>wp_generate_password(32,true,true),
                'display_name'=>$login,
                'role'=>$role,
            ]);
            if (is_wp_error($uid)) return $uid;
            $user=get_user_by('id',$uid);
        }
        $user->set_role($role);
        update_user_meta($user->ID,'qd_github_id',$github_id);
        update_user_meta($user->ID,'qd_github_login',$login);
        update_user_meta($user->ID,'qd_github_permission',$permission);
        update_user_meta($user->ID,'qd_github_verified_at',time());

        $protected=self::protect_github_token($token);
        if ($protected!=='') set_transient('qd_gh_token_'.$user->ID,$protected,8*HOUR_IN_SECONDS);
        if ($permission==='admin') set_transient('qd_gh_admin_ok_'.$user->ID,'1',5*MINUTE_IN_SECONDS);

        wp_set_current_user($user->ID);
        wp_set_auth_cookie($user->ID,true,is_ssl());
        $target=$permission==='admin' ? admin_url('admin.php?page=quantdeus') : home_url('/?github_role='.rawurlencode($role));
        wp_safe_redirect($target);
        exit;
    }

    private static function github_admin_session_valid(bool $live=true): bool {
        if (!is_user_logged_in()) return false;
        $user=wp_get_current_user();
        if (!in_array('administrator',$user->roles,true)) return false;
        $login=(string)get_user_meta($user->ID,'qd_github_login',true);
        if ($login==='') return false;
        if (!$live && get_transient('qd_gh_admin_ok_'.$user->ID)) return true;

        $protected=(string)get_transient('qd_gh_token_'.$user->ID);
        $token=self::unprotect_github_token($protected);
        if ($token==='') return false;
        $permission=self::github_permission($token,$login);
        update_user_meta($user->ID,'qd_github_permission',$permission);
        update_user_meta($user->ID,'qd_github_verified_at',time());
        if ($permission==='admin') {
            set_transient('qd_gh_admin_ok_'.$user->ID,'1',5*MINUTE_IN_SECONDS);
            return true;
        }
        $user->set_role(self::role_for_github_permission($permission));
        delete_transient('qd_gh_admin_ok_'.$user->ID);
        return false;
    }

    public static function guard_admin(): void {
        if (wp_doing_ajax()) return;
        if (current_user_can('manage_options') && self::github_admin_session_valid(true)) return;
        if (current_user_can('manage_options')) wp_logout();
        wp_safe_redirect(home_url('/?admin=github-required'));
        exit;
    }

    public static function show_admin_bar(bool $show): bool {
        return $show && current_user_can('manage_options') && self::github_admin_session_valid(false);
    }

    public static function block_password_admin($user, $password) {
        if ($user instanceof WP_User && user_can($user,'manage_options')) {
            return new WP_Error('github_admin_only','Administrator access requires a live GitHub repository-admin verification.');
        }
        return $user;
    }

    public static function guard_admin_rest($result) {
        if ($result instanceof WP_Error) return $result;
        if (is_user_logged_in() && current_user_can('manage_options') && !self::github_admin_session_valid(false)) {
            return new WP_Error('github_admin_required','GitHub repository-admin verification required',['status'=>403]);
        }
        return $result;
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
