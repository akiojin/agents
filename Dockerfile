# マルチステージビルド: ビルドステージ
FROM docker.io/library/node:20-slim AS builder

# 作業ディレクトリを設定
WORKDIR /app

# 依存関係ファイルをコピー
COPY package*.json bun.lockb* ./
COPY packages/*/package*.json ./packages/*/

# Bunをインストール
RUN npm install -g bun

# 依存関係をインストール
RUN bun install --frozen-lockfile

# ソースコードをコピー
COPY . .

# プロジェクトをビルド
RUN bun run build && bun run package

# マルチステージビルド: 本番ステージ
FROM docker.io/library/node:20-slim AS production

# セキュリティ: 非特権ユーザーを作成
RUN groupadd -r synaptic && useradd -r -g synaptic synaptic

# 必要最小限のパッケージをインストール
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    dumb-init \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# アプリケーションディレクトリを作成
WORKDIR /app

# ビルドステージから必要なファイルのみコピー
COPY --from=builder --chown=synaptic:synaptic /app/dist ./dist
COPY --from=builder --chown=synaptic:synaptic /app/packages/cli/dist/*.tgz ./cli/
COPY --from=builder --chown=synaptic:synaptic /app/packages/core/dist/*.tgz ./core/
COPY --from=builder --chown=synaptic:synaptic /app/package.json ./

# Bunをインストール（本番用）
RUN npm install -g bun

# 本番用パッケージをインストール
RUN bun install ./cli/*.tgz ./core/*.tgz --production \
    && bun cache clean

# 非特権ユーザーに切り替え
USER synaptic

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT:-3000}/health || exit 1

# セキュリティ: シグナル処理とプロセス管理
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# 環境変数とメタデータ
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

LABEL maintainer="Synaptic Memory System" \
      description="Synaptic Memory System - AI-powered memory and knowledge management" \
      version="1.0.0"

# デフォルトコマンド
CMD ["bun", "start"]
