{{--
  Őrjárat – műszakjelentés HTML e-mail (Laravel Blade)
  Táblázatos elrendezés, inline stílusok (Outlook/Gmail kompatibilis). Szélesség: 600 px.
  Színek: a világos téma tokenjei (src/theme/tokens.ts → palette.light).

  Várt változók (példa a shape-re):
  $site        = ['name' => 'Ipari park, B épület']
  $shift       = ['date_label' => '2026. október 26–27.', 'from' => '20:00', 'to' => '07:58', 'guard' => 'Nagy Péter',
                  'late_sync_at' => '08:41' | null, 'closed_by' => 'guard'|'handover'|'auto', 'handover_guard' => 'Kiss Gábor' | null]
  $totals      = ['completed' => 11, 'incomplete' => 1, 'missed' => 1, 'incidents' => 2, 'manual' => 1, 'suspicious' => 1]
  $rounds      = [ ['time' => '20:00', 'status' => 'completed'|'incomplete'|'missed', 'start' => '20:02'|null,
                    'duration_min' => 19|null, 'done' => 9, 'total' => 9, 'note' => '1 időgyanús'|null,
                    'route_version' => 4,
                    'points' => [ ['name' => 'Főbejárat', 'time' => '20:02'|null, 'method' => 'nfc'|'qr'|'manual'|null,
                                   'flag' => null|'absent'|'manual'|'time_suspicious'|'too_fast'|'wrong_order', 'flag_text' => '...'] ] ] ]
  $incidents   = [ ['time' => '22:16', 'category' => 'Nyitott ajtó / ablak', 'place' => 'Raktár 2 – vészkijárat közelében',
                    'accuracy' => 6, 'note' => '...', 'manual_point' => false,
                    'photos' => [ ['thumb_url' => '...', 'url' => '...'] ] ] ]
  $photoLinkDays = 31
--}}
@php
  $S = [
    'completed'  => ['label' => 'Teljesítve', 'fg' => '#157F4A', 'bg' => '#D7F2E3'],
    'incomplete' => ['label' => 'Hiányos',    'fg' => '#B4470F', 'bg' => '#FDE6D8'],
    'missed'     => ['label' => 'Elmaradt',   'fg' => '#C0262D', 'bg' => '#FBE0E1'],
  ];
  $F = [
    'absent'          => ['text' => 'hiányzik',      'fg' => '#C0262D', 'row' => '#FBE0E1'],
    'manual'          => ['text' => 'nem igazolt',   'fg' => '#6B46C1', 'row' => '#ECE5FB'],
    'time_suspicious' => ['text' => 'időgyanús',     'fg' => '#8A6100', 'row' => '#FBF0C9'],
    'too_fast'        => ['text' => 'időgyanús: túl gyors', 'fg' => '#8A6100', 'row' => '#FBF0C9'],
    'wrong_order'     => ['text' => 'rossz sorrend', 'fg' => '#B4470F', 'row' => '#FDE6D8'],
  ];
  $M = ['nfc' => 'NFC', 'qr' => 'QR', 'manual' => 'Kézi'];
  $font = "font-family: Manrope, Arial, Helvetica, sans-serif;";
