<?php
/**
 * Plugin Name: QuantDeus Forum Archive Recovery
 * Description: Admin-reviewed and repeatable public archive import into bbPress.
 * Version: 0.1.0
 * Requires PHP: 7.4
 */
defined('ABSPATH') || exit;

function qdfr_read_archive() {
    $archive = get_post(78);
    if (!$archive || $archive->post_type !== 'page' || $archive->post_status !== 'publish') {
        return new WP_Error('qdfr_missing', 'The published forum archive (#78) is missing.');
    }
    if (!class_exists('DOMDocument')) {
        return new WP_Error('qdfr_dom', 'PHP DOM extension is required.');
    }
    $dom = new DOMDocument();
    $old_errors = libxml_use_internal_errors(true);
    $loaded = $dom->loadHTML('<?xml encoding="utf-8" ?>' . $archive->post_content, LIBXML_NONET);
    libxml_clear_errors();
    libxml_use_internal_errors($old_errors);
    if (!$loaded) {
        return new WP_Error('qdfr_html', 'Cannot parse the forum archive.');
    }
    $xpath = new DOMXPath($dom);
    $sections = array();
    foreach ($xpath->query('//section[h2]') as $section) {
        $headings = $xpath->query('./h2', $section);
        if (!$headings->length) continue;
        $section_title = sanitize_text_field(trim($headings->item(0)->textContent));
        $topics = array();
        foreach ($xpath->query('./details', $section) as $detail) {
            $summary = $xpath->query('./summary', $detail);
            $paragraph = $xpath->query('./p', $detail);
            if (!$summary->length || !$paragraph->length) continue;
            $title = sanitize_text_field(trim($summary->item(0)->textContent));
            $body = sanitize_textarea_field(trim($paragraph->item(0)->textContent));
            if ($title !== '' && $body !== '') {
                $topics[] = array('title' => $title, 'body' => $body);
            }
        }
        if ($topics) $sections[] = array('title' => $section_title, 'topics' => $topics);
    }
    $topic_count = 0;
    foreach ($sections as $section) $topic_count += count($section['topics']);
    if (count($sections) !== 5 || $topic_count !== 32) {
        return new WP_Error('qdfr_count', 'Archive mismatch: expected 5 sections / 32 topics; found ' . count($sections) . ' / ' . $topic_count);
    }
    return $sections;
}

function qdfr_bbpress_ready() {
    return post_type_exists('forum') && post_type_exists('topic')
        && function_exists('bbp_insert_forum') && function_exists('bbp_insert_topic');
}

function qdfr_existing($post_type, $key) {
    $ids = get_posts(array(
        'post_type' => $post_type,
        'post_status' => array('publish', 'private', 'draft', 'pending', 'future', 'trash'),
        'fields' => 'ids',
        'meta_key' => '_qdfr_archive_key',
        'meta_value' => $key,
        'posts_per_page' => 1,
        'suppress_filters' => true
    ));
    return $ids ? (int)$ids[0] : 0;
}

