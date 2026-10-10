<?php
/**
 * Plugin Name: QuantDeus Pay — Manual Sberbank Transfers
 * Description: Administrator-issued private invoices; client payment claims are never proof of payment.
 * Version: 0.1.0
 * Requires PHP: 8.1
 */
if (!defined('ABSPATH')) exit;

final class QD_Pay {
    private const TYPE = 'qd_pay_invoice';
    private const PHONE = '+79209869904';
    private const BANK = 'Сбербанк';
    private const STATES = [
        'draft'=>'Черновик', 'issued'=>'Ожидает перевода',
        'claimed'=>'Покупатель сообщил о переводе',
        'paid'=>'Оплата подтверждена администратором',
        'cancelled'=>'Аннулирован', 'refunded'=>'Возврат подтверждён'
    ];

    public static function init(): void {
        add_action('init', [self::class, 'post_type']);
        add_action('add_meta_boxes_'.self::TYPE, [self::class, 'meta_box']);
        add_action('save_post_'.self::TYPE, [self::class, 'save']);
        add_action('admin_post_qd_pay_claim', [self::class, 'claim']);
        add_action('admin_post_nopriv_qd_pay_claim', [self::class, 'claim']);
        add_action('template_redirect', [self::class, 'privacy'], 0);
    }

    public static function activate(): void {
        // Only create a draft page; never silently expose payment instructions.
        if (!get_page_by_path('pay', OBJECT, 'page')) {
            wp_insert_post([
                'post_type'=>'page', 'post_status'=>'draft', 'post_name'=>'pay',
                'post_title'=>'QuantDeus Pay — Оплата', 'post_content'=>'[quantdeus_pay]'
            ]);
        }
    }

    public static function post_type(): void {
        $caps = [];
        foreach ([
            'edit_post', 'read_post', 'delete_post', 'edit_posts', 'edit_others_posts',
            'publish_posts', 'read_private_posts', 'delete_posts', 'delete_private_posts',
            'delete_published_posts', 'delete_others_posts', 'edit_private_posts',
            'edit_published_posts', 'create_posts'
        ] as $key) $caps[$key] = 'manage_options';
        register_post_type(self::TYPE, [
            'labels'=>['name'=>'QuantDeus Pay · Счета', 'singular_name'=>'Счёт QuantDeus Pay'],
            'public'=>false, 'show_ui'=>true, 'show_in_rest'=>false,
            'exclude_from_search'=>true, 'publicly_queryable'=>false,
            'menu_icon'=>'dashicons-money-alt', 'supports'=>['title'],
            'capabilities'=>$caps, 'map_meta_cap'=>false
        ]);
        add_shortcode('quantdeus_pay', [self::class, 'render']);
    }

    private static function token(int $id): string {
        $token = (string)get_post_meta($id, '_qd_pay_token', true);
        if (preg_match('/\A[a-f0-9]{48}\z/D', $token)) return $token;
        $token = bin2hex(random_bytes(24));
        update_post_meta($id, '_qd_pay_token', $token);
        return $token;
    }

    private static function amount(string $raw): int {
        if (!preg_match('/\A(\d{1,7})(?:[.,](\d{1,2}))?\z/D', trim($raw), $m)) return 0;
        $kopecks = (int)$m[1]*100 + (int)str_pad($m[2] ?? '', 2, '0');
        return $kopecks >= 100 && $kopecks <= 100000000 ? $kopecks : 0;
    }

    private static function url(int $id): string {
        return add_query_arg('qd_invoice', self::token($id), home_url('/pay/'));
    }

    public static function meta_box(\WP_Post $post): void {
        if (!current_user_can('manage_options')) return;
        add_meta_box('qd_pay_details', 'QuantDeus Pay · Реквизиты и статус', function($p) {
            wp_nonce_field('qd_pay_save', 'qd_pay_save_nonce');
            $value = (int)get_post_meta($p->ID, '_qd_pay_kopecks', true);
            $status = (string)get_post_meta($p->ID, '_qd_pay_state', true) ?: 'draft';
            $locked = $value > 0 && $status !== 'draft';
            $receipt = (string)get_post_meta($p->ID, '_qd_pay_receipt_url', true);
            echo '<p>Название услуги задаётся заголовком записи. Не вводите данные клиента.</p>';
            echo '<p><label for="qd_pay_amount">Сумма, ₽</label><br><input required id="qd_pay_amount" name="qd_pay_amount" type="text" inputmode="decimal" value="'.esc_attr($value ? number_format($value/100,2,'.','') : '').'" '.($locked?'readonly ':'').'></p>';
            echo '<p>После выставления сумма блокируется. Для изменения создайте новый счёт.</p>';
            echo '<p><label for="qd_pay_state">Статус</label><br><select id="qd_pay_state" name="qd_pay_state">';
            foreach (self::STATES as $k=>$label) echo '<option value="'.esc_attr($k).'"'.selected($status,$k,false).'>'.esc_html($label).'</option>';
            echo '</select></p>';
            echo '<p><label for="qd_pay_receipt_url">Ссылка на действительный фискальный чек, если применимо</label><br><input class="widefat" type="url" id="qd_pay_receipt_url" name="qd_pay_receipt_url" value="'.esc_attr($receipt).'" placeholder="https://..."></p>';
            echo '<p>Чек оформляется отдельно по налоговому статусу продавца. Плагин не фискализирует оплату.</p>';
            if ($value && in_array($status, ['issued','claimed','paid','refunded'], true)) {
                echo '<p><strong>Секретная ссылка на счёт:</strong><br><input class="widefat" readonly value="'.esc_attr(self::url($p->ID)).'"></p>';
                echo '<p>Эту ссылку можно отправлять покупателю напрямую. Не публикуйте публично.</p>';
            }
        }, self::TYPE, 'normal', 'high');
    }

