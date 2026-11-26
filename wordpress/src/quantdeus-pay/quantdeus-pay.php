<?php
/**
 * Plugin Name: QuantDeus Pay — Manual Sberbank Transfers
 * Description: Administrator-issued private invoices; client payment claims are never proof of payment.
 * Version: 0.3.0
 * Requires PHP: 8.1
 */
if (!defined('ABSPATH')) exit;

final class QD_Pay {
    private const TYPE = 'qd_pay_invoice';
    private const PHONE = '+79209869904';
    private const BANK = 'Сбербанк';
    private const AUTOMATION_PRICE_KOPECKS = 2500000; // 25 000 RUB, fixed server side
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
        add_action('admin_post_qd_pay_auto_invoice', [self::class, 'auto_invoice']);
        add_action('admin_post_nopriv_qd_pay_auto_invoice', [self::class, 'auto_invoice']);
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
        add_shortcode('quantdeus_pay_automation', [self::class, 'buy_form']);
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
            $buyer = (string)get_post_meta($p->ID, '_qd_pay_buyer_kind', true) ?: 'individual';
            $receipt_delivered = (string)get_post_meta($p->ID, '_qd_pay_receipt_delivered_at', true);
            echo '<p><strong>Режим продавца: НПД (самозанятый).</strong> Только свои разрешённые товары/услуги, не агентские продажи. Фискализация — вручную в «Мой налог».</p>';
            echo '<p>Название услуги задаётся заголовком записи. Не вводите данные клиента.</p>';
            echo '<p><label for="qd_pay_amount">Сумма, ₽</label><br><input required id="qd_pay_amount" name="qd_pay_amount" type="text" inputmode="decimal" value="'.esc_attr($value ? number_format($value/100,2,'.','') : '').'" '.($locked?'readonly ':'').'></p>';
            echo '<p>После выставления сумма блокируется. Для изменения создайте новый счёт.</p>';
            if ($status === 'draft') {
                echo '<p><label><input type="checkbox" name="qd_pay_own_service" value="1"> Подтверждаю: этот счёт выставляется за мою собственную услугу, допустимую на НПД, а не за концерт/услугу третьего лица.</label></p>';
            }
            echo '<p><label for="qd_pay_buyer_kind">Тип плательщика для чека НПД</label><br><select id="qd_pay_buyer_kind" name="qd_pay_buyer_kind" '.($locked ? 'disabled ' : '').'>';
            foreach (['individual'=>'Физическое лицо (НПД 4%)','business'=>'ИП или организация (НПД 6%)'] as $k=>$label) {
                echo '<option value="'.esc_attr($k).'"'.selected($buyer,$k,false).'>'.esc_html($label).'</option>';
            }
            echo '</select></p>';
            if ($locked) echo '<p>Тип плательщика зафиксирован. Для исправления создайте новый счёт.</p>';
            if ($buyer === 'business') echo '<p>Для чека в «Мой налог» дополнительно получите реквизиты и ИНН заказчика по защищённому каналу; не сохраняйте ИНН в публичном GitHub.</p>';
            echo '<p><label for="qd_pay_state">Статус</label><br><select id="qd_pay_state" name="qd_pay_state">';
            foreach (self::STATES as $k=>$label) echo '<option value="'.esc_attr($k).'"'.selected($status,$k,false).'>'.esc_html($label).'</option>';
            echo '</select></p>';
            echo '<p><label for="qd_pay_receipt_url">Ссылка на действительный чек ФНС из «Мой налог»</label><br><input class="widefat" type="url" id="qd_pay_receipt_url" name="qd_pay_receipt_url" value="'.esc_attr($receipt).'" placeholder="https://..."></p>';
            echo '<p><label><input type="checkbox" name="qd_pay_receipt_delivered" value="1" '.($receipt_delivered ? 'checked disabled ' : '').'> Я сформировал чек в «Мой налог» и передал его заказчику</label></p>';
            if ($receipt_delivered) echo '<p><strong>Отправка чека отмечена:</strong> '.esc_html($receipt_delivered).' UTC (внутреннее подтверждение, не интеграция с ФНС)</p>';
            elseif ($status === 'paid') echo '<p><strong>ВНИМАНИЕ:</strong> оплата отмечена, но выдача чека НПД не подтверждена. При переводе на карту чек оформляется в момент расчёта. Выдайте его клиенту без задержки.</p>';
            echo '<p><a href="https://lknpd.nalog.ru/" target="_blank" rel="noopener noreferrer">Открыть «Мой налог»</a>. Плагин не выдаёт чек сам и не сообщает о платеже в ФНС.</p>';
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
        // Never issue manual NPD invoices without explicit seller acknowledgement.
        if ($prior === 'draft' && $state === 'issued' && (!isset($_POST['qd_pay_own_service']) || $_POST['qd_pay_own_service'] !== '1')) {
            $state = 'draft';
        }
        update_post_meta($id, '_qd_pay_kopecks', $sum);
        update_post_meta($id, '_qd_pay_state', $state);
        // Once issued, buyer category is locked to avoid incorrect NPD tax-rate classification.
        if ($prior === 'draft') {
            $buyer = isset($_POST['qd_pay_buyer_kind']) && is_string($_POST['qd_pay_buyer_kind'])
                ? sanitize_key(wp_unslash($_POST['qd_pay_buyer_kind'])) : 'individual';
            update_post_meta($id, '_qd_pay_buyer_kind', in_array($buyer,['individual','business'],true) ? $buyer : 'individual');
        }
        $already_delivered = (string)get_post_meta($id, '_qd_pay_receipt_delivered_at', true);
        $old_receipt = (string)get_post_meta($id, '_qd_pay_receipt_url', true);
        $receipt_input = isset($_POST['qd_pay_receipt_url']) && is_string($_POST['qd_pay_receipt_url'])
            ? wp_unslash($_POST['qd_pay_receipt_url']) : '';
        $receipt = $already_delivered ? $old_receipt : esc_url_raw($receipt_input, ['http','https']);
        update_post_meta($id, '_qd_pay_receipt_url', $receipt);
        $confirmed = isset($_POST['qd_pay_receipt_delivered']) && $_POST['qd_pay_receipt_delivered'] === '1';
        // Admin's attestation is recorded only with an HTTPS FNS receipt link and confirmed bank payment.
        if ($state === 'paid' && $confirmed && !$already_delivered && str_starts_with($receipt,'https://')) {
            update_post_meta($id, '_qd_pay_receipt_delivered_at', gmdate('Y-m-d H:i:s'));
        }
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

