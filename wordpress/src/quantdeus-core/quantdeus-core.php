<?php
/**
 * Plugin Name: QuantDeus Core
 * Description: Canonical WordPress application layer for QuantDeus.
 * Version: 1.8.0
 * Requires PHP: 8.1
 * Text Domain: quantdeus
 */
if (!defined('ABSPATH')) { exit; }

final class QD_Core {
    public const NS = 'quantdeus/v1';
    public const VERSION = '1.8.0';

    public static function boot(): void {
        add_action('init', [self::class, 'register_types']);
        add_action('init', [self::class, 'maybe_upgrade'], 20);
        add_action('rest_api_init', [self::class, 'routes']);
        add_action('admin_init', [self::class, 'guard_admin']);
        add_action('wp_dashboard_setup', [self::class, 'dashboard_widgets']);
        add_action('add_meta_boxes', [self::class, 'meta_boxes']);
        add_action('save_post', [self::class, 'save_meta_boxes']);
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
        self::seed_taxonomies();
        self::seed_portal_content();
        update_option('qd_core_version', self::VERSION, false);
        flush_rewrite_rules(false);
    }

    public static function maybe_upgrade(): void {
        if ((string)get_option('qd_core_version') === self::VERSION) return;
        self::roles();
        self::seed_services();
        self::seed_taxonomies();
        self::seed_portal_content();
        update_option('qd_core_version', self::VERSION, false);
        flush_rewrite_rules(false);
    }

    public static function deactivate(): void { flush_rewrite_rules(false); }

    private static function mapped_post_caps(string $singular, string $plural): array {
        return [
            'edit_'.$singular,
            'read_'.$singular,
            'delete_'.$singular,
            'edit_'.$plural,
            'edit_others_'.$plural,
            'publish_'.$plural,
            'read_private_'.$plural,
            'delete_'.$plural,
            'delete_private_'.$plural,
            'delete_published_'.$plural,
            'delete_others_'.$plural,
            'edit_private_'.$plural,
            'edit_published_'.$plural,
        ];
    }

    private static function grant_caps($role, array $caps): void {
        if (!$role) return;
        foreach ($caps as $cap) $role->add_cap($cap, true);
    }

    private static function roles(): void {
        $definitions = [
            'qd_member' => ['QuantDeus Member', ['read' => true]],
            'qd_agent' => ['QuantDeus Agent', ['read' => true, 'qd_agent_context' => true]],
            'qd_moderator' => ['QuantDeus Moderator', [
                'read' => true,
                'upload_files' => true,
                'moderate_comments' => true,
                'qd_moderate_forum' => true,
            ]],
        ];
        foreach ($definitions as $slug => [$label, $caps]) {
            if (!get_role($slug)) add_role($slug, $label, $caps);
            $role = get_role($slug);
            if ($role) foreach ($caps as $cap => $grant) $role->add_cap($cap, $grant);
        }

        $moderator=get_role('qd_moderator');
        if ($moderator) {
            // Remove the legacy generic post caps: they unintentionally exposed
            // private inquiries/evidence and every custom post type to moderators.
            foreach ([
                'edit_posts','edit_others_posts','publish_posts','edit_private_posts','read_private_posts',
                'delete_posts','delete_private_posts','delete_published_posts','delete_others_posts',
                'edit_published_posts','delete_published_posts'
            ] as $legacy_cap) {
                $moderator->remove_cap($legacy_cap);
            }
            self::grant_caps($moderator,self::mapped_post_caps('qd_forum_thread','qd_forum_threads'));
        }

        $admin = get_role('administrator');
        if ($admin) {
            $admin->add_cap('qd_agent_context');
            $admin->add_cap('qd_moderate_forum');
            foreach ([
                ['qd_service','qd_services'],
                ['qd_inquiry','qd_inquiries'],
                ['qd_forum_thread','qd_forum_threads'],
                ['qd_project','qd_projects'],
                ['qd_evidence','qd_evidence_items'],
                ['qd_node','qd_nodes'],
                ['qd_research','qd_research_items'],
                ['qd_artifact','qd_artifacts'],
                ['qd_result','qd_results'],
            ] as [$singular,$plural]) {
                self::grant_caps($admin,self::mapped_post_caps($singular,$plural));
            }
        }
    }

    public static function register_types(): void {
        $types = [
            'qd_service' => ['Services','Service',true,'services',['title','editor','excerpt','thumbnail'],['qd_service','qd_services'],'dashicons-store'],
            'qd_inquiry' => ['Inquiries','Inquiry',false,false,['title','editor','custom-fields'],['qd_inquiry','qd_inquiries'],'dashicons-email-alt'],
            'qd_forum_thread' => ['Forum','Forum thread',true,'forum',['title','editor','author','comments'],['qd_forum_thread','qd_forum_threads'],'dashicons-format-chat'],
            'qd_project' => ['Projects','Project',true,'projects',['title','editor','excerpt','thumbnail','author','custom-fields'],['qd_project','qd_projects'],'dashicons-hammer'],
            'qd_node' => ['Federation Nodes','Federation Node',true,'federation/nodes',['title','editor','excerpt','thumbnail','author','custom-fields'],['qd_node','qd_nodes'],'dashicons-networking'],
            'qd_research' => ['Research','Research item',true,'research',['title','editor','excerpt','thumbnail','author','custom-fields'],['qd_research','qd_research_items'],'dashicons-welcome-learn-more'],
            'qd_artifact' => ['Open Artifacts','Artifact',true,'knowledge/artifacts',['title','editor','excerpt','thumbnail','author','custom-fields'],['qd_artifact','qd_artifacts'],'dashicons-media-code'],
            'qd_result' => ['Verified Results','Verified Result',true,'evidence/results',['title','editor','excerpt','thumbnail','author','custom-fields'],['qd_result','qd_results'],'dashicons-yes-alt'],
            'qd_evidence' => ['Internal Evidence','Evidence record',false,false,['title','editor','custom-fields'],['qd_evidence','qd_evidence_items'],'dashicons-search'],
        ];
        foreach ($types as $slug => [$plural,$singular,$public,$archive,$supports,$caps,$icon]) {
            $args=[
                'labels'=>['name'=>$plural,'singular_name'=>$singular],
                'public'=>$public,'show_ui'=>true,'show_in_rest'=>$public,
                'capability_type'=>$caps,'map_meta_cap'=>true,'supports'=>$supports,'menu_icon'=>$icon,
            ];
            if ($archive) {
                $args['has_archive']=$archive;
                $args['rewrite']=['slug'=>$archive,'with_front'=>false];
            }
            register_post_type($slug,$args);
        }

        register_taxonomy('qd_horizon',['qd_node','qd_project','qd_research','qd_artifact','qd_result'],[
            'labels'=>['name'=>'Horizons','singular_name'=>'Horizon'],'public'=>true,'show_in_rest'=>true,
            'rewrite'=>['slug'=>'horizon','with_front'=>false]
        ]);
        register_taxonomy('qd_pillar',['qd_node','qd_project','qd_research','qd_artifact','qd_result'],[
            'labels'=>['name'=>'Neon Horizon Pillars','singular_name'=>'Pillar'],'public'=>true,'show_in_rest'=>true,
            'rewrite'=>['slug'=>'pillar','with_front'=>false]
        ]);
        register_taxonomy('qd_research_domain',['qd_research'],[
            'labels'=>['name'=>'Research Domains','singular_name'=>'Research Domain'],'public'=>true,'show_in_rest'=>true,
            'hierarchical'=>true,'rewrite'=>['slug'=>'research/domain','with_front'=>false]
        ]);

        foreach (self::structured_fields() as $type=>$fields) {
            foreach (array_keys($fields) as $key) {
                register_post_meta($type,$key,[
                    'type'=>'string','single'=>true,'show_in_rest'=>true,
                    'sanitize_callback'=>'sanitize_textarea_field',
                ]);
            }
        }
    }

