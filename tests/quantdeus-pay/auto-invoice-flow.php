<?php
// Deterministic no-network test of self-service invoice creation: NO actual bank call or sale.
declare(strict_types=1);
define('ABSPATH', __DIR__.'/');
define('MINUTE_IN_SECONDS', 60); // Defined by WordPress at runtime.
$GLOBALS['meta'] = [];
$GLOBALS['transients'] = [];
$GLOBALS['inserted'] = null;
$GLOBALS['test_mode'] = $argv[1] ?? 'success';

function add_action(...$a): void {}
function register_activation_hook(...$a): void {}
function add_shortcode(...$a): void {}
function wp_nonce_field(string $action, string $name, bool $referer = true, bool $echo = true): string { return '<input name="'.$name.'" value="testnonce">'; }
function admin_url(string $path): string { return 'https://quantdeus.example/wp-admin/'.$path; }
function home_url(string $path): string { return 'https://quantdeus.example'.$path; }
function esc_url(string $s): string { return $s; }
function wp_verify_nonce(string $nonce, string $action): bool { return $nonce === 'testnonce' && $action === 'qd_pay_auto_invoice'; }
function sanitize_text_field(string $s): string { return $s; }
function wp_unslash(string $s): string { return $s; }
function wp_salt(string $scheme): string { return 'unit-tests-only'; }
function get_transient(string $key): mixed { return $GLOBALS['transients'][$key] ?? 0; }
function set_transient(string $key, mixed $value, int $expiry): void { $GLOBALS['transients'][$key] = $value; }
function is_wp_error($value): bool { return false; }
function wp_insert_post(array $data, bool $wp_error = false): int {
    $GLOBALS['inserted'] = $data;
    return 901;
}
function get_post_meta(int $id, string $key, bool $single = false): mixed {
    return $GLOBALS['meta'][$id][$key] ?? '';
}
function update_post_meta(int $id, string $key, mixed $value): void {
    $GLOBALS['meta'][$id][$key] = $value;
}
function add_query_arg(string $key, string $value, string $url): string {
    return $url.'?'.rawurlencode($key).'='.rawurlencode($value);
}
function nocache_headers(): void {}
function wp_safe_redirect(string $url, int $status = 302): void {
    if ($GLOBALS['test_mode'] !== 'success') {
        fwrite(STDERR, 'FAIL: invalid form passed validation'.PHP_EOL);
        exit(1);
    }
    $p = $GLOBALS['inserted'];
    $m = $GLOBALS['meta'][901] ?? [];
    $t = $m['_qd_pay_token'] ?? '';
    $good = ($p['post_type'] ?? '') === 'qd_pay_invoice'
        && ($p['post_status'] ?? '') === 'publish'
        && ($p['post_title'] ?? '') === 'Автоматизация бизнеса · базовая услуга'
        && ($m['_qd_pay_kopecks'] ?? 0) === 2500000
        && ($m['_qd_pay_state'] ?? '') === 'issued'
        && ($m['_qd_pay_buyer_kind'] ?? '') === 'individual'
        && ($m['_qd_pay_origin'] ?? '') === 'public_automation_checkout'
        && is_string($t) && preg_match('/^[a-f0-9]{48}$/D', $t) === 1
        && str_contains($url, $t)
        && str_starts_with($url, 'https://quantdeus.example/pay/?qd_invoice=')
        && $status === 303;
    if (!$good) { fwrite(STDERR, 'FAIL: invoice state, price or redirect invalid'.PHP_EOL); exit(1); }
    echo "PASS: real invoice object, fixed 25000 RUB, issue state, private token, 303 redirect (no bank debit)\n";
    exit(0);
}
function wp_die(string $message, string $title = '', array $args = []): void {
    $expected = [
        'bad_nonce'=>403, 'no_individual'=>400, 'no_terms'=>400,
        'bot'=>400, 'rate_limit'=>429
    ][$GLOBALS['test_mode']] ?? 0;
    if ($expected && ($args['response'] ?? 0) === $expected && !$GLOBALS['inserted']) {
        echo "PASS: rejected ".$GLOBALS['test_mode']." (HTTP ".$expected.")\n";
        exit(0);
    }
    fwrite(STDERR, "FAIL: unexpected rejection: ".$message."\n");
    exit(1);
}

require dirname(__DIR__, 2) . '/wordpress/src/quantdeus-pay/quantdeus-pay.php';
$form=QD_Pay::buy_form();
if (!str_contains($form,'25 000 ₽') || !str_contains($form,'qd_pay_individual')
    || !str_contains($form,'qd_pay_auto_invoice') || str_contains($form,'50 000 ₽')) {
    fwrite(STDERR,"FAIL: public checkout form/price validation\n"); exit(1);
}

$_SERVER['REQUEST_METHOD']='POST';
$_SERVER['REMOTE_ADDR']='192.0.2.31';
$_POST=[
  'qd_pay_auto_nonce'=>'testnonce',
  'qd_pay_terms'=>'1',
  'qd_pay_individual'=>'1',
  'qd_pay_website'=>''
];
switch ($GLOBALS['test_mode']) {
  case 'bad_nonce': $_POST['qd_pay_auto_nonce']='forged'; break;
  case 'no_individual': unset($_POST['qd_pay_individual']); break;
  case 'no_terms': unset($_POST['qd_pay_terms']); break;
  case 'bot': $_POST['qd_pay_website']='evil.example'; break;
  case 'rate_limit':
    $key='qd_pay_public_issue_'.substr(hash_hmac('sha256','192.0.2.31','unit-tests-only'),0,32);
    $GLOBALS['transients'][$key]=3; break;
}
QD_Pay::auto_invoice();
fwrite(STDERR,"FAIL: handler returned without redirect or validation response\n");
exit(1);
