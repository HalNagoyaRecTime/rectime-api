-- 2026年度レクリエーションで実施する4競技を正式データとして登録する。
-- 会場が判明している競技のみ、既存の会場マスタ(venues)の「体育館」と紐付ける。
-- 会場が未確定の競技は紐付けを行わない（存在しない会場を新たに作らない）。
-- 同名の競技が既に登録されている場合は何もしない（重複登録の防止）。

INSERT INTO events (event_name, rule_text, start_time, end_time)
SELECT
  '走れ！○人○脚！',
  '2人3脚（人数はグループにより1〜5人）で往路25m・復路25mを走るリレー形式の競技。1チーム12名が3〜7の奇数グループに分かれて出走し、同一人物の出走は原則1回のみ。全員が走り終えた時点でゴールとする。',
  '1030',
  '1130'
WHERE NOT EXISTS (
  SELECT 1 FROM events WHERE event_name = '走れ！○人○脚！'
);

INSERT INTO events (event_name, rule_text, start_time, end_time)
SELECT
  'サバイバルドッジボール',
  'サバイバル形式のドッジボール（外野なし）。ボールが体に当たりノーバウンドで落ちたらアウト、キャッチしたらセーフ（復活なし）。3分×3試合を行い、終了時の生存人数がそのチームの得点となる。顔面への直接投球は禁止。',
  '1350',
  '1420'
WHERE NOT EXISTS (
  SELECT 1 FROM events WHERE event_name = 'サバイバルドッジボール'
);

INSERT INTO events (event_name, rule_text, start_time, end_time)
SELECT
  '紙飛行機飛ばし',
  '事前に配布された用紙で制作した紙飛行機を、コート内の助走ゾーンから飛ばす競技。のりやテープでの加工は禁止。1チーム2〜3人ずつ同時に投げ、最も遠くへ飛んだ上位10名にポイントが入る。無記名やライン超えなどは失格。',
  '1350',
  '1420'
WHERE NOT EXISTS (
  SELECT 1 FROM events WHERE event_name = '紙飛行機飛ばし'
);

INSERT INTO events (event_name, rule_text, start_time, end_time)
SELECT
  '学科別対抗リレー',
  '6学科対抗のバトンリレー。各学科代表16名が8名ずつ2チームに分かれ、1人120mを8人で合計2レース走る。テイクオーバーゾーン(15m)内でバトンパスを行う。内側からの追い抜きや故意の接触、ライン超えは失格。',
  '1420',
  '1450'
WHERE NOT EXISTS (
  SELECT 1 FROM events WHERE event_name = '学科別対抗リレー'
);

INSERT INTO event_venues (event_id, venue_id)
SELECT events.event_id, venues.venue_id
FROM events, venues
WHERE events.event_name IN ('サバイバルドッジボール', '紙飛行機飛ばし')
  AND venues.venue_name = '体育館'
  AND NOT EXISTS (
    SELECT 1 FROM event_venues
    WHERE event_venues.event_id = events.event_id
      AND event_venues.venue_id = venues.venue_id
  );