    private static function structured_fields(): array {
        return [
            'qd_node'=>[
                'qd_owner'=>'Identity / Owner','qd_mission'=>'Mission','qd_evidence_grade'=>'Evidence Grade (A/B/C)',
                'qd_artifacts'=>'Artifacts','qd_metrics'=>'Outcome Metrics','qd_replication'=>'Replication',
                'qd_safety'=>'Safety / failure modes','qd_exit'=>'EXIT / portability','qd_governance'=>'Governance',
                'qd_human_override'=>'Human Override',
            ],
            'qd_research'=>[
                'qd_evidence_grade'=>'Evidence Grade (A/B/C)','qd_fact'=>'FACT','qd_evidence'=>'EVIDENCE',
                'qd_hypothesis'=>'HYPOTHESIS','qd_unknown'=>'UNKNOWN','qd_next_test'=>'NEXT TEST','qd_falsifier'=>'FALSIFIER',
            ],
            'qd_project'=>[
                'qd_evidence_grade'=>'Evidence Grade (A/B/C)','qd_cycle_stage'=>'Operational cycle stage',
                'qd_outcome_metric'=>'Outcome metric',
            ],
            'qd_artifact'=>[
                'qd_evidence_grade'=>'Evidence Grade (A/B/C)','qd_source_url'=>'Source URL','qd_replication'=>'Replication notes',
            ],
            'qd_result'=>[
                'qd_evidence_grade'=>'Evidence Grade (A/B/C)','qd_source_url'=>'Evidence/source URL','qd_falsifier'=>'Failure condition / falsifier',
            ],
        ];
    }

    private static function seed_taxonomies(): void {
        $sets=[
            'qd_horizon'=>[
                'ignition-2028'=>'2026–2028 · IGNITION','proto-federation-2041'=>'2026–2041 · PROTO-FEDERATION',
                'century-compass-2126'=>'2026–2126 · CENTURY COMPASS',
            ],
            'qd_pillar'=>[
                'human-dignity'=>'Жизнь и достоинство человека','safety-freedom'=>'Безопасность как основа свободы',
                'transparency-trust'=>'Прозрачность и доверие','science-innovation'=>'Творчество, наука и инновации',
                'ecological-harmony'=>'Экологическая гармония','post-scarcity'=>'Постдефицитное мышление',
                'idic'=>'IDIC — разнообразие без унификации','long-horizon'=>'Долгий горизонт и космическая цивилизация',
            ],
            'qd_research_domain'=>[
                'warp-gravity'=>'Warp / Gravity','space'=>'Space','energy'=>'Energy','ai'=>'AI','ecology'=>'Ecology',
                'human-potential'=>'Human Potential','experimental'=>'Experimental Research',
            ],
        ];
        foreach($sets as $taxonomy=>$terms) foreach($terms as $slug=>$name) {
            if(!term_exists($slug,$taxonomy)) wp_insert_term($name,$taxonomy,['slug'=>$slug]);
        }
    }

    private static function seed_item(string $type,string $slug,string $title,string $content,array $meta,array $terms=[]): int {
        $existing=get_page_by_path($slug,OBJECT,$type);
        $id=$existing?(int)$existing->ID:(int)wp_insert_post([
            'post_type'=>$type,'post_status'=>'publish','post_name'=>$slug,'post_title'=>$title,'post_content'=>$content,
        ]);
        if($id<1) return 0;
        foreach($meta as $k=>$v) if((string)get_post_meta($id,$k,true)==='') update_post_meta($id,$k,$v);
        foreach($terms as $tax=>$values) wp_set_object_terms($id,$values,$tax,false);
        return $id;
    }

