# tanku Anime

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

**ローカルファーストのアニメ日本語学習プレーヤーです。** 作品を探し、自分のローカルメディアを字幕非表示のまま視聴します。聞き取れなかった一文で一時停止し、現在の文の確認、分かち書き・辞書検索、必要なときだけの AI 解説、復習用の保存を行えます。

tanku Anime は初期段階のセルフホスト型 Web アプリです。メディアファイルは常にあなたのコンピューターに残り、このアプリが動画をホスト、プロキシ、ダウンロードすることはありません。

## できること

- 今季・前季のアニメを探し、作品を検索し、公式の配信・情報リンクを開けます。
- ローカルの `.mp4` / `.mkv` と日本語 `.srt` / `.ass` 字幕で学習できます。ブラウザー再生が必要な場合は MKV を再多重化します。
- 大きなライブラリでも見やすいよう、動画を保存フォルダごとにまとめ、各フォルダを個別に折りたためます。
- 既定ではリスニングモードです。一時停止で現在の文を表示し、聞き直し、文単位の移動、再生位置に追従する字幕一覧の表示ができます。
- Kuromoji によるローカル分かち書きと JMdict による辞書検索を行えます。
- 必要なときだけ Anthropic、DeepSeek、OpenAI、Google Gemini に構造化された解説を依頼できます。結果はローカルにのみキャッシュされます。
- 単語と文を保存し、説明、既存の AI 講解キャッシュ、時間付きの出典を確認してから、ワンクリックで Anki の `tanku Anime` デッキへ送れます。追加済みのカードは自動でスキップされます。
- 任意で Jimaku の字幕照合を利用し、magnet リンクを自分のローカルダウンローダーへ渡せます。ダウンローダー RPC、動画転送、リモートのメディア管理は実装していません。

## クイックスタート

**必要環境：** Node.js 22.x、および `PATH` から実行できる `ffmpeg` と `ffprobe`。アプリ全体と実メディアの流れは macOS で手動確認済みです。新しい Windows 環境でも、一文だけの AI セットアップから依存関係の導入、テスト、ビルド、`npm start`、Web ページ、ヘルスエンドポイントまで確認済みです。Windows 実機でのメディア再生は最終確認が残っています。

macOS：

```bash
git clone https://github.com/DanielDcool/animeprogram.git
cd animeprogram
brew install ffmpeg
npm ci
npm start
```

