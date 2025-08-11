-- 決定記録テーブル
-- エージェントの行動とその理由を記録
CREATE TABLE IF NOT EXISTS decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  -- What: 何をしたか
  action_type TEXT NOT NULL,      -- 'WriteFile', 'ExecuteCommand', 'Search', etc.
  action_target TEXT,              -- ファイル名、コマンド、検索クエリなど
  action_details TEXT,             -- JSON形式で詳細情報
  
  -- Why: なぜそうしたか
  reason TEXT NOT NULL,            -- 直接的な理由
  user_intent TEXT,                -- ユーザーの元の要求・意図
  context TEXT,                    -- JSON形式でコンテキスト情報
  
  -- Results: 結果
  result TEXT,                     -- 'success', 'failure', 'partial', 'pending'
  output TEXT,                     -- 実行結果や出力
  error TEXT,                      -- エラーメッセージ（失敗時）
  
  -- Metadata
  session_id TEXT NOT NULL,        -- セッションID
  project_path TEXT,               -- プロジェクトパス
  confidence REAL,                 -- 決定の確信度 (0.0-1.0)
  importance REAL DEFAULT 0.5,     -- 重要度 (0.0-1.0)
  
  -- Relations: 関係性
  parent_decision_id INTEGER,      -- この決定の原因となった決定
  
  -- 外部キー制約
  FOREIGN KEY (parent_decision_id) REFERENCES decisions(id) ON DELETE SET NULL
);

-- 高速検索用インデックス
CREATE INDEX IF NOT EXISTS idx_decisions_timestamp ON decisions(timestamp);
CREATE INDEX IF NOT EXISTS idx_decisions_session ON decisions(session_id);
CREATE INDEX IF NOT EXISTS idx_decisions_action_type ON decisions(action_type);
CREATE INDEX IF NOT EXISTS idx_decisions_parent ON decisions(parent_decision_id);
CREATE INDEX IF NOT EXISTS idx_decisions_result ON decisions(result);
CREATE INDEX IF NOT EXISTS idx_decisions_project ON decisions(project_path);

-- パターンテーブル
-- 頻出するアクションパターンを記録
CREATE TABLE IF NOT EXISTS patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern_type TEXT NOT NULL,       -- 'action_sequence', 'cause_effect', etc.
  pattern_data TEXT NOT NULL,       -- JSON形式でパターン情報
  frequency INTEGER DEFAULT 1,      -- 出現頻度
  success_rate REAL,               -- 成功率
  last_seen DATETIME,              -- 最後に観測された日時
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- セッション情報テーブル
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME,
  project_path TEXT,
  total_decisions INTEGER DEFAULT 0,
  successful_decisions INTEGER DEFAULT 0,
  failed_decisions INTEGER DEFAULT 0,
  metadata TEXT                    -- JSON形式で追加情報
);