    private static function seed_portal_content(): void {
        self::seed_item('qd_node','quantdeus-core-node','QuantDeus Core Node',
            'Канонический цифровой узел QuantDeus. Поддерживает открытые артефакты, портал и Federation Interface, не подчиняя независимые узлы.',
            [
                'qd_owner'=>'QuantDeus','qd_evidence_grade'=>'B',
                'qd_mission'=>'Снижать измеримый дефицит и расширять способность людей свободно созидать через проверяемые решения, открытые артефакты и добровольное сотрудничество.',
                'qd_artifacts'=>'quantdeus/quantdeus.github.io · quantdeus-core · quantdeus-aero · CI evidence',
                'qd_metrics'=>'Наблюдаемые code/runtime артефакты существуют; impact KPI вне проверяемого состояния репозитория пока NOT MEASURED.',
                'qd_replication'=>'Публичный репозиторий + WordPress plugin/theme + staging blueprint + acceptance criteria.',
                'qd_safety'=>'Auth, secrets, production cutover, расходы и необратимые действия остаются под Human Override.',
                'qd_exit'=>'Участники и совместимые узлы сохраняют собственную идентичность, owner, переносимые артефакты и право прекратить участие.',
                'qd_governance'=>'Локальные решения принимаются локально; общий контракт — совместимость, evidence discipline и EXIT.',
                'qd_human_override'=>'Production, secrets, billing, irreversible changes and sensitive external commitments.',
            ],['qd_horizon'=>['ignition-2028'],'qd_pillar'=>['transparency-trust','idic']]);

        self::seed_item('qd_project','wordpress-neon-horizon-v4-portal','WordPress Neon Horizon v4 Portal',
            'Обратимый staging-проект по превращению QuantDeus из лендинга в многоуровневый WordPress-портал цивилизационной экосистемы.',
            ['qd_evidence_grade'=>'B','qd_cycle_stage'=>'QA → MEASURED OUTCOME',
             'qd_outcome_metric'=>'Portal capabilities, mobile usability, auth integrity and production smoke. Activity counts are not impact.'],
            ['qd_horizon'=>['ignition-2028'],'qd_pillar'=>['science-innovation','transparency-trust']]);

        self::seed_item('qd_research','warp-gravity-research','Warp / Gravity Research',
            'Frontier research track. Футуристические концепции остаются гипотезами до прохождения уравнений, данных, воспроизводимости и falsifier.',
            [
                'qd_evidence_grade'=>'C','qd_fact'=>'QuantDeus maintains a documented Warp / Gravity research track.',
                'qd_evidence'=>'No independently replicated engineering breakthrough is asserted by this portal entry.',
                'qd_hypothesis'=>'Candidate spacetime and propulsion concepts can be screened through geometry, equations of motion, energy conditions, stability and reproducibility gates.',
                'qd_unknown'=>'Engineering feasibility, scalable energy requirements and experimentally accessible configurations remain open.',
                'qd_next_test'=>'Publish a reproducible solver/evidence packet for the next candidate and run independent QA.',
                'qd_falsifier'=>'Failure to satisfy stated equations/constraints or independent inability to reproduce the claimed result.',
            ],['qd_horizon'=>['ignition-2028','century-compass-2126'],'qd_pillar'=>['science-innovation','long-horizon'],'qd_research_domain'=>['warp-gravity']]);

        self::seed_item('qd_artifact','neon-horizon-v4-canon','Neon Horizon v4 Canon',
            'Canonical constitutional-operational charter. Grade A here describes the inspectable existence/integrity of the artifact, not proof of every long-horizon vision inside it.',
            ['qd_evidence_grade'=>'A','qd_source_url'=>'https://github.com/quantdeus/quantdeus.github.io/blob/main/coordination/civilization-doctrine.json',
             'qd_replication'=>'Read the canon, map a concrete need, publish evidence and package a reproducible result without surrendering local identity or EXIT.'],
            ['qd_horizon'=>['ignition-2028','proto-federation-2041','century-compass-2126'],'qd_pillar'=>['human-dignity','idic','long-horizon']]);
    }

    public static function meta_boxes(): void {
        foreach(array_keys(self::structured_fields()) as $type) {
            add_meta_box('qd_structured_meta','QuantDeus Evidence / Federation Interface',[self::class,'render_meta_box'],$type,'normal','high');
        }
    }

    public static function render_meta_box(WP_Post $post): void {
        wp_nonce_field('qd_structured_meta_save','qd_structured_meta_nonce');
        echo '<div style="display:grid;gap:14px">';
        foreach(self::structured_fields()[$post->post_type]??[] as $key=>$label){
            $value=(string)get_post_meta($post->ID,$key,true);
            echo '<label><strong>'.esc_html($label).'</strong>';
            if($key==='qd_evidence_grade'){
                echo '<select name="'.esc_attr($key).'" style="display:block;width:100%;max-width:420px;margin-top:6px">';
                foreach([''=>'UNKNOWN / NOT MEASURED','A'=>'A','B'=>'B','C'=>'C'] as $v=>$name)
                    echo '<option value="'.esc_attr($v).'" '.selected($value,$v,false).'>'.esc_html($name).'</option>';
                echo '</select>';
            } else {
                echo '<textarea name="'.esc_attr($key).'" rows="3" style="display:block;width:100%;margin-top:6px">'.esc_textarea($value).'</textarea>';
            }
            echo '</label>';
        }
        echo '</div>';
    }

