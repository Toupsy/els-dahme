<?php
// Rechnet die Szenarien mit dem Originalcode der Feature-App (php/main/boat_hours.php)
// und der Logik von GET /api/boats/hours (api/boats.php) durch.
require '/home/user/dahme-feature-yannis/php/main/boat_hours.php';
date_default_timezone_set('UTC');
$scenarios = json_decode(file_get_contents(__DIR__ . '/scenarios.json'), true);
$out = [];
foreach ($scenarios as $s) {
  $entries = array_map(fn($e) => ['timestamp' => $e[0], 'sender_name' => $e[1], 'message_text' => $e[2]], $s['entries']);
  $tz = new DateTimeZone('Europe/Berlin');
  $from = (new DateTime($s['date'] . ' 00:00:00', $tz))->getTimestamp();
  $to = (new DateTime($s['date'] . ' 23:59:59', $tz))->getTimestamp();
  $nowTs = strtotime($s['now'] . ' UTC');
  // api/boats.php: $until = min(to, time()); Einträge mit timestamp <= until und Motor-Präfix
  $until = date('Y-m-d H:i:s', min($to, $nowTs));
  $entries = array_values(array_filter($entries, fn($e) => $e['timestamp'] <= $until
    && (str_starts_with($e['message_text'], 'Motor läuft, ') || str_starts_with($e['message_text'], 'Motor aus'))));
  $carryTill = date('Y-m-d H:i:s', $from - 1);
  $res = [];
  foreach (['78-1', '78-2', '78-3'] as $sign) {
    // dahme_boat_tracked_minutes nutzt time() als Default nur ohne $until – hier immer gesetzt.
    $carry = (int)(dahme_boat_tracked_minutes($entries, [$sign], $s['base_at'], $carryTill)[$sign] ?? 0);
    $day = (int)(dahme_boat_tracked_minutes($entries, [$sign], date('Y-m-d H:i:s', $from), $until)[$sign] ?? 0);
    $res[$sign] = ['carry_min' => $s['base_min'] + $carry, 'day_min' => $day, 'total_min' => $s['base_min'] + $carry + $day];
  }
  $out[$s['name']] = $res;
}
echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