Windows PowerShell（先に [Node.js 22](https://nodejs.org/en/download) と、[FFmpeg 公式ダウンロードページ](https://ffmpeg.org/download.html)から案内される Windows ビルドをインストールしてください）：

```powershell
node --version
ffmpeg -version
ffprobe -version
git clone https://github.com/DanielDcool/animeprogram.git
cd animeprogram
npm ci
npm start
```

`node --version` は必ず `v22.x` を表示する必要があります。Node.js の可変な「LTS」パッケージ別名は、メジャーバージョン 22 を指すことを確認できない限り使わないでください。

[http://localhost:5173](http://localhost:5173) を開きます。アプリはローカルデータベースを自動作成し、既定でホームフォルダー内の `AnimeLibrary` を監視します。フルパスは**設定**ページで変更でき、保存後にアプリを再起動すると反映されます。

`MEDIA_DIR` は引き続き最優先のプロセス単位の上書きです。macOS または Linux でメディア保存先を一時的に上書きする場合、またはデータ保存先を変える場合は、起動前に設定してください。

```bash
export MEDIA_DIR="$HOME/Movies/TankuAnime"
export DATA_DIR="$PWD/.local-data"
npm start
```

Windows PowerShell では、現在のプロセスだけに適用する環境変数を使います。

```powershell
$env:MEDIA_DIR = "$HOME\Videos\TankuAnime"
$env:DATA_DIR = "$PWD\.local-data"
npm start
```

## 任意の設定

### 日本語辞書

ローカルの語義検索を使うには、[JMdict Simplified](https://github.com/scriptin/jmdict-simplified/releases) から `jmdict-eng-*.json.zip` をダウンロードし、`server/vendor/jmdict-eng.json` に展開してから、次を実行します。

```bash
npm run import-jmdict -w server
```

### Anki へワンクリック追加

Anki でアドオンコード `2055492159` を使って [AnkiConnect](https://git.sr.ht/~foosoft/anki-connect) をインストールし、Anki を再起動して起動したままにします。単語帳ページの **Anki に一括追加** を押すと、tanku Anime が同名のデッキとノートタイプを作成し、新しいカードだけを追加します。カード裏面には例文、出典、時間付きのローカル再生リンクが入ります。

接続先はローカルの AnkiConnect（`127.0.0.1:8765`）だけで、Anki のコレクション DB を直接変更しません。Anki または AnkiConnect が使えない場合も単語帳は変更されず、必要な設定が画面に表示されます。

### AI 解説

**設定 / Settings** で Anthropic、DeepSeek、OpenAI、Google Gemini を選び、そのプロバイダーの API key を入力します。キーと解説キャッシュはローカルの SQLite データベースだけに保存されます。キーや `server/data/` ディレクトリをコミットしないでください。

OpenAI には [OpenAI Platform API key](https://platform.openai.com/api-keys) が必要です。ChatGPT または Codex のサブスクリプションだけでは API key にはなりません。

### 字幕とローカルメディア

メディアと対応する日本語字幕を**設定**ページに表示されるメディアフォルダ（既定値：ホームフォルダー内の `AnimeLibrary`）に置きます。作品ごとにサブフォルダを作ると、ライブラリも相対フォルダごとにまとまります。例：

```text
AnimeLibrary/Show/Show - 01.mkv
AnimeLibrary/Show/Show - 01.ja.srt
```

外部の日本語字幕を優先します。ない場合は、アプリが MKV から埋め込み日本語字幕の抽出を試みます。Jimaku の照合は任意であり、自分で取得した API key を設定画面で入力する必要があります。

magnet ボタンも任意機能であり、OS に登録された magnet 対応デスクトップダウンローダーが必要です。Windows では、ユーザーの確認なしにエージェントがダウンローダーを導入・再設定してはいけません。自動でライブラリへ取り込む場合は保存先を**設定**ページに表示されるメディアフォルダへ合わせます。ブラウザー互換性を優先するなら H.264 8-bit を選んでください。Windows の HEVC 対応は OS、ハードウェア、拡張機能、ブラウザーに左右されるため、tanku Anime は H.265 を保守的に「変換が必要な可能性あり」と表示します。

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

動画を開き直すと、最後に保存された視聴位置から再開します。単語詳細の出典リンクから開いた場合は、その一度だけ保存済みのセリフ位置が優先されます。

## 開発

```bash
npm test
npm run build -w web
```

このプロジェクトは `server/` の Fastify サーバーと `web/` の React/Vite クライアントで構成されています。ブラウザーからのリクエストはすべて `web/src/api.ts` を経由し、学習モードの状態は `web/src/player/learningMode.ts` にあります。

## AI コーディングエージェントによるローカル設定

AI コーディングエージェントには、次の一文だけを伝えてください。

> https://github.com/DanielDcool/animeprogram から tanku Anime をインストールして起動してください。

[AGENTS.md](AGENTS.md)、この README、[docs/AI-SETUP.md](docs/AI-SETUP.md) を読むことはエージェントの責務です。これらのファイルで安全な境界、プラットフォーム確認、任意コンポーネント、検証手順を定義しているため、利用者が毎回繰り返す必要はありません。Windows では Node.js 22、2 つの FFmpeg コマンド、依存関係、テスト、起動、Web ページ、ヘルスエンドポイントをすべて確認してから、導入成功と報告します。

## コントリビュート

コントリビューションを歓迎します。まず [CONTRIBUTING.md](CONTRIBUTING.md)、[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)、[SECURITY.md](SECURITY.md) を読んでください。汎用的なプラットフォーム機能を増やすのではなく、実際の学習時の摩擦を減らす変更に集中してください。

## メディア、プライバシー、法的な境界

- 利用する権利のあるメディアと字幕だけを使ってください。
- メディアは設定済みのローカルメディアフォルダに置かれ、アプリがアップロードすることはありません。
- 任意のリソース検索は公開メタデータを返し、magnet リンクをローカルダウンローダーへ渡すだけです。動画のダウンロード、ホスト、プロキシは行いません。
- API key、視聴進捗、単語、対応付け、AI 解説キャッシュはローカルアプリのデータです。SQLite データディレクトリは意図的にバックアップまたは削除してください。
- サーバーは既定で `127.0.0.1` のみを監視します。信頼できないネットワークへ公開しないでください。API key は現在ローカル SQLite データベースに平文で保存されます。報告方法と脅威モデルは [SECURITY.md](SECURITY.md) を参照してください。

## ライセンス

tanku Anime は [MIT License](LICENSE) のもとで公開されています。

## プロジェクトの状態

プロジェクトは公開済みで、クロスプラットフォーム CI、コントリビューション方針、セキュリティ方針があります。macOS は手動確認済みです。Windows には互換修正と自動テストを追加し、新規導入と起動も実機確認済みですが、実メディア再生の確認は残っています。広く紹介する前に、著作権上安全なスクリーンショットまたは短いデモも必要です。現在のロードマップは [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) を参照してください。