@endphp
<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Műszakjelentés – {{ $site['name'] }}</title>
</head>
<body style="margin:0; padding:0; background:#EEF2F8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EEF2F8;">
<tr><td align="center" style="padding:24px 12px;">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px; background:#FFFFFF; border:1px solid #DCE3EE; border-radius:16px; {{ $font }} color:#0F1726;">

  {{-- Fejléc sáv --}}
  <tr><td style="background:#0F1420; padding:18px 28px; border-radius:16px 16px 0 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="{{ $font }} font-size:16px; font-weight:800; color:#E8ECF5;">Őrjárat</td>
      <td align="right" style="{{ $font }} font-size:13px; font-weight:700; color:#9AA6BF;">Műszakjelentés</td>
    </tr></table>
  </td></tr>

  {{-- Cím --}}
  <tr><td style="padding:26px 28px 6px;">
    <div style="font-size:26px; line-height:32px; font-weight:800;">{{ $site['name'] }}</div>
    <div style="font-size:15px; line-height:22px; color:#4F5B73;">{{ $shift['date_label'] }} · {{ $shift['from'] }}–{{ $shift['to'] }} · Őr: {{ $shift['guard'] }}</div>
  </td></tr>

  {{-- Később érkezett / átadás --}}
  @if($shift['late_sync_at'] || $shift['closed_by'] !== 'guard')
  <tr><td style="padding:12px 28px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="background:#FDF0D5; border-radius:12px; padding:12px 14px; font-size:14px; line-height:21px;">
        @if($shift['late_sync_at'])<b style="color:#8A5300;">Később érkezett:</b> a telefon {{ $shift['late_sync_at'] }}-kor szinkronizált. @endif
        @if($shift['closed_by'] === 'handover')A műszakot {{ $shift['handover_guard'] }} PIN-belépése zárta (átadás).@endif
        @if($shift['closed_by'] === 'auto')A műszak a menetrend vége után automatikusan zárult.@endif
      </td>
    </tr></table>
  </td></tr>
  @endif

  {{-- Összesítő csempék --}}
  <tr><td style="padding:18px 22px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="6" border="0"><tr>
      @foreach([
        ['n' => $totals['completed'],  'l' => 'teljesítve', 'fg' => '#157F4A', 'bg' => '#D7F2E3'],
        ['n' => $totals['incomplete'], 'l' => 'hiányos',    'fg' => '#B4470F', 'bg' => '#FDE6D8'],
        ['n' => $totals['missed'],     'l' => 'elmaradt',   'fg' => '#C0262D', 'bg' => '#FBE0E1'],
        ['n' => $totals['incidents'],  'l' => 'esemény',    'fg' => '#0F1726', 'bg' => '#EEF2F8'],
      ] as $tile)
      <td width="25%" style="background:{{ $tile['bg'] }}; border-radius:12px; padding:12px 14px;">
        <div style="font-size:28px; line-height:32px; font-weight:800; color:{{ $tile['fg'] }};">{{ $tile['n'] }}</div>
        <div style="font-size:13px; font-weight:700;">{{ $tile['l'] }}</div>
      </td>
      @endforeach
    </tr></table>
  </td></tr>
  <tr><td style="padding:8px 28px 0; font-size:14px; color:#4F5B73;">
    Jelölések: <b style="color:#6B46C1;">{{ $totals['manual'] }} nem igazolt</b> · <b style="color:#8A6100;">{{ $totals['suspicious'] }} időgyanús</b>
  </td></tr>

  {{-- Körök táblázata --}}
  <tr><td style="padding:26px 28px 8px; font-size:18px; font-weight:800;">Körök</td></tr>
  <tr><td style="padding:0 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #DCE3EE; border-radius:12px; font-size:14px;">
      <tr style="background:#EEF2F8;">
        @foreach(['Kör','Állapot','Kezdés','Idő','Pontok'] as $h)
        <td style="padding:9px 12px; font-size:11px; font-weight:800; letter-spacing:0.04em; text-transform:uppercase; color:#4F5B73;">{{ $h }}</td>
        @endforeach
      </tr>
      @foreach($rounds as $r)
      <tr>
        <td style="padding:8px 12px; border-top:1px solid #DCE3EE; font-weight:800;">{{ $r['time'] }}</td>
        <td style="padding:8px 12px; border-top:1px solid #DCE3EE;">
          <span style="display:inline-block; padding:3px 10px; border-radius:999px; background:{{ $S[$r['status']]['bg'] }}; color:{{ $S[$r['status']]['fg'] }}; font-size:12px; font-weight:800;">{{ $S[$r['status']]['label'] }}</span>
        </td>
        <td style="padding:8px 12px; border-top:1px solid #DCE3EE; color:#4F5B73;">{{ $r['start'] ?? '–' }}</td>
        <td style="padding:8px 12px; border-top:1px solid #DCE3EE; color:#4F5B73;">{{ $r['duration_min'] ? $r['duration_min'].' p' : '–' }}</td>
        <td style="padding:8px 12px; border-top:1px solid #DCE3EE; font-weight:700;">{{ $r['done'] }}/{{ $r['total'] }}@if($r['note']) · {{ $r['note'] }}@endif</td>
      </tr>
      @endforeach
    </table>
  </td></tr>

  {{-- Események --}}
  @if(count($incidents))
  <tr><td style="padding:26px 28px 8px; font-size:18px; font-weight:800;">Események</td></tr>
  @foreach($incidents as $i)
  <tr><td style="padding:0 28px 10px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #DCE3EE; border-radius:12px;"><tr>
      <td valign="top" style="padding:14px;">
        <div style="font-size:15px; font-weight:800;">{{ $i['time'] }} · {{ $i['category'] }}@if($i['manual_point'])<span style="color:#6B46C1;"> · nem igazolt pont</span>@endif</div>
        <div style="font-size:13px; color:#4F5B73; padding-top:2px;">{{ $i['place'] }} · GPS ±{{ $i['accuracy'] }} m</div>
        @if($i['note'])<div style="font-size:14px; line-height:21px; padding-top:4px;">„{{ $i['note'] }}”</div>@endif
      </td>
      <td valign="top" align="right" style="padding:14px 14px 14px 0; white-space:nowrap;">
        @foreach(array_slice($i['photos'], 0, 3) as $p)
          <a href="{{ $p['url'] }}"><img src="{{ $p['thumb_url'] }}" width="72" height="72" alt="Fotó" style="border-radius:8px; display:inline-block; border:0; object-fit:cover;"></a>
        @endforeach
      </td>
    </tr></table>
  </td></tr>
  @endforeach
  @endif

  {{-- Hibás körök részletesen --}}
  @foreach($rounds as $r)
    @if($r['status'] === 'missed')
    <tr><td style="padding:26px 28px 2px; font-size:18px; font-weight:800;">{{ $r['time'] }}-s kör · <span style="color:#C0262D;">Elmaradt</span></td></tr>
    <tr><td style="padding:0 28px; font-size:14px; line-height:21px; color:#4F5B73;">Nem történt leolvasás az időkeretben. Mind a {{ $r['total'] }} pont hiányzik.</td></tr>
    @elseif($r['status'] === 'incomplete' || collect($r['points'])->contains(fn($p) => $p['flag']))
    <tr><td style="padding:26px 28px 2px; font-size:18px; font-weight:800;">{{ $r['time'] }}-s kör · <span style="color:{{ $S[$r['status']]['fg'] }};">{{ $S[$r['status']]['label'] }}</span></td></tr>
    <tr><td style="padding:0 28px 8px; font-size:14px; color:#4F5B73;">Tervezett {{ $r['time'] }} · indult {{ $r['start'] ?? '–' }} · {{ $r['duration_min'] ?? '–' }} perc · útvonal v{{ $r['route_version'] }}</td></tr>
    <tr><td style="padding:0 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #DCE3EE; border-radius:12px; font-size:14px;">
        <tr style="background:#EEF2F8;">
          @foreach(['Pont','Idő','Mód','Jelölés'] as $h)
          <td style="padding:9px 12px; font-size:11px; font-weight:800; letter-spacing:0.04em; text-transform:uppercase; color:#4F5B73;">{{ $h }}</td>
          @endforeach
        </tr>
        @foreach($r['points'] as $p)
        @php $f = $p['flag'] ? $F[$p['flag']] : null; @endphp
        <tr style="background:{{ $f['row'] ?? '#FFFFFF' }};">
          <td style="padding:8px 12px; border-top:1px solid #DCE3EE; font-weight:700;">{{ $p['name'] }}</td>
          <td style="padding:8px 12px; border-top:1px solid #DCE3EE; color:#4F5B73;">{{ $p['time'] ?? '–' }}</td>
          <td style="padding:8px 12px; border-top:1px solid #DCE3EE; color:#4F5B73;">{{ $p['method'] ? $M[$p['method']] : '–' }}</td>
          <td style="padding:8px 12px; border-top:1px solid #DCE3EE; font-size:13px; font-weight:800; color:{{ $f['fg'] ?? '#157F4A' }};">{{ $p['flag_text'] ?? ($f['text'] ?? 'rendben') }}</td>
        </tr>
        @endforeach
      </table>
    </td></tr>
    @endif
  @endforeach

  {{-- Teljesített körök tömören --}}
  <tr><td style="padding:26px 28px 6px; font-size:18px; font-weight:800;">Teljesített körök</td></tr>
  @foreach($rounds as $r)
    @if($r['status'] === 'completed' && ! collect($r['points'])->contains(fn($p) => $p['flag']))
    <tr><td style="padding:0 28px 8px; font-size:13px; line-height:20px; color:#4F5B73;">
      <b style="color:#157F4A;">{{ $r['time'] }}</b> · indult {{ $r['start'] }} · {{ $r['duration_min'] }} perc ·
      @foreach($r['points'] as $p){{ $p['name'] }} {{ $p['time'] }}@if(! $loop->last), @endif @endforeach
    </td></tr>
    @endif
  @endforeach

  {{-- Lábléc --}}
  <tr><td style="padding:24px 28px; background:#EEF2F8; border-radius:0 0 16px 16px; font-size:12px; line-height:19px; color:#4F5B73;">
    A fotók linkje {{ $photoLinkDays }} napig érvényes. A jelölések nem döntések: az eltéréseket a supervisor bírálja el.<br>
    Ezt a jelentést az Őrjárat rendszer küldte automatikusan. Beállítás: app › Telephely › Jelentések.
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>
