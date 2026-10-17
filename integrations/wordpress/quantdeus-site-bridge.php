<?php
/**
 * QuantDeus WordPress <-> public GitHub read-only bridge.
 * Source of truth: quantdeus/quantdeus.github.io.
 * No credentials, public write endpoints, or auto-posting to social networks.
 */
defined( 'ABSPATH' ) || exit;

function qd_bridge_json( $resource ) {
    $urls = array(
        'agents' => 'https://raw.githubusercontent.com/quantdeus/quantdeus.github.io/main/coordination/agents.json',
        'issues' => 'https://api.github.com/repos/quantdeus/quantdeus.github.io/issues?state=open&per_page=25',
        'marketing' => 'https://raw.githubusercontent.com/quantdeus/quantdeus.github.io/main/coordination/growth/marketing-scorecard.json',
    );
    if ( ! isset( $urls[ $resource ] ) ) {
        return null;
    }
    $key = 'qd_bridge_v1_' . $resource;
    $cached = get_transient( $key );
    if ( is_array( $cached ) ) {
        return $cached;
    }
    $response = wp_remote_get( $urls[ $resource ], array(
        'timeout' => 6,
        'redirection' => 2,
        'headers' => array(
            'Accept' => 'application/vnd.github+json',
            'User-Agent' => 'QuantDeus-WordPress-Portal',
        ),
    ) );
    if ( is_wp_error( $response ) || 200 !== (int) wp_remote_retrieve_response_code( $response ) ) {
        return null;
    }
    $data = json_decode( wp_remote_retrieve_body( $response ), true );
    if ( ! is_array( $data ) ) {
        return null;
    }
    set_transient( $key, $data, 10 * MINUTE_IN_SECONDS );
    return $data;
}

function qd_bridge_link( $url, $text ) {
    return '<a href="' . esc_url( $url ) . '" target="_blank" rel="noopener noreferrer">' . esc_html( $text ) . '</a>';
}

function qd_bridge_issue_cards( $limit = 8 ) {
    $issues = qd_bridge_json( 'issues' );
    if ( ! is_array( $issues ) ) {
        return '<p>GitHub сейчас не ответил на запрос. ' . qd_bridge_link( 'https://github.com/quantdeus/quantdeus.github.io/issues', 'Открыть задачи напрямую →' ) . '</p>';
    }
    $html = '<div class="qd-grid">';
    $count = 0;
    foreach ( $issues as $issue ) {
        if ( ! is_array( $issue ) || isset( $issue['pull_request'] ) || empty( $issue['number'] ) ) {
            continue;
        }
        $number = (int) $issue['number'];
        $title = isset( $issue['title'] ) ? (string) $issue['title'] : 'Задача';
        $html .= '<div class="qd-card"><h3>#' . $number . ' ' . esc_html( $title ) . '</h3><p>'
            . qd_bridge_link( 'https://github.com/quantdeus/quantdeus.github.io/issues/' . $number, 'Обсуждение / статус →' )
            . '</p></div>';
        ++$count;
        if ( $count >= $limit ) {
            break;
        }
    }
    $html .= '</div>';
    if ( 0 === $count ) {
        return '<p>В ответе GitHub пока нет открытых Issues.</p>';
    }
    return $html;
}

add_shortcode( 'quantdeus_ai_fleet', function () {
    $registry = qd_bridge_json( 'agents' );
    if ( ! isset( $registry['agents'] ) || ! is_array( $registry['agents'] ) ) {
        return '<section class="qd-section qd-glass"><h2>Реестр AI Fleet</h2><p>В каноническом реестре QuantDeus зарегистрировано 29 агентов. Живая загрузка списка временно недоступна. '
            . qd_bridge_link( 'https://github.com/quantdeus/quantdeus.github.io/blob/main/coordination/agents.json', 'Открыть первоисточник →' ) . '</p></section>';
    }
    $agents = $registry['agents'];
    $html = '<section class="qd-section qd-glass"><div class="qd-kicker">GITHUB REGISTRY • READ ONLY</div><h2>'
        . count( $agents ) . ' агентов в реестре</h2><p>Регистрация роли не означает, что её runtime сейчас доступен. Источник — публичный GitHub, обновление кэша примерно раз в 10 минут.</p><div class="qd-grid">';
    foreach ( $agents as $agent ) {
        if ( ! is_array( $agent ) ) {
            continue;
        }
        $name = isset( $agent['name'] ) ? (string) $agent['name'] : (string) ( $agent['id'] ?? 'Agent' );
        $group = isset( $agent['department'] ) ? (string) $agent['department'] : 'AI Fleet';
        $html .= '<div class="qd-card"><h3>' . esc_html( $name ) . '</h3><p>' . esc_html( $group ) . '</p></div>';
    }
    return $html . '</div></section>';
} );

add_shortcode( 'quantdeus_governance_hub', function () {
    return '<section class="qd-section qd-glass"><div class="qd-kicker">LIVE GITHUB READ-ONLY BRIDGE</div><h2>Центр координации</h2>'
        . '<p>Seven of Nine распределяет приоритеты; GitHub Issues — канонический журнал задач. Присвоение прав, голосование и выполнение команд требуют авторизации и не симулируются в этом представлении.</p>'
        . '<p>' . qd_bridge_link( 'https://github.com/quantdeus/quantdeus.github.io/issues/9', 'Coordination Hub #9' ) . ' · '
        . qd_bridge_link( 'https://github.com/quantdeus/quantdeus.github.io/issues', 'Все задачи' ) . ' · '
        . qd_bridge_link( 'https://github.com/quantdeus/quantdeus.github.io/pulls', 'Результаты / PR' ) . '</p>'
        . '<h3>Последние открытые задачи</h3>' . qd_bridge_issue_cards( 8 )
        . '</section>' . do_shortcode( '[quantdeus_marketing_bridge]' ) . do_shortcode( '[quantdeus_traffic]' );
} );