    public static function buy_form(): string {
        // This self-service flow is only for QuantDeus' own automation service.
        // It does not initiate a bank debit, issue a fiscal receipt or accept Ksenia booking payments.
        $nonce = wp_nonce_field('qd_pay_auto_invoice', 'qd_pay_auto_nonce', true, false);
        return '<section class="qd-pay-offer" style="padding:20px;margin:18px 0;border-radius:18px;background:linear-gradient(125deg,#e3faff,#eafef3);border:1px solid #a9dcec;color:#16394d">'
            .'<h3>QuantDeus Pay · Автоматизация бизнеса</h3>'
            .'<p style="font-size:clamp(1.5rem,4vw,2rem);font-weight:800;margin:10px 0">25 000 ₽</p>'
            .'<p>Персональный счёт выставляется на фиксированную сумму 25 000 ₽. После согласования объёма услуги оплату можно отправить по номеру Сбербанка; получение денег проверяется вручную, чек формирует самозанятый через «Мой налог».</p>'
            .'<form method="post" action="'.esc_url(admin_url('admin-post.php')).'">'
            .'<input type="hidden" name="action" value="qd_pay_auto_invoice">'.$nonce
            .'<label style="display:block;margin-bottom:10px"><input type="checkbox" name="qd_pay_terms" value="1" required> Понимаю, что счёт не списывает деньги автоматически; объём и сроки работ согласовываются перед переводом.</label>'
            .'<label style="display:block;margin-bottom:10px"><input type="checkbox" name="qd_pay_individual" value="1" required> Оплачиваю как физическое лицо. Для ИП и организаций счёт оформляется через заявку с ИНН и реквизитами заказчика.</label>'
            .'<label style="position:absolute;left:-9999px">Сайт<input type="text" name="qd_pay_website" autocomplete="off" tabindex="-1"></label>'
            .'<button type="submit" style="padding:14px 22px;border:0;border-radius:12px;background:#137dbd;color:#fff;font-weight:750;cursor:pointer">Получить счёт на 25 000 ₽</button>'
            .'</form></section>';
    }

