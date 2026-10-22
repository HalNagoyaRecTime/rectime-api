-- Issue #552。0047の削除結果と復元用bookmarkを確認してから、全SQLを一括実行する。
-- stagingの10イベント・14 Round・実施場所・集合場所・ルールを本番へ再現する。
CREATE TABLE __official_schedule_2026_expected_events (
  event_name TEXT PRIMARY KEY,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  rule_text TEXT NOT NULL
);

INSERT INTO __official_schedule_2026_expected_events
  (event_name, start_time, end_time, rule_text)
VALUES
  ('出席確認①', '0930', '1000', '10:00締切'),
  ('開会式', '1000', '1020', '諸注意説明、競技誘導'),
  ('走れ！○人○脚！', '1030', '1130', '## 競技詳細

〜ルール〜
1,グループ分け -各グループ4人組、3人組、2人組×２、１人の、5グループに分かれる。
出走順は、
１走目4人→2走目3人→3走目2人→4走目2人→5走目1人 の固定順。

2,競技終了条件
計12名が走り終えた時点でゴールとする。

〜競技概要〜
片道15ｍのコースをそれぞれのグループが走りタイムを競う。
・1戦：5分 × 6回（10クラス × 6回）
・ 同一人物が出走できるのは、原則1回限り。
・アンカーグループはビブスを着用 。

〜その他〜
試合中、はちまきが破れる、解ける場合、メンバーが集まらない、過度な妨害、試合続行不可能、などの場合は失格。

## 特典について

1位:100 2位:90 3位:80 4位:70 5位:60 6位:50 7位:40 8位:30 9位:20 10位:10 失格:0'),
  ('ロイヤルドッジ', '1130', '1300', '競技詳細
王様ドッジに近い形式のポイント性ドッジボール。複数チームの代表者がA・B・C・Dコートに分かれて対戦する。
〜ルール〜
・形式：王様ドッジ形式（当たったら退場）
・開始方法：アリーナの両コートで、審判の合図で同時スタート（アリーナごとで試合状況がズレる可能性あり）
・試合時間：3分
・ボール数：1コート2個（開始時は1個、開始1分経過で2個目投入）
・コート：A・Bはメインアリーナ、C・Dコートはサブアリーナをそれぞれ半面使用
〜王(ビブスを着る人)ついて〜
・最後まで残っていた際に10ポイントが得られる役職
・王は必ず1名選出する。性別などの内訳は各クラスの任意とする。
〜アウト・セーフのルール〜
・アウト条件：ボールが体に当たりノーバウンドで落ちたタイミングでアウト（外野へ退場）
・セーフ条件：ボールをキャッチする、頭に当たったら、ノーバウンドで当たった二人目はセーフ（続行）
・復活ルール：なし
〜失格・外野のルール〜
・失格条件：試合開始までに招集場所に集まらない、審判の指示に故意に従わない
・外野：なし（一度アウトになった人は、相手チームのコート外に出てボールひろいをする）
〜試合終了後〜
・各コートで生き残っている王とその他の人数を審判がカウント、のちにコートごとで解散
・各クラスの獲得点数はドッジボール競技の終了後に周知される
〜コート構成・点数配分〜
・Aコート：2チームの代表者（計40人）が20人vs20人で対戦（メインアリーナ）
・Bコート：2クラスの代表者（計40人）が20人vs20人で対戦（メインアリーナ）
・Cコート：2チームの代表者（計40人）が20人vs20人で対戦（サブアリーナ）
・Dコート：2クラスの代表者（計40人）が20人vs20人で対戦（サブアリーナ）
・点数配分：試合終了時、”得点について”の計算方法により、そのチームの獲得点数を決める
特典について
・生き残った人数に応じて各チームポイントを加算
王＝10ポイント／その他＝1ポイント
・同時にプレイしていた8チームで、ポイントが高いチームから順に獲得点数を割り振る
1位100 2位90 3位80 4位70 5位60 6位50 7位40 8位30
（同ポイントの場合は同じ順位とし、直後の順位を飛ばす）
（最終試合の4チームは、1,3,5,7位の得点を順に採用する）'),
  ('昼休憩＋コスプレ大会', '1300', '1400', '当日の審査は8チームで実施'),
  ('出席確認②', '1300', '1330', '13:30締切。FXカウント2'),
  ('紙飛行機飛ばし', '1400', '1500', '## 競技詳細

コート内の助走ゾーンからライン手前の好きな場所へ移動し、事前に制作した紙飛行機を飛ばし、
遠くまで飛んだ上位5名にポイントを与える競技。

〜ルール〜
・紙飛行機はレク本番の数日前に、担任から専用の用紙を競技者に事前配布する。
・配布された用紙を使用し、原則自宅にて制作し当日持参する。
・紙飛行機はのりづけやテープによる貼り付け加工は禁止とする。
（ただし、ハサミで切るなどで軽量化するなどは可とする。）
・紙飛行機には見えやすい箇所にわかりやすくクラス記号と氏名を記入する。
・制作してきたオリジナル紙飛行機を競技で飛ばす。
・上位5名にポイント。
・1チームで一度に全員が同時に投げる

備考
・この競技は飛距離を測定いたしません。投擲のラインから最も遠くへ飛んだ紙飛行機から順位をつける
・集合整列に揃わなかった競技者は失格とする。
・事前配布した紙を使用した紙飛行機を用意できなかった競技者は失格とする。
・紙飛行機を丸めて投げることは今回禁止する。
・無記名の紙飛行機は失格とする。
・制限時間内に飛ばさなかった競技者は失格とする。
（ホイッスルが鳴った後30秒経っても投げなかった場合失格）
・紙飛行機を飛ばす際に、足がラインを超えた場合は失格とする。
・紙飛行機を手で投げなかった場合は失格とする
（道具を用いて飛ばすのが禁止）
・投げ終えた紙飛行機は回収したのちご返却いたしません。予めご了承ください。
・紙飛行機を投げ終えた参加者はコート内に入らずに退場

## 特典について

1位 : 50　2位 : 40　3位 : 30　4位 : 20　5位 : 10　　6位以下得点なし'),
  ('学科別対抗リレー', '1500', '1530', '## 競技詳細

～ルール～
各学科代表学生16名
8名ずつ2チーム(A・Bチーム)

・[AT]：赤チーム
・[CG]：ピンクチーム
・[AD/AP/GP]：白チーム
・[IT/IA/IH/PI/PW]：黄チーム
・[DG/DA/CI/CA/CT]：青チーム
・[SE/SC/MC/MR/VD]：緑チーム　　　計6学科

1人片道40mの直線×2回×8名 = 合計640m

合計2レース行う
・1レースAチーム
・2レースBチーム

各走者２回走る
第一走者が一走目とアンカーを務める
走順：1→2→3→4→5→6→7→8→2→3→4→5→6→7→8→1
チームカラーのはちまきを着用し、第一走者兼アンカーは必ずビブスも着用する

～バトンの受け渡し～
二人の走者が指定された交代エリア内にいる状態でバトンの受け渡しを行う
　受け渡す際はバトンを投げたりせず、手渡しで渡すこと

～失格事項～
トラックのラインを大幅にオーバーして走る行為
交代エリア外でバトンを受け渡す行為（次の走者がスタートラインを超えた時点で失格）
多岐に渡ってフライングする行為

## 特典について

各レースの順位に応じて1位1P、2位2P、3位3P…というように集計し、2レース分の合計ポイントが少ない順で最終順位を決定し、それに応じて以下のポイントを付与する
1位100点　2位80点　3位60点　4位40点　5位20点　6位10点
ポイントはチームに属するクラス全てに付与される
(例:ゲーム学科が一位の場合、ゲーム学科の全てのクラスが100点を獲得する)'),
  ('出席確認③', '1530', '1540', '15:40締切'),
  ('表彰式・閉会式', '1540', '1600', '表彰式と閉会式を実施');

CREATE TABLE __official_schedule_2026_expected_venues (
  event_name TEXT NOT NULL,
  venue_name TEXT NOT NULL,
  PRIMARY KEY (event_name, venue_name)
);

INSERT INTO __official_schedule_2026_expected_venues
  (event_name, venue_name)
VALUES
  ('出席確認①', '未定（仮）'),
  ('開会式', '未定（仮）'),
  ('走れ！○人○脚！', 'コートC'),
  ('ロイヤルドッジ', 'メインアリーナ'),
  ('ロイヤルドッジ', 'サブアリーナ'),
  ('昼休憩＋コスプレ大会', '未定（仮）'),
  ('出席確認②', '未定（仮）'),
  ('紙飛行機飛ばし', 'コートB'),
  ('学科別対抗リレー', 'コートA'),
  ('出席確認③', '未定（仮）'),
  ('表彰式・閉会式', '未定（仮）');

CREATE TABLE __official_schedule_2026_expected_gatherings (
  event_name TEXT NOT NULL,
  round INTEGER NOT NULL,
  gathering_time TEXT NOT NULL,
  gathering_spot_name TEXT NOT NULL,
  PRIMARY KEY (event_name, round)
);

INSERT INTO __official_schedule_2026_expected_gatherings
  (event_name, round, gathering_time, gathering_spot_name)
VALUES
  ('走れ！○人○脚！', 1, '10:20', '体育館A'),
  ('走れ！○人○脚！', 2, '10:45', '体育館A'),
  ('走れ！○人○脚！', 3, '11:00', '未定（仮）'),
  ('走れ！○人○脚！', 4, '11:15', '未定（仮）'),
  ('ロイヤルドッジ', 1, '11:30', '未定（仮）'),
  ('ロイヤルドッジ', 2, '11:50', '未定（仮）'),
  ('ロイヤルドッジ', 3, '12:10', '未定（仮）'),
  ('ロイヤルドッジ', 4, '12:30', '未定（仮）'),
  ('紙飛行機飛ばし', 1, '14:00', '未定（仮）'),
  ('紙飛行機飛ばし', 2, '14:15', '未定（仮）'),
  ('紙飛行機飛ばし', 3, '14:30', '未定（仮）'),
  ('紙飛行機飛ばし', 4, '14:45', '未定（仮）'),
  ('学科別対抗リレー', 1, '15:00', '未定（仮）'),
  ('学科別対抗リレー', 2, '15:15', '未定（仮）');

CREATE TABLE __official_schedule_2026_guard (
  valid INTEGER NOT NULL
    CONSTRAINT official_schedule_2026_preconditions CHECK (valid = 1)
);

-- 対象に既存データがある場合、stagingの確定内容と矛盾する行や参加者があれば変更前に停止する。
INSERT INTO __official_schedule_2026_guard (valid)
SELECT CASE WHEN
  EXISTS (
    SELECT 1 FROM d1_migrations
    WHERE name = '0047_remove_initial_dummy_data.sql'
  )
  AND NOT EXISTS (
    SELECT expected.event_name
    FROM __official_schedule_2026_expected_events AS expected
    JOIN events AS event ON event.event_name = expected.event_name
    GROUP BY expected.event_name
    HAVING COUNT(*) > 1
  )
  AND NOT EXISTS (
    SELECT 1
    FROM __official_schedule_2026_expected_events AS expected
    JOIN events AS event ON event.event_name = expected.event_name
    WHERE event.start_time IS NOT expected.start_time
       OR event.end_time IS NOT expected.end_time
       OR event.rule_text IS NOT expected.rule_text
  )
  AND NOT EXISTS (
    SELECT expected.gathering_spot_name
    FROM __official_schedule_2026_expected_gatherings AS expected
    JOIN gathering_spots AS spot
      ON spot.gathering_spot_name = expected.gathering_spot_name
    GROUP BY expected.gathering_spot_name
    HAVING COUNT(DISTINCT spot.gathering_spot_id) > 1
  )
  AND NOT EXISTS (
    SELECT 1
    FROM __official_schedule_2026_expected_events AS expected_event
    JOIN events AS event ON event.event_name = expected_event.event_name
    JOIN event_venues AS event_venue ON event_venue.event_id = event.event_id
    JOIN venues AS venue ON venue.venue_id = event_venue.venue_id
    LEFT JOIN __official_schedule_2026_expected_venues AS expected_venue
      ON expected_venue.event_name = expected_event.event_name
     AND expected_venue.venue_name = venue.venue_name
    WHERE expected_venue.event_name IS NULL
  )
  AND NOT EXISTS (
    SELECT 1
    FROM __official_schedule_2026_expected_events AS expected_event
    JOIN events AS event ON event.event_name = expected_event.event_name
    JOIN gatherings AS gathering ON gathering.event_id = event.event_id
    JOIN gathering_spots AS spot
      ON spot.gathering_spot_id = gathering.gathering_spot_id
    LEFT JOIN __official_schedule_2026_expected_gatherings AS expected_gathering
      ON expected_gathering.event_name = expected_event.event_name
     AND expected_gathering.round = gathering.round
     AND expected_gathering.gathering_time = gathering.gathering_time
     AND expected_gathering.gathering_spot_name = spot.gathering_spot_name
    WHERE expected_gathering.event_name IS NULL
       OR gathering.round_start_time IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT event.event_id
    FROM __official_schedule_2026_expected_events AS expected_event
    JOIN events AS event ON event.event_name = expected_event.event_name
    JOIN gatherings AS gathering ON gathering.event_id = event.event_id
    GROUP BY event.event_id, gathering.round
    HAVING COUNT(*) > 1
  )
  AND NOT EXISTS (
    SELECT 1
    FROM __official_schedule_2026_expected_events AS expected_event
    JOIN events AS event ON event.event_name = expected_event.event_name
    JOIN gatherings AS gathering ON gathering.event_id = event.event_id
    JOIN gathering_group_members AS member
      ON member.gathering_id = gathering.gathering_id
  )
THEN 1 ELSE 0 END;

INSERT INTO events (event_name, start_time, end_time, rule_text)
SELECT expected.event_name, expected.start_time, expected.end_time,
       expected.rule_text
FROM __official_schedule_2026_expected_events AS expected
WHERE NOT EXISTS (
  SELECT 1 FROM events AS event
  WHERE event.event_name = expected.event_name
);

INSERT INTO venues (venue_name)
SELECT DISTINCT expected.venue_name
FROM __official_schedule_2026_expected_venues AS expected
WHERE NOT EXISTS (
  SELECT 1 FROM venues AS venue
  WHERE venue.venue_name = expected.venue_name
);

INSERT INTO gathering_spots (gathering_spot_name)
SELECT DISTINCT expected.gathering_spot_name
FROM __official_schedule_2026_expected_gatherings AS expected
WHERE NOT EXISTS (
  SELECT 1 FROM gathering_spots AS spot
  WHERE spot.gathering_spot_name = expected.gathering_spot_name
);

INSERT INTO event_venues (event_id, venue_id)
SELECT event.event_id, venue.venue_id
FROM __official_schedule_2026_expected_venues AS expected
JOIN events AS event ON event.event_name = expected.event_name
JOIN venues AS venue ON venue.venue_name = expected.venue_name
WHERE NOT EXISTS (
  SELECT 1 FROM event_venues AS current
  WHERE current.event_id = event.event_id
    AND current.venue_id = venue.venue_id
);

INSERT INTO gatherings
  (event_id, gathering_spot_id, round, gathering_time, round_start_time)
SELECT event.event_id, spot.gathering_spot_id, expected.round,
       expected.gathering_time, NULL
FROM __official_schedule_2026_expected_gatherings AS expected
JOIN events AS event ON event.event_name = expected.event_name
JOIN gathering_spots AS spot
  ON spot.gathering_spot_name = expected.gathering_spot_name
WHERE NOT EXISTS (
  SELECT 1 FROM gatherings AS gathering
  WHERE gathering.event_id = event.event_id
    AND gathering.round = expected.round
);

DROP TABLE __official_schedule_2026_guard;
DROP TABLE __official_schedule_2026_expected_gatherings;
DROP TABLE __official_schedule_2026_expected_venues;
DROP TABLE __official_schedule_2026_expected_events;