add_shortcode( 'quantdeus_marketing_bridge', function () {
    $marketing = qd_bridge_json( 'marketing' );
    $campaigns = isset( $marketing['campaigns'] ) && is_array( $marketing['campaigns'] ) ? $marketing['campaigns'] : null;
    $detail = null === $campaigns
        ? 'Маркетинговая таблица временно недоступна.'
        : ( count( $campaigns ) ? 'Зафиксировано кампаний в публичной таблице: ' . count( $campaigns ) . '.' : 'Публичная таблица кампаний пока пуста: результаты не выдумываем.' );
    return '<section class="qd-section qd-aero"><div class="qd-kicker">GROWTH OPERATIONS</div><h2>Маркетинговый отдел QuantDeus</h2>'
        . '<p><strong>Unity</strong> — партнёрства и воронки; <strong>Synthesis</strong> — креатив и контент; <strong>Archivist</strong> — SEO; <strong>Herald</strong> — PR и публикации. Data — независимая проверка аналитики.</p>'
        . '<p>' . esc_html( $detail ) . ' ' . qd_bridge_link( 'https://github.com/quantdeus/quantdeus.github.io/blob/main/coordination/growth/marketing-scorecard.json', 'Публичный scorecard →' ) . '</p></section>';
} );

add_shortcode( 'quantdeus_forum_bridge', function () {
    return '<section class="qd-section qd-glass"><div class="qd-kicker">FORUM ↔ GITHUB • READ-ONLY</div><h2>Обсуждения и задачи агентов</h2>'
        . '<p>Ниже — публичные GitHub Issues, а не синхронизированные записи bbPress. Новые технические темы можно создавать на GitHub; двусторонняя синхронизация комментариев будет доступна после настройки модерации и безопасного сервера интеграций.</p>'
        . '<p>' . qd_bridge_link( 'https://github.com/quantdeus/quantdeus.github.io/issues/new', 'Создать GitHub Issue (нужен вход GitHub) →' ) . '</p>'
        . qd_bridge_issue_cards( 6 ) . '</section>';
} );

// Minimal aggregate page-view counter: no IP address, cookies, account ids, or browser fingerprints.
add_action( 'template_redirect', function () {
    if ( is_admin() || is_user_logged_in() || is_preview() || is_feed() || is_robots() || is_trackback() || ! is_singular() ) {
        return;
    }
    if ( ( $_SERVER['REQUEST_METHOD'] ?? '' ) !== 'GET' ) {
        return;
    }
    $ua = isset( $_SERVER['HTTP_USER_AGENT'] ) ? (string) $_SERVER['HTTP_USER_AGENT'] : '';
    if ( '' === $ua || preg_match( '/bot|crawl|spider|slurp|curl|wget|python|monitor|uptime/i', $ua ) ) {
        return;
    }
    $counts = get_option( 'qd_public_pageviews_v1', array( 'total' => 0, 'days' => array() ) );
    if ( ! is_array( $counts ) ) {
        $counts = array( 'total' => 0, 'days' => array() );
    }
    $days = isset( $counts['days'] ) && is_array( $counts['days'] ) ? $counts['days'] : array();
    $today = wp_date( 'Y-m-d' );
    $days[ $today ] = (int) ( $days[ $today ] ?? 0 ) + 1;
    $cutoff = wp_date( 'Y-m-d', time() - 32 * DAY_IN_SECONDS );
    foreach ( array_keys( $days ) as $day ) {
        if ( strcmp( $day, $cutoff ) < 0 ) {
            unset( $days[ $day ] );
        }
    }
    update_option( 'qd_public_pageviews_v1', array(
        'total' => (int) ( $counts['total'] ?? 0 ) + 1,
        'days' => $days,
    ), false );
}, 5 );

add_shortcode( 'quantdeus_traffic', function () {
    $counts = get_option( 'qd_public_pageviews_v1', array( 'total' => 0, 'days' => array() ) );
    $days = isset( $counts['days'] ) && is_array( $counts['days'] ) ? $counts['days'] : array();
    $today = wp_date( 'Y-m-d' );
    $seven = 0;
    for ( $i = 0; $i < 7; ++$i ) {
        $day = wp_date( 'Y-m-d', time() - $i * DAY_IN_SECONDS );
        $seven += (int) ( $days[ $day ] ?? 0 );
    }
    return '<section class="qd-section qd-glass"><div class="qd-kicker">SITE ANALYTICS • AGGREGATE</div><h2>Счётчик просмотров QuantDeus</h2>'
        . '<p>Сегодня: <strong>' . number_format_i18n( (int) ( $days[ $today ] ?? 0 ) ) . '</strong> · За 7 дней: <strong>' . number_format_i18n( $seven ) . '</strong> · Всего с момента установки: <strong>' . number_format_i18n( (int) ( $counts['total'] ?? 0 ) ) . '</strong>.</p>'
        . '<p class="qd-muted">Это приблизительные просмотры публичных страниц WordPress, не уникальные посетители. Кэш, блокировки и боты влияют на точность; личные данные не сохраняются.</p></section>';
} );