function qdfr_import_archive() {
    if (!current_user_can('manage_options')) return new WP_Error('qdfr_auth', 'Administrator required.');
    if (!qdfr_bbpress_ready()) return new WP_Error('qdfr_bbpress', 'Install and activate bbPress.');
    $sections = qdfr_read_archive();
    if (is_wp_error($sections)) return $sections;

    $stats = array('forums_created' => 0, 'topics_created' => 0, 'skipped' => 0, 'errors' => array());
    $importer = get_current_user_id();
    foreach ($sections as $section) {
        $forum_key = hash('sha256', 'qd-archive78|forum|' . $section['title']);
        $forum = qdfr_existing('forum', $forum_key);
        if (!$forum) {
            $forum = bbp_insert_forum(array(
                'post_title' => $section['title'],
                'post_content' => 'Раздел восстановлен из публичного архива QuantDeus.',
                'post_status' => 'publish',
                'post_author' => $importer
            ));
            if (is_wp_error($forum) || !$forum) {
                $stats['errors'][] = 'Could not create forum: ' . $section['title'];
                continue;
            }
            update_post_meta($forum, '_qdfr_archive_key', $forum_key);
            update_post_meta($forum, '_qdfr_source_page', 78);
            ++$stats['forums_created'];
        }

        foreach ($section['topics'] as $position => $topic) {
            $key = hash('sha256', 'qd-archive78|topic|' . $section['title'] . '|' . $position . '|' . $topic['title']);
            if (qdfr_existing('topic', $key)) {
                ++$stats['skipped'];
                continue;
            }
            $content = esc_html($topic['body']) .
                '<p><em>Восстановлено из публичного архива. Исходный автор не подтверждён; ' .
                'учётная запись импортёра не является автором первоначальной записи. ' .
                'Исторические ответы требуют отдельного восстановления из резервной копии.</em></p>';
            $post_id = bbp_insert_topic(array(
                'post_title' => $topic['title'],
                'post_content' => wp_kses_post($content),
                'post_parent' => (int)$forum,
                'post_status' => 'publish',
                'post_author' => $importer
            ), array('forum_id' => (int)$forum, 'topic_author' => $importer));
            if (is_wp_error($post_id) || !$post_id) {
                $stats['errors'][] = 'Could not create topic: ' . $topic['title'];
                continue;
            }
            update_post_meta($post_id, '_qdfr_archive_key', $key);
            update_post_meta($post_id, '_qdfr_source_page', 78);
            ++$stats['topics_created'];
        }
        if (function_exists('bbp_update_forum_topic_count')) {
            bbp_update_forum_topic_count($forum);
        }
    }
    return $stats;
}

add_action('admin_menu', static function() {
    add_management_page('QuantDeus · форум', 'QuantDeus · форум', 'manage_options', 'qdfr-restore', 'qdfr_render_admin');
});

function qdfr_render_admin() {
    if (!current_user_can('manage_options')) wp_die('Forbidden');
    echo '<div class="wrap"><h1>QuantDeus · восстановление форума</h1>';
    echo '<p>Импорт использует публичную страницу архива #78 без её изменения.</p>';
    echo '<p><strong>189 исторических ответов не содержатся в архивной HTML-странице.</strong> Необходима проверенная резервная копия.</p>';
    echo '<p>bbPress: <strong>' . (qdfr_bbpress_ready() ? 'активен' : 'отсутствует / выключен') . '</strong></p>';
    $sections = qdfr_read_archive();
    if (is_wp_error($sections)) {
        echo '<div class="notice notice-error"><p>' . esc_html($sections->get_error_message()) . '</p></div>';
    } else {
        echo '<ul>';
        foreach ($sections as $section) echo '<li>' . esc_html($section['title']) . ' — ' . count($section['topics']) . ' тем</li>';
        echo '</ul>';
    }
    if (isset($_GET['qdfr_result'])) {
        $outcome = get_transient('qdfr_result_' . get_current_user_id());
        if (is_array($outcome)) {
            echo '<div class="notice notice-info"><p>' . esc_html(wp_json_encode($outcome, JSON_UNESCAPED_UNICODE)) . '</p></div>';
            delete_transient('qdfr_result_' . get_current_user_id());
        }
    }
    if (qdfr_bbpress_ready() && !is_wp_error($sections)) {
        echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
        wp_nonce_field('qdfr_import');
        echo '<input type="hidden" name="action" value="qdfr_import">';
        submit_button('Импортировать 5 разделов и 32 темы');
        echo '</form>';
    }
    echo '</div>';
}

add_action('admin_post_qdfr_import', static function() {
    if (!current_user_can('manage_options')) wp_die('Forbidden', '', array('response' => 403));
    check_admin_referer('qdfr_import');
    $outcome = qdfr_import_archive();
    set_transient('qdfr_result_' . get_current_user_id(),
        is_wp_error($outcome) ? array('error' => $outcome->get_error_message()) : $outcome,
        10 * MINUTE_IN_SECONDS);
    wp_safe_redirect(add_query_arg('qdfr_result', 1, admin_url('tools.php?page=qdfr-restore')));
    exit;
});

add_shortcode('quantdeus_live_forum', static function() {
    if (!qdfr_bbpress_ready()) {
        return '<p>Форум готовится к восстановлению. Пока открыт <a href="' .
            esc_url(home_url('/forum-archive/')) . '">архив обсуждений</a>.</p>';
    }
    return do_shortcode('[bbp-forum-index]');
});
