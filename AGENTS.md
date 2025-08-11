## Agents

* AGENTS は Gemini CLI のフォークバージョンです。
* 主な特徴は、任意の OpenAI 互換 API をエージェント推論エンジンとして接続することをサポートすることです。
* API Adaptor アダプター層を導入することで、バックエンドの透明な切り替えを実現し、Agents 内部フォーマットを OpenAI 互換フォーマットに変換します。
* ストリーミング出力、受動的ツール呼び出し、主動的ツール呼び出し、マルチラウンド主動的ツール呼び出しなどの高度な機能をサポートします。
* グローバル構成（OPENAI_LLM_KEY、OPENAI_LLM_BASE、OPENAI_LLM_MODEL）と細やかな構成（タスクタイプごとに異なるモデルを構成）をサポートします。
* アーキテクチャはモジュール化設計で、ContentGenerator 抽象層、AgentsToOpenAIConverter、OpenAIToAgentsConverter の3つの変換器クラスを含み、リクエストとレスポンスのフォーマット変換を処理します。