    public static function save_meta_boxes(int $post_id): void {
        if(!isset($_POST['qd_structured_meta_nonce']) || !wp_verify_nonce((string)$_POST['qd_structured_meta_nonce'],'qd_structured_meta_save')) return;
        if(defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
        if(!current_user_can('edit_post',$post_id)) return;
        $post=get_post($post_id); if(!$post) return;
        foreach(self::structured_fields()[$post->post_type]??[] as $key=>$label){
            if(!array_key_exists($key,$_POST)) continue;
            $value=sanitize_textarea_field(wp_unslash((string)$_POST[$key]));
            if($key==='qd_evidence_grade' && !in_array($value,['','A','B','C'],true)) $value='';
            update_post_meta($post_id,$key,$value);
        }
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

    private static function service_post(string $service): ?WP_Post {
        if ($service==='') return null;
        $posts=get_posts([
            'post_type'=>'qd_service',
            'post_status'=>'publish',
            'numberposts'=>1,
            'meta_key'=>'qd_service_id',
            'meta_value'=>$service,
        ]);
        if ($posts) return $posts[0];

        $by_slug=get_page_by_path(sanitize_title($service),OBJECT,'qd_service');
        return $by_slug instanceof WP_Post && $by_slug->post_status==='publish' ? $by_slug : null;
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
        register_rest_route(self::NS, '/dashboard', [
            'methods'=>'GET','permission_callback'=>'__return_true',
            'callback'=>function() {
                $published=fn(string $type)=>(int)(wp_count_posts($type)->publish??0);
                $grade_a=get_posts(['post_type'=>'qd_result','post_status'=>'publish','numberposts'=>-1,'fields'=>'ids','meta_key'=>'qd_evidence_grade','meta_value'=>'A']);
                return rest_ensure_response(['canon'=>'Neon Horizon v4.0','kpis'=>[
                    'Active Nodes'=>$published('qd_node'),'Open Artifacts'=>$published('qd_artifact'),
                    'Verified Results'=>count($grade_a),'Active Projects'=>$published('qd_project'),
                    'Research Items'=>$published('qd_research'),'Action Conversion'=>'UNKNOWN','Partner Density'=>'UNKNOWN',
                    'Future Fund Flow'=>'UNKNOWN','Automation Ratio'=>'UNKNOWN','Impact Ledger'=>'UNKNOWN',
                    'Transparency Score'=>'UNKNOWN','Federation Score'=>'UNKNOWN','Replication Success'=>'UNKNOWN',
                ]]);
            },
        ]);
        register_rest_route(self::NS, '/session/logout', [
            'methods'=>'POST','permission_callback'=>'__return_true',
            'callback'=>function() {
                wp_logout();
                return rest_ensure_response(['ok'=>true,'logged_out'=>true]);
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
        register_rest_route(self::NS, '/forum/issues', [
            'methods'=>'GET','permission_callback'=>'__return_true','callback'=>[self::class,'forum_issue_list'],
        ]);
        register_rest_route(self::NS, '/forum/issues/(?P<id>\\d+)', [
            'methods'=>'GET','permission_callback'=>'__return_true','callback'=>[self::class,'forum_issue_detail'],
        ]);
        register_rest_route(self::NS, '/forum/issues/(?P<id>\\d+)/reply', [
            'methods'=>'POST','permission_callback'=>fn()=>is_user_logged_in(),'callback'=>[self::class,'forum_issue_reply'],
        ]);
        register_rest_route(self::NS, '/forum/agent-request/(?P<token>[a-f0-9]{64})', [
            'methods'=>'GET','permission_callback'=>'__return_true','callback'=>[self::class,'forum_agent_request'],
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
        register_rest_route(self::NS, '/telegram/broker', [
            'methods'=>'POST','permission_callback'=>'__return_true','callback'=>[self::class,'telegram_broker_login'],
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
        register_rest_route(self::NS, '/github/broker', [
            'methods'=>'POST','permission_callback'=>'__return_true','callback'=>[self::class,'github_broker_login'],
        ]);
        register_rest_route(self::NS, '/agent/context', [
            'methods'=>'GET','permission_callback'=>fn()=>current_user_can('qd_agent_context') || current_user_can('manage_options'),
            'callback'=>fn()=>rest_ensure_response([
                'site'=>get_bloginfo('name'),'engine'=>'wordpress',
                'services'=>(int)(wp_count_posts('qd_service')->publish ?? 0),
                'forum_threads'=>(int)(wp_count_posts('qd_forum_thread')->publish ?? 0),
                'nodes'=>(int)(wp_count_posts('qd_node')->publish ?? 0),
                'research'=>(int)(wp_count_posts('qd_research')->publish ?? 0),
                'artifacts'=>(int)(wp_count_posts('qd_artifact')->publish ?? 0),
                'results'=>(int)(wp_count_posts('qd_result')->publish ?? 0),
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
        $service_post=self::service_post($service);
        if (!$service_post) return new WP_Error('service_unknown','Unknown service',['status'=>404]);
        if (get_post_meta($service_post->ID,'qd_available',true)==='0') {
            return new WP_Error('service_unavailable','Service is currently unavailable',['status'=>409]);
        }
        $service=(string)(get_post_meta($service_post->ID,'qd_service_id',true) ?: $service_post->post_name);

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
        update_post_meta($id,'qd_service_post_id',$service_post->ID);
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
        if (!$post || $post->post_type!=='qd_forum_thread' || $post->post_status!=='publish') return new WP_Error('thread_not_found','Not found',['status'=>404]);
        if (mb_strlen($body)<1) return new WP_Error('reply_required','Reply required',['status'=>400]);
        $user=wp_get_current_user();
        $comment=wp_insert_comment([
            'comment_post_ID'=>$post->ID,'comment_content'=>$body,'user_id'=>get_current_user_id(),'comment_approved'=>1,
            'comment_author'=>$user->display_name,'comment_author_email'=>$user->user_email,
        ]);
        if (!$comment) return new WP_Error('reply_failed','Unable to save reply',['status'=>500]);
        return new WP_REST_Response(['ok'=>true,'id'=>$comment],201);
    }

    public static function current_plan(?int $user_id=null): string {
        $uid=$user_id ?? get_current_user_id();
        if ($uid<1) return 'free';
        $user=get_user_by('id',$uid);
        if ($user && in_array('administrator',(array)$user->roles,true)) return 'pro';
        foreach (['qd_plan','quantdeus_plan'] as $key) {
            if (strtolower(trim((string)get_user_meta($uid,$key,true)))==='pro') return 'pro';
        }
        return 'free';
    }

    private static function forum_github_token(): string {
        if (defined('QD_GITHUB_FORUM_TOKEN') && trim((string)QD_GITHUB_FORUM_TOKEN)!=='') {
            return trim((string)QD_GITHUB_FORUM_TOKEN);
        }
        if (defined('QD_GITHUB_TOKEN') && trim((string)QD_GITHUB_TOKEN)!=='') {
            return trim((string)QD_GITHUB_TOKEN);
        }
        $env=getenv('QUANTDEUS_GITHUB_TOKEN');
        return is_string($env) ? trim($env) : '';
    }

    private static function forum_issue_request(string $method,string $path,array $payload=[]) {
        $repo=self::github_repo();
        if (!preg_match('~^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$~',$repo)) {
            return new WP_Error('github_repo_invalid','GitHub repository is invalid',['status'=>503]);
        }
        if (!preg_match('~^/[A-Za-z0-9_./?=&%+-]+$~',$path)) {
            return new WP_Error('github_path_invalid','GitHub path is invalid',['status'=>400]);
        }
        $token=self::forum_github_token();
        if (strtoupper($method)!=='GET' && $token==='') {
            return new WP_Error('github_forum_write_unconfigured','Forum GitHub write token is not configured',['status'=>503]);
        }
        $headers=[
            'Accept'=>'application/vnd.github+json',
            'X-GitHub-Api-Version'=>'2026-03-10',
            'User-Agent'=>'QuantDeus-WordPress-Forum',
        ];
        if ($token!=='') $headers['Authorization']='Bearer '.$token;
        if ($payload) $headers['Content-Type']='application/json';
        $args=['method'=>strtoupper($method),'headers'=>$headers,'timeout'=>15,'redirection'=>2];
        if ($payload) $args['body']=wp_json_encode($payload);
        $response=wp_remote_request('https://api.github.com/repos/'.$repo.$path,$args);
        if (is_wp_error($response)) {
            return new WP_Error('github_forum_unavailable','GitHub Issues bridge unavailable',['status'=>503]);
        }
        $status=(int)wp_remote_retrieve_response_code($response);
        $body=json_decode((string)wp_remote_retrieve_body($response),true);
        if ($status<200 || $status>=300) {
            $message=is_array($body) ? self::text($body['message'] ?? 'GitHub request failed',180) : 'GitHub request failed';
            return new WP_Error('github_forum_'.$status,$message,['status'=>$status===404?404:($status===403?403:502)]);
        }
        return is_array($body) ? $body : [];
    }

    private static function forum_issue_data(array $issue,bool $full=false): array {
        $labels=[];
        foreach ((array)($issue['labels'] ?? []) as $label) {
            $name=is_array($label) ? ($label['name'] ?? '') : $label;
            $name=self::text($name,80);
            if ($name!=='') $labels[]=$name;
        }
        $assignees=[];
        foreach ((array)($issue['assignees'] ?? []) as $assignee) {
            $login=is_array($assignee) ? self::text($assignee['login'] ?? '',80) : '';
            if ($login!=='') $assignees[]=$login;
        }
        return [
            'number'=>(int)($issue['number'] ?? 0),
            'title'=>self::text($issue['title'] ?? '',180),
            'body'=>self::text($issue['body'] ?? '',$full?12000:1200),
            'state'=>self::text($issue['state'] ?? 'open',20),
            'labels'=>array_values(array_unique($labels)),
            'assignees'=>array_values(array_unique($assignees)),
            'comments'=>(int)($issue['comments'] ?? 0),
            'author'=>self::text($issue['user']['login'] ?? '',80),
            'created_at'=>self::text($issue['created_at'] ?? '',40),
            'updated_at'=>self::text($issue['updated_at'] ?? '',40),
            'url'=>esc_url_raw((string)($issue['html_url'] ?? '')),
        ];
    }

    public static function forum_issue_list(WP_REST_Request $req) {
        $state=strtolower(self::text($req->get_param('state'),12));
        if (!in_array($state,['open','closed','all'],true)) $state='open';
        $data=self::forum_issue_request('GET','/issues?state='.$state.'&per_page=60&sort=updated&direction=desc');
        if (is_wp_error($data)) return $data;
        $issues=[];
        foreach ($data as $issue) {
            if (!is_array($issue) || !empty($issue['pull_request'])) continue;
            $issues[]=self::forum_issue_data($issue,false);
        }
        return rest_ensure_response([
            'ok'=>true,
            'repository'=>self::github_repo(),
            'source'=>'github-live',
            'issues'=>$issues,
        ]);
    }

    public static function forum_issue_detail(WP_REST_Request $req) {
        $id=(int)$req['id'];
        if ($id<1) return new WP_Error('issue_invalid','Invalid issue',['status'=>400]);
        $issue=self::forum_issue_request('GET','/issues/'.$id);
        if (is_wp_error($issue)) return $issue;
        if (!empty($issue['pull_request'])) return new WP_Error('issue_not_found','Issue not found',['status'=>404]);
        $rows=self::forum_issue_request('GET','/issues/'.$id.'/comments?per_page=100');
        if (is_wp_error($rows)) return $rows;
        $comments=[];
        foreach ($rows as $row) {
            if (!is_array($row)) continue;
            $raw=(string)($row['body'] ?? '');
            $comments[]=[
                'id'=>(int)($row['id'] ?? 0),
                'author'=>self::text($row['user']['login'] ?? 'github',80),
                'body'=>self::text($raw,8000),
                'created_at'=>self::text($row['created_at'] ?? '',40),
                'updated_at'=>self::text($row['updated_at'] ?? '',40),
                'agent_reply'=>str_contains($raw,'<!-- qd-agent-reply -->'),
                'forum_user'=>str_contains($raw,'<!-- qd:forum-user -->'),
                'url'=>esc_url_raw((string)($row['html_url'] ?? '')),
            ];
        }
        return rest_ensure_response([
            'ok'=>true,
            'issue'=>self::forum_issue_data($issue,true),
            'comments'=>$comments,
            'viewer'=>[
                'logged_in'=>is_user_logged_in(),
                'plan'=>self::current_plan(),
                'can_reply'=>is_user_logged_in(),
            ],
        ]);
    }

    private static function forum_request_key(string $token): string {
        return 'qd_forum_req_'.substr(hash('sha256',$token),0,32);
    }

    private static function normalize_agent_ids($value): array {
        $items=is_array($value) ? $value : preg_split('/[\s,;]+/',(string)$value);
        $ids=[];
        foreach ((array)$items as $item) {
            $id=strtolower(trim((string)$item));
            if (!preg_match('/^[a-z0-9][a-z0-9_-]{1,47}$/',$id)) continue;
            if (!in_array($id,$ids,true)) $ids[]=$id;
        }
        return array_slice($ids,0,3);
    }

    public static function forum_issue_reply(WP_REST_Request $req) {
        $id=(int)$req['id'];
        $content=self::text($req->get_param('content'),8000);
        if ($id<1 || mb_strlen($content)<2) return new WP_Error('invalid_reply','Issue and reply are required',['status'=>400]);

        $issue=self::forum_issue_request('GET','/issues/'.$id);
        if (is_wp_error($issue)) return $issue;
        if (!empty($issue['pull_request'])) return new WP_Error('issue_not_found','Issue not found',['status'=>404]);
        if (($issue['state'] ?? '')!=='open') return new WP_Error('issue_closed','Issue is closed',['status'=>409]);

        $user=wp_get_current_user();
        $plan=self::current_plan($user->ID);
        $ask_agents=rest_sanitize_boolean($req->get_param('ask_agents'));
        $agents=[];
        if ($ask_agents) {
            $agents=$plan==='pro' ? self::normalize_agent_ids($req->get_param('agents')) : ['seven-of-nine'];
            if (!$agents) $agents=['seven-of-nine'];
        }

        $request_token='';
        if ($ask_agents) {
            try { $request_token=bin2hex(random_bytes(32)); }
            catch (Throwable $e) { return new WP_Error('agent_request_token','Unable to prepare agent request',['status'=>500]); }
            set_transient(self::forum_request_key($request_token),[
                'issue_id'=>$id,
                'comment_id'=>0,
                'plan'=>$plan,
                'agents'=>$agents,
                'created_at'=>time(),
            ],15*MINUTE_IN_SECONDS);
        }

        $author=self::text($user->display_name ?: $user->user_login,80);
        $parts=[
            '**'.$author.' via QuantDeus Forum**',
            '',
            $content,
        ];
        if ($ask_agents) {
            $parts[]='';
            $parts[]='🤖 AI Fleet request: '.implode(', ',$agents);
        }
        $parts[]='';
        $parts[]='<!-- qd:forum-user -->';
        if ($request_token!=='') $parts[]='<!-- qd:forum-agent-request='.$request_token.' -->';

        $comment=self::forum_issue_request('POST','/issues/'.$id.'/comments',['body'=>implode("\n",$parts)]);
        if (is_wp_error($comment)) {
            if ($request_token!=='') delete_transient(self::forum_request_key($request_token));
            return $comment;
        }
        if ($request_token!=='') {
            set_transient(self::forum_request_key($request_token),[
                'issue_id'=>$id,
                'comment_id'=>(int)($comment['id'] ?? 0),
                'plan'=>$plan,
                'agents'=>$agents,
                'created_at'=>time(),
            ],15*MINUTE_IN_SECONDS);
        }
        return new WP_REST_Response([
            'ok'=>true,
            'comment'=>[
                'id'=>(int)($comment['id'] ?? 0),
                'url'=>esc_url_raw((string)($comment['html_url'] ?? '')),
            ],
            'agent_request'=>$ask_agents,
            'plan'=>$plan,
            'agents'=>$agents,
        ],201);
    }

    public static function forum_agent_request(WP_REST_Request $req) {
        $token=strtolower((string)$req['token']);
        if (!preg_match('/^[a-f0-9]{64}$/',$token)) return new WP_Error('request_not_found','Request not found',['status'=>404]);
        $data=get_transient(self::forum_request_key($token));
        if (!is_array($data)) return new WP_Error('request_not_found','Request not found',['status'=>404]);
        $issue_id=(int)$req->get_param('issue_id');
        $comment_id=(int)$req->get_param('comment_id');
        if ($issue_id<1 || $comment_id<1 || $issue_id!==(int)($data['issue_id'] ?? 0) || $comment_id!==(int)($data['comment_id'] ?? 0)) {
            return new WP_Error('request_mismatch','Request does not match this GitHub comment',['status'=>403]);
        }
        return rest_ensure_response([
            'ok'=>true,
            'plan'=>($data['plan'] ?? 'free')==='pro' ? 'pro' : 'free',
            'agents'=>self::normalize_agent_ids($data['agents'] ?? []),
            'issue_id'=>$issue_id,
            'comment_id'=>$comment_id,
        ]);
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
        // Telegram is the public member identity layer only.
        // Staff elevation is exclusively derived from live GitHub repository permission.
        return 'qd_member';
    }

    private static function establish_telegram_session(array $tg) {
        $tgid=(string)($tg['id'] ?? '');
        if ($tgid==='') return new WP_Error('telegram_user_missing','Telegram user id missing',['status'=>401]);
        $users=get_users(['meta_key'=>'qd_telegram_id','meta_value'=>$tgid,'number'=>1]);
        $user=$users ? $users[0] : null;
        $role=self::role_for_telegram($tgid);
        $display=self::text(
            $tg['name'] ?? (($tg['first_name'] ?? '').' '.($tg['last_name'] ?? '')),
            120
        );
        if (!$user) {
            $uid=wp_insert_user([
                'user_login'=>'telegram_'.$tgid,
                'user_pass'=>wp_generate_password(32,true,true),
                'display_name'=>$display ?: 'Telegram '.$tgid,
                'role'=>$role,
            ]);
            if (is_wp_error($uid)) return $uid;
            update_user_meta($uid,'qd_telegram_id',$tgid);
            if (!empty($tg['username'])) update_user_meta($uid,'qd_telegram_username',self::text($tg['username'],80));
            if (!empty($tg['picture'])) update_user_meta($uid,'qd_telegram_picture',esc_url_raw((string)$tg['picture']));
            $user=get_user_by('id',$uid);
        } else {
            if ($display!=='' && $display!==$user->display_name) {
                wp_update_user(['ID'=>$user->ID,'display_name'=>$display]);
                $user=get_user_by('id',$user->ID);
            }
            if (!empty($tg['username'])) update_user_meta($user->ID,'qd_telegram_username',self::text($tg['username'],80));
            if (!empty($tg['picture'])) update_user_meta($user->ID,'qd_telegram_picture',esc_url_raw((string)$tg['picture']));
        }
        if ($user && !in_array($role,$user->roles,true)) $user->set_role($role);
        wp_set_current_user($user->ID);
        wp_set_auth_cookie($user->ID,true,is_ssl());
        return rest_ensure_response([
            'ok'=>true,
            'nonce'=>wp_create_nonce('wp_rest'),
            'user'=>[
                'id'=>$user->ID,
                'name'=>$user->display_name,
                'role'=>$user->roles[0] ?? 'qd_member',
                'provider'=>'telegram',
                'plan'=>self::current_plan($user->ID),
            ],
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

    private static function telegram_broker_url(): string {
        return defined('QD_TELEGRAM_BROKER_URL') && trim((string)QD_TELEGRAM_BROKER_URL)!==''
            ? trim((string)QD_TELEGRAM_BROKER_URL)
            : 'https://quantdeus.vercel.app/api/quantdeus/auth';
    }

    private static function telegram_bot_auth_url(): string {
        return defined('QD_TELEGRAM_BOT_AUTH_URL') && trim((string)QD_TELEGRAM_BOT_AUTH_URL)!==''
            ? trim((string)QD_TELEGRAM_BOT_AUTH_URL)
            : 'https://quantdeus.vercel.app/api/quantdeus/bot-auth';
    }

    private static function telegram_identity_via_broker(string $id_token, string $init_data, string $assertion=''): ?array {
        $headers=[
            'Accept'=>'application/json',
            'User-Agent'=>'QuantDeus-WordPress/1.0',
        ];
        $url=self::telegram_broker_url();
        $method='GET';
        if ($assertion!=='') {
            $headers['Authorization']='Bearer '.$assertion;
            $url=self::telegram_bot_auth_url();
            $method='POST';
        } elseif ($id_token!=='') {
            $headers['Authorization']='Bearer '.$id_token;
        } elseif ($init_data!=='') {
            $headers['x-telegram-init-data']=$init_data;
        } else {
            return null;
        }
        $args=[
            'headers'=>$headers,
            'timeout'=>15,
            'redirection'=>2,
        ];
        $response=$method==='POST'
            ? wp_remote_post($url,$args)
            : wp_remote_get($url,$args);
        if (is_wp_error($response)) return null;
        if (wp_remote_retrieve_response_code($response)!==200) return null;
        $body=json_decode((string)wp_remote_retrieve_body($response),true);
        if (!is_array($body) || empty($body['ok']) || !is_array($body['user'] ?? null)) return null;
        $user=$body['user'];
        if (empty($user['id'])) return null;
        return [
            'id'=>(string)$user['id'],
            'name'=>self::text($user['name'] ?? '',120),
            'username'=>self::text($user['username'] ?? '',80),
            'picture'=>esc_url_raw((string)($user['picture'] ?? '')),
            'auth_kind'=>self::text($user['auth_kind'] ?? 'broker',24),
        ];
    }

    public static function telegram_broker_login(WP_REST_Request $req) {
        $payload=$req->get_json_params();
        if (!is_array($payload)) $payload=[];
        $id_token=trim((string)($payload['id_token'] ?? ''));
        $init_data=trim((string)($payload['init_data'] ?? ''));
        $assertion=trim((string)($payload['assertion'] ?? ''));
        $tg=self::telegram_identity_via_broker($id_token,$init_data,$assertion);
        if (!$tg) return new WP_Error('telegram_invalid','Telegram identity broker rejected the login',['status'=>401]);
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

    private static function github_broker_url(): string {
        return defined('QD_GITHUB_BROKER_URL') && trim((string)QD_GITHUB_BROKER_URL)!==''
            ? trim((string)QD_GITHUB_BROKER_URL)
            : 'https://quantdeus.vercel.app/api/quantdeus/github-auth';
    }

    private static function github_identity_via_broker(string $assertion) {
        if ($assertion==='') {
            return new WP_Error('github_assertion_invalid','GitHub assertion missing',['status'=>401]);
        }
        $response=wp_remote_post(self::github_broker_url(),[
            'headers'=>[
                'Accept'=>'application/json',
                'Authorization'=>'Bearer '.$assertion,
                'User-Agent'=>'QuantDeus-WordPress/1.0',
            ],
            'timeout'=>15,
            'redirection'=>2,
        ]);
        if (is_wp_error($response)) {
            return new WP_Error('github_broker_unavailable','GitHub verifier unavailable',['status'=>503]);
        }

        $status=(int)wp_remote_retrieve_response_code($response);
        $body=json_decode((string)wp_remote_retrieve_body($response),true);
        if ($status!==200) {
            $code=is_array($body) ? self::text($body['error'] ?? '',80) : '';
            if ($code==='') $code=$status>=500 ? 'github_broker_unavailable' : 'github_assertion_invalid';
            return new WP_Error($code,'GitHub staff verification failed',['status'=>$status>=500 ? 503 : 401]);
        }

        $user=is_array($body) && !empty($body['ok']) && is_array($body['user'] ?? null) ? $body['user'] : null;
        if (!$user) return new WP_Error('github_broker_invalid','GitHub verifier returned an invalid response',['status'=>503]);
        $github_id=self::text($user['github_id'] ?? '',80);
        $login=self::text($user['login'] ?? '',80);
        $permission=strtolower(self::text($user['permission'] ?? '',40));
        if ($github_id==='' || $login==='') {
            return new WP_Error('github_broker_invalid','GitHub verifier response is incomplete',['status'=>503]);
        }
        if (!in_array($permission,['write','maintain','admin'],true)) {
            return new WP_Error('github_staff_required','GitHub repository staff permission required',['status'=>401]);
        }
        return [
            'github_id'=>$github_id,
            'login'=>$login,
            'permission'=>$permission,
            'role'=>self::role_for_github_permission($permission),
            'avatar_url'=>esc_url_raw((string)($user['avatar_url'] ?? '')),
        ];
    }

    private static function establish_github_broker_session(array $identity, string $assertion) {
        $github_id=(string)$identity['github_id'];
        $login=(string)$identity['login'];
        $permission=(string)$identity['permission'];
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
        if (!$user) return new WP_Error('github_user','Unable to establish GitHub user',['status'=>500]);
        $user->set_role($role);
        if ($user->display_name!==$login) wp_update_user(['ID'=>$user->ID,'display_name'=>$login]);
        update_user_meta($user->ID,'qd_github_id',$github_id);
        update_user_meta($user->ID,'qd_github_login',$login);
        update_user_meta($user->ID,'qd_github_permission',$permission);
        update_user_meta($user->ID,'qd_github_verified_at',time());
        if (!empty($identity['avatar_url'])) update_user_meta($user->ID,'qd_github_avatar',esc_url_raw((string)$identity['avatar_url']));
        set_transient('qd_gh_broker_assertion_'.$user->ID,$assertion,8*HOUR_IN_SECONDS);
        set_transient('qd_gh_staff_ok_'.$user->ID,$permission,5*MINUTE_IN_SECONDS);
        if ($permission==='admin') set_transient('qd_gh_admin_ok_'.$user->ID,'1',5*MINUTE_IN_SECONDS);
        wp_set_current_user($user->ID);
        wp_set_auth_cookie($user->ID,true,is_ssl());
        return rest_ensure_response([
            'ok'=>true,
            'nonce'=>wp_create_nonce('wp_rest'),
            'user'=>[
                'id'=>$user->ID,
                'name'=>$login,
                'role'=>$role,
                'provider'=>'github',
                'plan'=>self::current_plan($user->ID),
            ],
        ]);
    }

    public static function github_broker_login(WP_REST_Request $req) {
        $payload=$req->get_json_params();
        if (!is_array($payload)) $payload=[];
        $assertion=trim((string)($payload['assertion'] ?? ''));
        $identity=self::github_identity_via_broker($assertion);
        if (is_wp_error($identity)) return $identity;
        return self::establish_github_broker_session($identity,$assertion);
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

        if (!in_array($permission,['write','maintain','admin'],true)) {
            if ($user && !in_array('qd_member',$user->roles,true)) $user->set_role('qd_member');
            wp_safe_redirect(home_url('/login/?github=staff-required'));
            exit;
        }

        $protected=self::protect_github_token($token);
        if ($protected!=='') set_transient('qd_gh_token_'.$user->ID,$protected,8*HOUR_IN_SECONDS);
        set_transient('qd_gh_staff_ok_'.$user->ID,$permission,5*MINUTE_IN_SECONDS);
        if ($permission==='admin') set_transient('qd_gh_admin_ok_'.$user->ID,'1',5*MINUTE_IN_SECONDS);

        wp_set_current_user($user->ID);
        wp_set_auth_cookie($user->ID,true,is_ssl());
        wp_safe_redirect(home_url('/login/?github=ok'));
        exit;
    }

    private static function github_staff_session_valid(bool $live=true): bool {
        if (!is_user_logged_in()) return false;
        $user=wp_get_current_user();
        $is_staff_role=in_array('administrator',$user->roles,true) || in_array('qd_moderator',$user->roles,true);
        if (!$is_staff_role) return false;

        $login=(string)get_user_meta($user->ID,'qd_github_login',true);
        if ($login==='') return false;

        $cached_permission=strtolower((string)get_transient('qd_gh_staff_ok_'.$user->ID));
        if (in_array($cached_permission,['write','maintain','admin'],true)) {
            $expected=self::role_for_github_permission($cached_permission);
            if (!in_array($expected,$user->roles,true)) $user->set_role($expected);
            return true;
        }
        if (!$live) return false;

        $permission='none';
        $broker_assertion=(string)get_transient('qd_gh_broker_assertion_'.$user->ID);
        if ($broker_assertion!=='') {
            $identity=self::github_identity_via_broker($broker_assertion);
            if (is_wp_error($identity)) {
                delete_transient('qd_gh_staff_ok_'.$user->ID);
                delete_transient('qd_gh_admin_ok_'.$user->ID);
                if ($identity->get_error_code()==='github_staff_required') {
                    update_user_meta($user->ID,'qd_github_permission','none');
                    $user->set_role('qd_member');
                }
                // Expired assertions and verifier outages deny this request but
                // never rewrite a verified staff role. Re-auth can recover it.
                return false;
            }
            $permission=strtolower((string)($identity['permission'] ?? 'none'));
        } else {
            $protected=(string)get_transient('qd_gh_token_'.$user->ID);
            $token=self::unprotect_github_token($protected);
            if ($token!=='') $permission=self::github_permission($token,$login);
        }

        update_user_meta($user->ID,'qd_github_permission',$permission);
        update_user_meta($user->ID,'qd_github_verified_at',time());
        $role=self::role_for_github_permission($permission);
        $user->set_role($role);

        if (in_array($permission,['write','maintain','admin'],true)) {
            set_transient('qd_gh_staff_ok_'.$user->ID,$permission,5*MINUTE_IN_SECONDS);
            if ($permission==='admin') set_transient('qd_gh_admin_ok_'.$user->ID,'1',5*MINUTE_IN_SECONDS);
            else delete_transient('qd_gh_admin_ok_'.$user->ID);
            return true;
        }

        delete_transient('qd_gh_staff_ok_'.$user->ID);
        delete_transient('qd_gh_admin_ok_'.$user->ID);
        return false;
    }

    private static function github_admin_session_valid(bool $live=true): bool {
        if (!self::github_staff_session_valid($live)) return false;
        $user=wp_get_current_user();
        return in_array('administrator',$user->roles,true)
            && strtolower((string)get_user_meta($user->ID,'qd_github_permission',true))==='admin';
    }

    public static function guard_admin(): void {
        if (wp_doing_ajax()) return;
        if (!is_user_logged_in()) return;

        $user=wp_get_current_user();
        if (in_array('administrator',$user->roles,true)) {
            if (self::github_admin_session_valid(true)) return;
            wp_logout();
            wp_safe_redirect(home_url('/login/?admin=github-admin-required'));
            exit;
        }

        if (in_array('qd_moderator',$user->roles,true)) {
            if (self::github_staff_session_valid(true)) return;
            wp_logout();
            wp_safe_redirect(home_url('/login/?admin=github-staff-required'));
            exit;
        }

        wp_safe_redirect(home_url('/login/?admin=staff-required'));
        exit;
    }

    public static function show_admin_bar(bool $show): bool {
        if (!$show || !is_user_logged_in()) return false;
        $user=wp_get_current_user();
        if (in_array('administrator',$user->roles,true)) return self::github_admin_session_valid(false);
        if (in_array('qd_moderator',$user->roles,true)) return self::github_staff_session_valid(false);
        return false;
    }

    public static function block_password_admin($user, $password) {
        if ($user instanceof WP_User && (
            user_can($user,'manage_options') || in_array('qd_moderator',$user->roles,true)
        )) {
            return new WP_Error('github_staff_only','WordPress staff access requires live GitHub repository permission verification.');
        }
        return $user;
    }

    public static function guard_admin_rest($result) {
        if ($result instanceof WP_Error) return $result;
        $uri=(string)($_SERVER['REQUEST_URI'] ?? '');
        if (str_contains($uri,'/quantdeus/v1/session/logout')) return $result;
        if (!is_user_logged_in()) return $result;

        $user=wp_get_current_user();
        if (in_array('administrator',$user->roles,true) && !self::github_admin_session_valid(true)) {
            return new WP_Error('github_admin_required','GitHub repository-admin verification required',['status'=>403]);
        }
        if (in_array('qd_moderator',$user->roles,true) && !self::github_staff_session_valid(true)) {
            return new WP_Error('github_staff_required','GitHub write/maintain permission verification required',['status'=>403]);
        }
        return $result;
    }

    public static function dashboard_widgets(): void {
        if (!current_user_can('qd_moderate_forum')) return;
        wp_add_dashboard_widget(
            'quantdeus_native_overview',
            'QuantDeus',
            [self::class,'dashboard_widget']
        );
    }

    public static function dashboard_widget(): void {
        if (!current_user_can('qd_moderate_forum')) return;
        echo '<p>QuantDeus работает внутри нативной админки WordPress. Используйте стандартные разделы WordPress и нативные таблицы контента ниже.</p>';
        echo '<p><a class="button button-primary" href="'.esc_url(admin_url('edit.php?post_type=qd_forum_thread')).'">Forum</a>';
        if (current_user_can('manage_options')) {
            echo ' <a class="button" href="'.esc_url(admin_url('edit.php?post_type=qd_inquiry')).'">Inquiries</a>';
            echo ' <a class="button" href="'.esc_url(admin_url('edit.php?post_type=qd_service')).'">Services</a>';
            echo ' <a class="button" href="'.esc_url(admin_url('edit.php?post_type=qd_project')).'">Projects</a>';
            echo ' <a class="button" href="'.esc_url(admin_url('edit.php?post_type=qd_evidence')).'">Evidence</a>';
            echo ' <a class="button" href="'.esc_url(admin_url('edit.php?post_type=qd_node')).'">Nodes</a>';
            echo ' <a class="button" href="'.esc_url(admin_url('edit.php?post_type=qd_research')).'">Research</a>';
            echo ' <a class="button" href="'.esc_url(admin_url('edit.php?post_type=qd_artifact')).'">Artifacts</a>';
            echo ' <a class="button" href="'.esc_url(admin_url('edit.php?post_type=qd_result')).'">Results</a>';
        }
        echo '</p>';
    }

    public static function schema(): void {
        $graph=[];
        if (is_front_page()) {
            $graph=[
                ['@type'=>'Organization','@id'=>home_url('/#organization'),'name'=>'QuantDeus','url'=>home_url('/')],
                ['@type'=>'WebSite','@id'=>home_url('/#website'),'name'=>'QuantDeus // Neon Horizon','url'=>home_url('/'),'publisher'=>['@id'=>home_url('/#organization')]],
            ];
        } elseif (is_singular('qd_research')) {
            $id=get_queried_object_id();
            $graph=[[
                '@type'=>'ResearchProject','name'=>get_the_title($id),'url'=>get_permalink($id),
                'description'=>wp_strip_all_tags(get_the_excerpt($id) ?: get_post_field('post_content',$id)),
            ]];
        } elseif (is_singular('qd_node')) {
            $id=get_queried_object_id();
            $graph=[[
                '@type'=>'Project','name'=>get_the_title($id),'url'=>get_permalink($id),
                'description'=>wp_strip_all_tags(get_post_meta($id,'qd_mission',true) ?: get_post_field('post_content',$id)),
            ]];
        }
        if (!$graph) return;
        echo '<script type="application/ld+json">'.wp_json_encode(['@context'=>'https://schema.org','@graph'=>$graph],JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE).'</script>';
    }
}
register_activation_hook(__FILE__,['QD_Core','activate']);
register_deactivation_hook(__FILE__,['QD_Core','deactivate']);
QD_Core::boot();
