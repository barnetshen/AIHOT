# 日报周报视频播报（report-videos）

每期日报和周报出刊后，自动做成一条竖屏视频播报（1080×1920，H.264 + AAC 的 MP4），放在 `/videos`，可在线看、可下载后发到短视频平台。

- **有人声**：主播逐条口播。播报词按固定规则从这期报的标题、摘要和导读拼出来（不调用模型）；声音用 [MeloTTS](https://github.com/myshell-ai/MeloTTS)（MIT 许可，中文女声，能读英文词）在本机合成，**免费、不调用外部服务**。每一屏停留的时间就是读完它的时间。
- **有画面**：讲到一条新闻时，画面上半部分放这条新闻自带的视频（原文里的 `<video>`，循环播放、不带原声）；没有视频就放它的配图；都没有就只用文字。和日报封面图同一条规则：只用来源允许在本站展示全文的（信源的 `site_fulltext`）；原文没有，就用同一事件里其他公开报道的，一手来源优先。

## 视频里有什么

| 画面 | 日报 | 周报 | 口播 |
|---|---|---|---|
| 封面 | 报名、日期、第几期、今日头条、本期条数 | 报名、日期范围、第几期、本周主线、总述 | “这里是 XX 日报，今天是……，本期一共 N 条。”（周报接着读总述） |
| 主线 | — | 最多 5 条主线，每条一屏导读 | “本周主线 1，标题。导读。” |
| 正文 | 头条和三条重点在前，再按栏目顺序，最多 8 条，每条一屏 | 每条主线最重要的 2 条，全片最多 10 条 | “N。标题。摘要。”（只报序号） |
| 快讯 | 没排进正文的条目和快讯，最多 6 条标题 | — | “再来看几条快讯。”逐条读标题 |
| 片尾 | 二维码和地址，指向这期的图文版 | 同左 | “以上就是本期日报……我们明天见。” |

日报一般两到四分钟。屏与屏之间淡入淡出 0.5 秒，每屏读完停 0.6 秒。

## 什么时候生成

worker 每 10 分钟跑一次 `videos.render`（后台“运行”页可以看到每次的结果）：

- 读最新 14 期日报、8 期周报在公开读取层里现在的样子，算出每期画面和播报词的指纹；指纹变了（新出刊、更正、有条目撤回、找到了新闻的视频或配图）就重新生成，每次最多生成 3 期，新的在前。
- 文件名带指纹，内容变了地址也变；新视频生成后旧文件立即删除。内容变了而这次来不及或没能重新生成的，旧视频先删掉，不让撤回的内容留在视频里。
- 更早的期数和已经没有可公开条目的期数，视频删除。
- 新闻的视频下载失败、超过 80 MB 或读不出来的，那一屏改用配图或文字，不重试；这期内容下次有变化时会再试。

视频存在数据目录的 `videos/` 下（Docker 是 `/data/videos`），一条日报视频约 5–15 MB。

## 接口

| 地址 | 内容 |
|---|---|
| `/videos` | 页面：日报、周报两栏（`?kind=weekly`），最新一期在上，往期在下 |
| `/api/videos` | JSON：`{ daily: [...], weekly: [...] }`，每期有日期、期号、头条、时长、配了几段原视频和几张配图、视频和封面地址、图文版地址 |
| `/api/videos/files/<文件名>` | 视频（`video/mp4`，支持 Range，可以拖动进度）和封面（`image/jpeg`） |

## 需要什么

- worker 所在的机器要有 `ffmpeg`、`ffprobe`（带 libx264）。Docker 镜像已经装好；不用 Docker 的，自己装一个（`apt install ffmpeg`、`brew install ffmpeg`）。
- 语音模型约 170 MB，不在仓库里。Docker 镜像构建时会自动下载（构建机要能访问 GitHub）；不用 Docker 的，在 `npm ci` 之后运行一次 `node modules/report-videos/scripts/fetch-voice.ts`，它放在 `modules/report-videos/voice/`。下载不了的，可以在别处下载 `vits-melo-tts-zh_en.tar.bz2`（sherpa-onnx 的 tts-models 发布页）后解压到同一个位置。
- 缺 ffmpeg 或语音模型时，`videos.render` 每次都会失败，连续失败 3 次（半小时）会告警。
- 一期日报在 4 核机器上生成约 1 分钟（语音合成和编码），合成时占用最多 4 个 CPU 核。
- 下载新闻的视频和配图走和抓取信源同一个出口（`guardedFetch`：不连内网地址，每次跳转都检查）。

## 怎么改

- 播报词：`backend/scenes.ts` 的 `narration`（开场白、每条怎么读、结束语）和 `spoken`（读之前去掉哪些符号）；语速：`backend/speak.ts` 的 `speed`。
- 画面：`backend/frames.ts`（颜色、字号、版式，视频和配图的位置 `CLIP_BOX`）；站名、行业词、出刊时间读 `site/site.ts`，字标读 `site/brand/wordmark-dark.svg`（没有就用站名）。
- 选哪些条目：`backend/scenes.ts` 的 `DAILY_ENTRIES`、`WEEKLY_*`、`HEADLINES`；每屏读完停多久：`backend/videos.ts` 的 `PAUSE`。
- 保留多少期、每次生成几期：`backend/videos.ts` 的 `KEEP`、`PER_RUN`。
- 改了画面、播报词或语音，把 `scenes.ts` 的 `VIDEO_TEMPLATE_VERSION` 改一下，保留的视频会在接下来几次运行里重新生成。
- 不要这个功能：从 `site/modules/` 三份清单和 `site/package.json` 里去掉它，删掉 `modules/report-videos/`、`Dockerfile` 里下载语音模型的一行和数据目录下的 `videos/`；`report_videos` 表用一个 `DROP TABLE IF EXISTS report_videos` 的迁移删掉。
