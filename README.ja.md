# ことばアニメ / Kotoba Anime

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

**ローカルファーストのアニメ日本語学習プレーヤーです。** 作品を探し、自分のローカルメディアを字幕非表示のまま視聴します。聞き取れなかった一文で一時停止し、現在の文の確認、分かち書き・辞書検索、必要なときだけの AI 解説、復習用の保存を行えます。

Kotoba Anime は初期段階のセルフホスト型 Web アプリです。メディアファイルは常にあなたのコンピューターに残り、このアプリが動画をホスト、プロキシ、ダウンロードすることはありません。

## できること

- 今季・前季のアニメを探し、作品を検索し、公式の配信・情報リンクを開けます。
- ローカルの `.mp4` / `.mkv` と日本語 `.srt` / `.ass` 字幕で学習できます。ブラウザー再生が必要な場合は MKV を再多重化します。
- 既定ではリスニングモードです。一時停止で現在の文を表示し、聞き直し、文単位の移動、再生位置に追従する字幕一覧の表示ができます。
- Kuromoji によるローカル分かち書きと JMdict による辞書検索を行えます。
- 必要なときだけ Anthropic、DeepSeek、OpenAI、Google Gemini に構造化された解説を依頼できます。結果はローカルにのみキャッシュされます。
- 単語と文を保存し、Anki 互換の TSV を書き出せます。
- 任意で Jimaku の字幕照合を利用し、magnet リンクを自分のローカルダウンローダーへ渡せます。ダウンローダー RPC、動画転送、リモートのメディア管理は実装していません。

## クイックスタート（macOS）

**動作確認済み環境：** macOS、Node.js 22+、FFmpeg。Linux でも動く可能性はありますが、現時点ではサポート対象のリリース環境ではありません。

```bash
git clone https://github.com/DanielDcool/animeprogram.git
cd animeprogram
brew install ffmpeg
npm ci
npm start
```

[http://localhost:5173](http://localhost:5173) を開きます。アプリはローカルデータベースを自動作成し、既定で `~/AnimeLibrary` を監視します。

別のメディアまたはデータ保存先を使う場合は、起動前に設定してください。

```bash
export MEDIA_DIR="$HOME/Movies/KotobaAnime"
export DATA_DIR="$PWD/.local-data"
npm start
```

## 任意の設定

### 日本語辞書

ローカルの語義検索を使うには、[JMdict Simplified](https://github.com/scriptin/jmdict-simplified/releases) から `jmdict-eng-*.json.zip` をダウンロードし、`server/vendor/jmdict-eng.json` に展開してから、次を実行します。

```bash
npm run import-jmdict -w server
```

### AI 解説

**設定 / Settings** で Anthropic、DeepSeek、OpenAI、Google Gemini を選び、そのプロバイダーの API key を入力します。キーと解説キャッシュはローカルの SQLite データベースだけに保存されます。キーや `server/data/` ディレクトリをコミットしないでください。

OpenAI には [OpenAI Platform API key](https://platform.openai.com/api-keys) が必要です。ChatGPT または Codex のサブスクリプションだけでは API key にはなりません。

### 字幕とローカルメディア

メディアと対応する日本語字幕を `MEDIA_DIR`（既定値：`~/AnimeLibrary`）に置きます。例：

```text
~/AnimeLibrary/Show - 01.mkv
~/AnimeLibrary/Show - 01.ja.srt
```

外部の日本語字幕を優先します。ない場合は、アプリが MKV から埋め込み日本語字幕の抽出を試みます。Jimaku の照合は任意であり、自分で取得した API key を設定画面で入力する必要があります。

## 学習ショートカット

画面上の操作チップはクリックでき、キーボードショートカットも使えます。

| キー | 操作 |
| --- | --- |
| `Space` | 一時停止して現在の文を表示 / 再生して字幕を隠す |
| `A` | 現在の文を聞き直す。素早く 2 回押すと前の文へ戻る |
| `←` / `→` | 前の文 / 次の文 |
| `D` | 選択中の学習文の AI 解説を依頼 |
| `S` | 常時表示字幕を切り替え |
| `T` | 解析パネルと字幕一覧を切り替え。字幕一覧は現在の文に移動 |
| `[` / `]` | 字幕タイミングを −/+100ms 調整 |

デスクトップでは、プレーヤーと解析パネルの間の仕切りをドラッグして幅を変えられます。全画面でも字幕を表示するため、アプリ内の全画面ボタンを使ってください。

聞き直し中も右側の解析は選択中の文を保持します。字幕が非表示でも消えず、別の文で一時停止するか字幕一覧で別の文を選んだときだけ切り替わります。

## 開発

```bash
npm test
npm run build -w web
```

このプロジェクトは `server/` の Fastify サーバーと `web/` の React/Vite クライアントで構成されています。ブラウザーからのリクエストはすべて `web/src/api.ts` を経由し、学習モードの状態は `web/src/player/learningMode.ts` にあります。

## AI コーディングエージェントによるローカル設定

`AGENTS.md` は、ツールをまたいで使えるプロジェクト固有の協働指示として広まりつつあります。このリポジトリにはルートの `AGENTS.md` と、AI エージェント向けの安全な手順書があります。

1. エージェントに [AGENTS.md](AGENTS.md)、この README、[docs/AI-SETUP.md](docs/AI-SETUP.md) を先に読むよう依頼します。
2. 次のように伝えます：「Kotoba Anime をローカルに設定してください。私が依頼しない限り、API key を公開せず、メディアファイルを変更せず、変更をコミットしないでください。」

この手順書は、任意コンポーネント、個人のローカルデータ、検証、事前確認が必要な操作を明確に分けています。

## コントリビュート

コントリビューションを歓迎します。まず [CONTRIBUTING.md](CONTRIBUTING.md)、[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)、[SECURITY.md](SECURITY.md) を読んでください。汎用的なプラットフォーム機能を増やすのではなく、実際の学習時の摩擦を減らす変更に集中してください。

## メディア、プライバシー、法的な境界

- 利用する権利のあるメディアと字幕だけを使ってください。
- メディアは `MEDIA_DIR` に置かれ、アプリがアップロードすることはありません。
- 任意のリソース検索は公開メタデータを返し、magnet リンクをローカルダウンローダーへ渡すだけです。動画のダウンロード、ホスト、プロキシは行いません。
- API key、視聴進捗、単語、対応付け、AI 解説キャッシュはローカルアプリのデータです。SQLite データディレクトリは意図的にバックアップまたは削除してください。
- サーバーは既定で `127.0.0.1` のみを監視します。信頼できないネットワークへ公開しないでください。API key は現在ローカル SQLite データベースに平文で保存されます。報告方法と脅威モデルは [SECURITY.md](SECURITY.md) を参照してください。

## ライセンス

Kotoba Anime は [MIT License](LICENSE) のもとで公開されています。

## プロジェクトの状態

プロジェクトは公開済みで、CI、コントリビューション方針、セキュリティ方針があります。現時点で動作確認済みなのは macOS のみで、Linux と Windows はサポート対象のリリース環境ではありません。広く紹介する前に、著作権上安全なスクリーンショットまたは短いデモが必要です。現在のロードマップは [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) を参照してください。