    public static function auto_invoice(): void {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            wp_die('Method not allowed', '', ['response'=>405]);
        }
        $nonce = isset($_POST['qd_pay_auto_nonce']) && is_string($_POST['qd_pay_auto_nonce'])
            ? sanitize_text_field(wp_unslash($_POST['qd_pay_auto_nonce'])) : '';
        if (!wp_verify_nonce($nonce, 'qd_pay_auto_invoice')) wp_die('Invalid request', '', ['response'=>403]);
        if (!isset($_POST['qd_pay_terms']) || $_POST['qd_pay_terms'] !== '1') wp_die('Confirm invoice terms', '', ['response'=>400]);
        if (!isset($_POST['qd_pay_individual']) || $_POST['qd_pay_individual'] !== '1') wp_die('Self-service invoicing is available only to individuals; businesses must submit an inquiry.', '', ['response'=>400]);
        if (!empty($_POST['qd_pay_website'])) wp_die('Request rejected', '', ['response'=>400]);
        $ip = isset($_SERVER['REMOTE_ADDR']) && is_string($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'unknown';
        $key = 'qd_pay_public_issue_'.substr(hash_hmac('sha256', $ip, wp_salt('auth')),0,32);
        $count = (int)get_transient($key);
        if ($count >= 3) wp_die('Слишком много счетов. Напишите администрации QuantDeus.', '', ['response'=>429]);
        set_transient($key, $count + 1, 30*MINUTE_IN_SECONDS);
        // Prices and seller status are server-controlled. No public form accepts an arbitrary amount,
        // service id, private payer identity or payment status.
        $id = wp_insert_post([
            'post_type'=>self::TYPE, 'post_status'=>'publish',
            'post_author'=>0, 'post_title'=>'Автоматизация бизнеса · базовая услуга',
            'post_content'=>'',
        ], true);
        if (is_wp_error($id) || (int)$id < 1) wp_die('Invoice creation failed', '', ['response'=>503]);
        $id = (int)$id;
        update_post_meta($id, '_qd_pay_kopecks', self::AUTOMATION_PRICE_KOPECKS);
        update_post_meta($id, '_qd_pay_state', 'issued');
        update_post_meta($id, '_qd_pay_buyer_kind', 'individual');
        update_post_meta($id, '_qd_pay_origin', 'public_automation_checkout');
        $token = self::token($id);
        nocache_headers();
        wp_safe_redirect(add_query_arg('qd_invoice', $token, home_url('/pay/')), 303);
        exit;
    }

    public static function render(): string {
        $token = isset($_GET['qd_invoice']) && is_string($_GET['qd_invoice'])
            ? sanitize_text_field(wp_unslash($_GET['qd_invoice'])) : '';
        $post = self::invoice($token);
        if ($token === '') {
            return '<section style="max-width:720px;margin:28px auto;padding:30px;border:1px solid #a9dcec;border-radius:22px;background:linear-gradient(135deg,#e8fbff,#f5fbff,#e6f9ec);color:#133d55">'
                .'<h2>QuantDeus Pay · Оплата по счёту</h2>'
                .'<p>Для оплаты потребуется персональная ссылка на счёт с точной суммой и назначением. Её выдаёт администратор QuantDeus после согласования услуги.</p>'
                .'<p><a href="'.esc_url(home_url('/services/')).'">Посмотреть услуги QuantDeus →</a></p>'
                .self::buy_form()
                .'<p>Выступление Ксении Чередниковой: 50 000 ₽, оплата оформляется отдельно с исполнительницей после подтверждения условий. <a href="'.esc_url(home_url('/services/ksenia-concert/')).'">Отправить заявку на выступление →</a></p>'
                .'<p style="font-size:.9rem">Перевод в Сбербанк подтверждается вручную. Чек самозанятого оформляется через ФНС «Мой налог».</p></section>';
        }
        if (!$post) return '<section class="qd-pay">Эта ссылка на счёт недействительна или счёт закрыт. Запросите новую ссылку у QuantDeus.</section>';
        $state = (string)get_post_meta($post->ID,'_qd_pay_state',true);
        $sum = (int)get_post_meta($post->ID,'_qd_pay_kopecks',true);
        $receipt = (string)get_post_meta($post->ID,'_qd_pay_receipt_url',true);
        $receipt_delivered = (string)get_post_meta($post->ID,'_qd_pay_receipt_delivered_at',true);
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
        if ($receipt && $receipt_delivered && in_array($state, ['paid','refunded'], true)) {
            $html .= '<p><a href="'.esc_url($receipt).'" target="_blank" rel="noopener noreferrer">Открыть чек ФНС из «Мой налог»</a></p>';
        } elseif ($state === 'paid') {
            $html .= '<p><strong>Чек ФНС:</strong> ссылка пока не добавлена продавцом. Чек должен быть сформирован и передан по правилам НПД.</p>';
        }
        $html .= '<p><small>Продавец применяет налог на профессиональный доход (НПД). Кнопка «Я перевёл» не подтверждает оплату. Чек формируется отдельно продавцом через ФНС «Мой налог». Этот экран не является платёжным шлюзом или фискальным чеком.</small></p></section>';
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
