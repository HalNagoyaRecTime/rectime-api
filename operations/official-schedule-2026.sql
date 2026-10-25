-- Issue #552。0047の削除結果と復元用bookmarkを確認してから、全SQLを一括実行する。
-- event.mdと更新後の指定に合わせ、10イベント・16 Round・実施場所・集合場所・ルールを登録する。
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
  ('第一競技「走れ！○人○脚！」', '1030', '1130', '## ルール

### 1. グループ分け

往路15m、復路15mに分けてグループ編成を行う。

#### グループ編成例

- 1走目：4人5脚
- 2走目：3人4脚
- 3走目：2人3脚
- 4走目：2人3脚
- 5走目：1人2脚

走順は固定。

### 2. 競技終了条件

計12名が走り終えた時点でゴールとする。

## 競技概要

- 1戦：5分 × 6回（10クラス × 6回）
- 同一人物が出走できるのは、原則1回限り。
- アンカーグループはビブスを着用。

## その他

- 試合中、試合続行不可の場合は失格。
- 過度な妨害は失格。
- メンバーが集まらなかった場合は失格。
- はちまきが解けた場合、破けた場合は失格。
- 5分 × 6レース = 30分
- 入れ替え時間 = 20分
- 予定競技時間：50分'),
  ('第二競技「ロイヤルドッジ」', '1130', '1300', '王様ドッジに近い形式のドッジボール。複数チームの代表者がA・B・C・Dコートに分かれて対戦する。

## ルール

- 形式：王様ドッジ形式（当たったら退場）
- 開始方法：アリーナ統括から審判への合図で、両コート同時スタート（時間でアリーナごとのスタートを前提とする）
- 試合時間：3分
- ボール数：1コート2個（開始時は1個、開始1分経過で2個目を投入）
- コート：A・Bはメインアリーナ、C・Dはサブアリーナをそれぞれ半面使用

## 王（ビブスを着る人）について

- 最後まで残っていた際に、ポイントを多く得られる役職（王1人：10点）
- 王を1人選出する。性別などの内訳は各クラスの任意とする。

## アウト・セーフのルール

- **アウト**：ボールが体に当たり、ノーバウンドで落ちた場合（外野へ退場）
- **セーフ**：ボールをキャッチした場合、頭に当たった場合、ノーバウンドで当たった2人目（続行）
- **復活ルール**：なし。一度アウトになった人はコート外に出たボールを拾い、拾った側のコートに入れるだけとする。投げてはいけない。

## 勝敗判定

- 勝利条件：時間終了時に、各コートで生き残っている王とその他の人数を数える。
- 引き分け時：そのまま終了。
- 得点方法：最後まで残った人数を各チームの獲得点数とする。

## コート構成・点数配分

- Aコート：2チームの代表者（計40人）が20人対20人で対戦
- Bコート：2クラスの代表者（計40人）が20人対20人で対戦
- Cコート：2チームの代表者（計40人）が20人対20人で対戦
- Dコート：2クラスの代表者（計40人）が20人対20人で対戦
- 点数配分：試合終了時、「得点について」の計算方法により、そのチームの獲得点数を決める。'),
  ('昼休憩＋コスプレ大会', '1300', '1400', '当日の審査は8チームで実施'),
  ('出席確認②', '1300', '1330', '13:30締切。FXカウント2'),
  ('第三競技「紙飛行機飛ばし」', '1400', '1500', 'コート内の助走ゾーンからライン手前の好きな場所へ移動し、事前に制作した紙飛行機を飛ばす。遠くまで飛んだ上位5名にポイントを与える競技。

## ルール

- 紙飛行機はレク本番の数日前に、担任から専用の用紙を競技者へ事前配布する。
- 配布された用紙を使用し、原則自宅で制作して当日持参する。
- のり付けやテープによる貼り付け加工は禁止。
- ハサミで切って軽量化することは可能。
- 見やすい箇所に、クラス記号と氏名を分かりやすく記入する。
- 制作してきたオリジナル紙飛行機を競技で飛ばす。
- 上位5名にポイントを与える。
- 1チーム全員が一度に同時に投げる。

## 備考

- 飛距離は測定しない。投てきラインから最も遠くへ飛んだ紙飛行機から順位を付ける。
- 集合・整列に間に合わなかった競技者は失格。
- 事前配布した紙を使用した紙飛行機を用意できなかった競技者は失格。
- 紙飛行機を丸めて投げることは禁止。
- 無記名の紙飛行機は失格。
- 制限時間内に飛ばさなかった競技者は失格（ホイッスルが鳴ってから30秒経過しても投げなかった場合）。
- 飛ばす際に足がラインを越えた場合は失格。
- 手で投げなかった場合は失格（道具を使って飛ばすことは禁止）。
- 投げ終えた紙飛行機は回収後、返却しない。
- 投げ終えた参加者はコート内に入らず退場する。'),
  ('第四競技「学科別対抗リレー」', '1500', '1530', '## ルール

各学科の代表学生は16名。

### チーム分け

- **赤チーム**：AT
- **ピンクチーム**：CG
- **白チーム**：AD・AP・GP
- **黄チーム**：IT・IA・IH・IW・PI・PW
- **青チーム**：DG・DA・CI・CA・CT
- **緑チーム**：SE・SC・MC・MR・VD

計6学科。

### チーム編成

- 各学科の代表16名を、8名ずつのA・Bチームに分ける。
- 1人1往復 × 8名で、合計8往復。
- 片道の距離は後ほど決定する。

### レース構成

合計2レースを行う。

1. 赤・ピンク・白・黄・青・緑のAチーム
2. 赤・ピンク・白・黄・青・緑のBチーム'),
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
  ('出席確認①', '体育館'),
  ('開会式', '体育館'),
  ('第一競技「走れ！○人○脚！」', 'コートC'),
  ('第二競技「ロイヤルドッジ」', 'メインアリーナ'),
  ('第二競技「ロイヤルドッジ」', 'サブアリーナ'),
  ('昼休憩＋コスプレ大会', '体育館'),
  ('出席確認②', '体育館'),
  ('第三競技「紙飛行機飛ばし」', 'コートB'),
  ('第四競技「学科別対抗リレー」', 'コートA'),
  ('出席確認③', '体育館'),
  ('表彰式・閉会式', '体育館');

CREATE TABLE __official_schedule_2026_expected_gatherings (
  event_name TEXT NOT NULL,
  round INTEGER NOT NULL,
  gathering_time TEXT NOT NULL,
  gathering_spot_name TEXT NOT NULL,
  PRIMARY KEY (event_name, round)
);

-- 開催時間をRound数で等分した開始予定時刻の10分前を集合時刻とし、秒は切り捨てる。
INSERT INTO __official_schedule_2026_expected_gatherings
  (event_name, round, gathering_time, gathering_spot_name)
VALUES
  ('第一競技「走れ！○人○脚！」', 1, '10:20', '体育館A'),
  ('第一競技「走れ！○人○脚！」', 2, '10:40', '体育館A'),
  ('第一競技「走れ！○人○脚！」', 3, '11:00', '未定（仮）'),
  ('第二競技「ロイヤルドッジ」', 1, '11:20', '未定（仮）'),
  ('第二競技「ロイヤルドッジ」', 2, '11:31', '未定（仮）'),
  ('第二競技「ロイヤルドッジ」', 3, '11:42', '未定（仮）'),
  ('第二競技「ロイヤルドッジ」', 4, '11:53', '未定（仮）'),
  ('第二競技「ロイヤルドッジ」', 5, '12:05', '未定（仮）'),
  ('第二競技「ロイヤルドッジ」', 6, '12:16', '未定（仮）'),
  ('第二競技「ロイヤルドッジ」', 7, '12:27', '未定（仮）'),
  ('第二競技「ロイヤルドッジ」', 8, '12:38', '未定（仮）'),
  ('第三競技「紙飛行機飛ばし」', 1, '13:50', '未定（仮）'),
  ('第三競技「紙飛行機飛ばし」', 2, '14:05', '未定（仮）'),
  ('第三競技「紙飛行機飛ばし」', 3, '14:20', '未定（仮）'),
  ('第三競技「紙飛行機飛ばし」', 4, '14:35', '未定（仮）'),
  ('第四競技「学科別対抗リレー」', 1, '14:50', '未定（仮）');

CREATE TABLE __official_schedule_2026_required_gathering_spots (
  gathering_spot_name TEXT PRIMARY KEY
);

INSERT INTO __official_schedule_2026_required_gathering_spots
  (gathering_spot_name)
VALUES ('体育館A'), ('体育館B'), ('体育館C'), ('未定（仮）');

CREATE TABLE __official_schedule_2026_guard (
  valid INTEGER NOT NULL
    CONSTRAINT official_schedule_2026_preconditions CHECK (valid = 1)
);

-- 旧名称、内容の矛盾、集合場所の名称重複、参加者がある場合は変更前に停止する。
INSERT INTO __official_schedule_2026_guard (valid)
SELECT CASE WHEN
  EXISTS (
    SELECT 1 FROM d1_migrations
    WHERE name = '0047_remove_initial_dummy_data.sql'
  )
  AND NOT EXISTS (
    SELECT 1 FROM events
    WHERE event_name IN ('走れ！○人○脚！', 'ロイヤルドッジ', '第二競技「ドッジボール」', '紙飛行機飛ばし', '学科別対抗リレー')
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
    FROM __official_schedule_2026_required_gathering_spots AS expected
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
SELECT expected.gathering_spot_name
FROM __official_schedule_2026_required_gathering_spots AS expected
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
DROP TABLE __official_schedule_2026_required_gathering_spots;
DROP TABLE __official_schedule_2026_expected_gatherings;
DROP TABLE __official_schedule_2026_expected_venues;
DROP TABLE __official_schedule_2026_expected_events;
