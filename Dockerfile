# Node.js 22 (LTS) ベースイメージ
FROM node:22-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        gnupg \
        lsb-release

# 公式 GPG & リポジトリ追加（Bookworm 用）
RUN curl -fsSL https://download.docker.com/linux/debian/gpg | \
        gpg --dearmor -o /usr/share/keyrings/docker.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker.gpg] \
        https://download.docker.com/linux/debian $(lsb_release -cs) stable" \
        > /etc/apt/sources.list.d/docker.list

# 追加で必要なパッケージのインストール
# node:22-bookwormには以下が既に含まれている:
# curl, git, wget, ca-certificates, gnupg, unzip, gcc, g++, make
RUN apt-get update && apt-get install -y  --no-install-recommends \
    jq \
    python3-pip \
    docker-ce-cli \
    docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

# npmを最新バージョンに更新
RUN npm install -g npm@latest

# Bunのインストール
RUN curl -fsSL https://bun.sh/install | bash
ENV BUN_INSTALL="/root/.bun"
ENV PATH="$BUN_INSTALL/bin:$PATH"

# Claude Codeのインストール（最新バージョン）
RUN bun add -g @anthropic-ai/claude-code@latest

# グローバルNode.jsツールのインストール（必要に応じて追加）
RUN bun add -g \
     @google/gemini-cli@latest
#     @aws-amplify/cli@latest \
#     eslint@latest \
#     prettier@latest

# uvのインストール（uvxを含む）
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.cargo/bin:${PATH}"

# GitHub CLIのインストール
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | gpg --dearmor -o /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list && \
    apt-get update && \
    apt-get install -y gh && \
    rm -rf /var/lib/apt/lists/*

# ログディレクトリの作成
RUN mkdir -p /147-Xyla/.logs

# プロジェクトファイルをコピー
COPY package.json bun.lock tsconfig.json ./
COPY src/ ./src/
COPY examples/ ./examples/
COPY tests/ ./tests/

# 依存関係のインストール
RUN bun install

# プロジェクトのビルド
RUN bun run build:all

# グローバルにインストール（binが有効になる）
RUN npm install -g .

# エントリーポイントスクリプトをコピー
COPY scripts/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

WORKDIR /agents
ENTRYPOINT ["/entrypoint.sh"]
CMD ["bash"]
