<?php
// Isolated deterministic tests; WordPress runtime/integration testing is still separately required.
declare(strict_types=1);
define('ABSPATH', __DIR__ . '/');
$GLOBALS['qd_test_post_types'] = [];
$GLOBALS['qd_test_shortcodes'] = [];
function add_action(...$args): void {}
function register_activation_hook(...$args): void {}
function register_post_type(string $name, array $args): void { $GLOBALS['qd_test_post_types'][$name] = $args; }
function add_shortcode(string $name, $callback): void { $GLOBALS['qd_test_shortcodes'][$name] = $callback; }

require dirname(__DIR__, 2) . '/wordpress/src/quantdeus-pay/quantdeus-pay.php';

function ensure(bool $condition, string $label): void {
    if (!$condition) { fwrite(STDERR, "FAIL: {$label}\n"); exit(1); }
}

$amount = new ReflectionMethod(QD_Pay::class, 'amount');
$cases = [
    '1' => 100,
    '1.00' => 100,
    '1,25' => 125,
    '999999.99' => 99999999,
    '1000000.00' => 100000000,
    '0.99' => 0,
    '0' => 0,
    '1000000.01' => 0,
    '10000000' => 0,
    '1.999' => 0,
    '-1' => 0,
    'abc' => 0,
    '1e10' => 0,
    '1,2,3' => 0,
];
foreach ($cases as $input => $expected) {
    $result = $amount->invoke(null, (string)$input);
    ensure($result === $expected, "amount parser: " . $input . " expected " . $expected . " got " . $result);
}

QD_Pay::post_type();
$invoice = $GLOBALS['qd_test_post_types']['qd_pay_invoice'] ?? null;
ensure(is_array($invoice), 'invoice type registered');
ensure($invoice['public'] === false, 'no public invoice records');
ensure($invoice['show_in_rest'] === false, 'invoices are not public REST resources');
ensure($invoice['capabilities']['edit_posts'] === 'manage_options', 'admin only edits');
ensure($invoice['capabilities']['create_posts'] === 'manage_options', 'admin only creates');
ensure(isset($GLOBALS['qd_test_shortcodes']['quantdeus_pay']), 'payment shortcode registered');
echo "PASS: " . count($cases) . " amount cases, role and data exposure guards\n";
