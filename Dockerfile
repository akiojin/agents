FROM docker.io/library/node:20-slim

# 開発・実行環境に必要なツールをインストール
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    vim \
    python3 \
    python3-pip \
    build-essential \
    ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install pipx and uv for MCP server execution
RUN python3 -m pip install --upgrade pipx && \
    pipx ensurepath && \
    pipx install uv

# Claude Code CLIをインストール
RUN npm install -g @anthropic-ai/claude-code

# Agents CLIをインストール (必要に応じて後で追加)
# 注: 正確なパッケージ名は要確認
# RUN npm install -g @google-ai/cli

# 作業ディレクトリを設定
WORKDIR /agents

LABEL maintainer="akiojin/agents" \
      description="Agents - AI development and memory management tools" \
      version="1.0.0"

# エントリーポイントを設定（マウントされたファイルを使用）
ENTRYPOINT ["/bin/bash", "/agents/scripts/entrypoint.sh"]

# デフォルトコマンド（開発用）
CMD ["/bin/bash"]