    public static function save(int $id): void {
        if (!isset($_POST['qd_pay_save_nonce']) || !is_string($_POST['qd_pay_save_nonce'])) return;
        $nonce = sanitize_text_field(wp_unslash($_POST['qd_pay_save_nonce']));
        if (!wp_verify_nonce($nonce, 'qd_pay_save')) return;
        if ((defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) || wp_is_post_revision($id) || !current_user_can('manage_options')) return;
        $prior = (string)get_post_meta($id, '_qd_pay_state', true) ?: 'draft';
        $old_sum = (int)get_post_meta($id, '_qd_pay_kopecks', true);
        $entered = isset($_POST['qd_pay_amount']) && is_string($_POST['qd_pay_amount'])
            ? sanitize_text_field(wp_unslash($_POST['qd_pay_amount'])) : '';
        $sum = $prior !== 'draft' && $old_sum ? $old_sum : self::amount($entered);
        $requested = isset($_POST['qd_pay_state']) && is_string($_POST['qd_pay_state'])
            ? sanitize_key(wp_unslash($_POST['qd_pay_state'])) : 'draft';
        $transitions = [
            'draft'=>['draft','issued','cancelled'],
            'issued'=>['issued','claimed','paid','cancelled'],
            'claimed'=>['claimed','paid','cancelled'],
            'paid'=>['paid','refunded'],
            'cancelled'=>['cancelled'],
            'refunded'=>['refunded']
        ];
        $state = in_array($requested, $transitions[$prior] ?? [], true) ? $requested : $prior;
        if (!$sum && !in_array($state, ['draft','cancelled'], true)) $state = 'draft';
        update_post_meta($id, '_qd_pay_kopecks', $sum);
        update_post_meta($id, '_qd_pay_state', $state);
        $receipt = isset($_POST['qd_pay_receipt_url']) && is_string($_POST['qd_pay_receipt_url'])
            ? wp_unslash($_POST['qd_pay_receipt_url']) : '';
        update_post_meta($id, '_qd_pay_receipt_url', esc_url_raw($receipt, ['http','https']));
        if ($sum && $state !== 'draft') self::token($id);
    }

    private static function invoice(string $token): ?\WP_Post {
        if (!preg_match('/\A[a-f0-9]{48}\z/D', $token)) return null;
        $items = get_posts([
            'post_type'=>self::TYPE, 'post_status'=>['draft','publish','private'],
            'numberposts'=>1, 'meta_key'=>'_qd_pay_token', 'meta_value'=>$token,
            'no_found_rows'=>true, 'suppress_filters'=>true
        ]);
        if (!$items) return null;
        $post = $items[0];
        $state = (string)get_post_meta($post->ID, '_qd_pay_state', true);
        return in_array($state, ['issued','claimed','paid','refunded','cancelled'], true)
            && hash_equals((string)get_post_meta($post->ID, '_qd_pay_token', true), $token) ? $post : null;
    }

    public static function privacy(): void {
        if (isset($_GET['qd_invoice']) && is_page('pay')) {
            nocache_headers();
            header('Cache-Control: private, no-store, no-cache, must-revalidate', true);
            header('Referrer-Policy: no-referrer', true);
            header('X-Robots-Tag: noindex, nofollow, noarchive', true);
        }
    }

