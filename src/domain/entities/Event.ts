export interface EventEntity {
  event_id: number;
  event_name: string;
  rule_text: string | null;
  venue: string;
  start_time: string; // JSTのHHMM形式（例: "0930"）
  end_time: string; // JSTのHHMM形式（例: "1745"）
  created_at: string;
  updated_at: string;
}

/**
 * 作成・更新時にRepositoryへ渡すドメイン内部の値。
 * HTTPのsnake_caseとは切り離し、DBカラムにも依存しない。
 */
export interface EventWriteInput {
  name: string;
  ruleText: string | null;
  venue: string;
  startTime: string;
  endTime: string;
}

/** Repositoryでイベント一覧を取得する際の内部条件。 */
export interface EventListOptions {
  startTime?: string;
  limit?: number;
  offset?: number;
}