    public static function render(): string {
        $token = isset($_GET['qd_invoice']) && is_string($_GET['qd_invoice'])
            ? sanitize_text_field(wp_unslash($_GET['qd_invoice'])) : '';
        $post = self::invoice($token);
        if (!$post) return '<section class="qd-pay">Этот счёт не найден или неактивен. Запросите ссылку у QuantDeus.</section>';
        $state = (string)get_post_meta($post->ID,'_qd_pay_state',true);
        $sum = (int)get_post_meta($post->ID,'_qd_pay_kopecks',true);
        $receipt = (string)get_post_meta($post->ID,'_qd_pay_receipt_url',true);
        $style = '<style>.qd-pay{max-width:700px;margin:32px auto;padding:28px;border-radius:24px;background:linear-gradient(130deg,#e4faff,#f5fbff 55%,#e3f9eb);border:1px solid #a9dcec;color:#143149;box-shadow:0 18px 38px #08668c25}.qd-pay h2{color:#0d507c;margin:0 0 8px}.qd-pay .qd-sum{font-size:clamp(2rem,6vw,3.3rem);font-weight:800;color:#1375aa;margin:15px 0}.qd-pay .qd-details{border-radius:15px;background:#ffffffdb;padding:15px 20px;margin:15px 0}.qd-pay p{line-height:1.55}.qd-pay .qd-button{border:0;border-radius:12px;background:#158bd3;color:#fff;padding:14px 20px;font-weight:700;cursor:pointer}.qd-pay .qd-button:focus-visible{outline:3px solid #122f50;outline-offset:3px}.qd-pay small{color:#526776}</style>';
        $html = $style.'<section class="qd-pay" aria-labelledby="qd-pay-title"><h2 id="qd-pay-title">QuantDeus Pay</h2>';
        $html .= '<p>Счёт №'.esc_html((string)$post->ID).' · '.esc_html(get_the_title($post)).'</p>';
        $html .= '<p class="qd-sum">'.esc_html(number_format($sum/100,2,',',' ')).' ₽</p>';
        $html .= '<p><strong>Статус:</strong> '.esc_html(self::STATES[$state]).'</p>';
        if (in_array($state, ['issued','claimed'], true)) {
            $html .= '<div class="qd-details"><p><strong>Банк:</strong> '.esc_html(self::BANK).'</p>';
            $html .= '<p><strong>Номер телефона:</strong> <span style="font-size:1.3rem;font-weight:800">'.esc_html(self::PHONE).'</span></p>';
            $html .= '<p>В своём банковском приложении выберите перевод по номеру телефона. Проверьте получателя и сумму перед отправкой. При возможности укажите номер счёта в комментарии.</p></div>';
            if ($state === 'issued') {
                $html .= '<form method="post" action="'.esc_url(admin_url('admin-post.php')).'"><input type="hidden" name="action" value="qd_pay_claim"><input type="hidden" name="qd_invoice" value="'.esc_attr($token).'">';
                $html .= wp_nonce_field('qd_pay_claim_'.$post->ID,'qd_pay_nonce',true,false);
                $html .= '<button type="submit" class="qd-button">Я перевёл · сообщить администрации</button></form>';
            } else $html .= '<p><strong>Заявка получена.</strong> Администратор сверит банковское поступление.</p>';
        } elseif ($state === 'paid') $html .= '<p>Администратор подтвердил поступление средств.</p>';
        elseif ($state === 'refunded') $html .= '<p>Возврат отмечен администратором.</p>';
        else $html .= '<p>Счёт закрыт для оплаты.</p>';
        if ($receipt && in_array($state, ['paid','refunded'], true)) {
            $html .= '<p><a href="'.esc_url($receipt).'" target="_blank" rel="noopener noreferrer">Открыть выданный чек</a></p>';
        }
        $html .= '<p><small>Кнопка «Я перевёл» не подтверждает оплату. Этот экран не является платёжным шлюзом или фискальным чеком.</small></p></section>';
        return $html;
    }

    public static function claim(): void {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') wp_die('Method not allowed','',['response'=>405]);
        $token = isset($_POST['qd_invoice']) && is_string($_POST['qd_invoice'])
            ? sanitize_text_field(wp_unslash($_POST['qd_invoice'])) : '';
        $post = self::invoice($token);
        if (!$post) wp_die('Invoice not found','',['response'=>404]);
        $nonce = isset($_POST['qd_pay_nonce']) && is_string($_POST['qd_pay_nonce'])
            ? sanitize_text_field(wp_unslash($_POST['qd_pay_nonce'])) : '';
        if (!wp_verify_nonce($nonce, 'qd_pay_claim_'.$post->ID)) wp_die('Invalid request','',['response'=>403]);
        $key = 'qd_pay_claim_' . hash('sha256', $token);
        $count = (int)get_transient($key);
        if ($count >= 10) wp_die('Rate limit','',['response'=>429]);
        set_transient($key, $count + 1, 10*MINUTE_IN_SECONDS);
        // Customer can never set paid/refunded nor release goods.
        if (get_post_meta($post->ID,'_qd_pay_state',true) === 'issued') {
            update_post_meta($post->ID, '_qd_pay_state', 'claimed', 'issued');
        }
        wp_safe_redirect(add_query_arg('qd_invoice',$token,home_url('/pay/')),303);
        exit;
    }
}

QD_Pay::init();
register_activation_hook(__FILE__, ['QD_Pay', 'activate']);
