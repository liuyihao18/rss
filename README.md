# AI 最新消息 RSS 网页订阅器

一个可 Docker 部署的个人 AI 新闻阅读器。它会聚合内置 RSS 源，提供中文界面、单用户密码登录、SQLite 持久化、已读/收藏状态、聚合 `/feed.xml`，并支持 OpenAI-compatible 接口生成中文摘要。

## 快速启动

1. 复制环境变量示例：

```bash
cp .env.example .env
```

2. 修改 `.env` 中至少这两项：

```bash
ADMIN_PASSWORD=your-password
SESSION_SECRET=replace-with-a-long-random-secret
```

3. 启动：

```bash
docker compose up -d --build
```

默认访问：

- 如果 Caddy 服务正常启动：`http://localhost:11111`

首次进入后，点击页面里的“刷新 RSS”抓取文章。

## 环境变量

常用配置在 `.env.example`：

```bash
ADMIN_PASSWORD=change-me
SESSION_SECRET=replace-with-a-long-random-secret
COOKIE_SECURE=false
DATABASE_URL=file:/data/rss.db
REFRESH_INTERVAL_MINUTES=30
PUBLIC_FEED=false
AI_API_KEY=
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4.1-mini
AI_TIMEOUT_SECONDS=30
```

说明：

- `ADMIN_PASSWORD`：登录密码。
- `SESSION_SECRET`：Cookie 签名密钥，建议设置成长随机字符串。
- `COOKIE_SECURE`：只有在 HTTPS 域名后面部署时设为 `true`；本地 HTTP 使用保持 `false`。
- `DATABASE_URL`：SQLite 路径，Docker 默认保存到 `/data/rss.db`。
- `REFRESH_INTERVAL_MINUTES`：后台自动刷新 RSS 的间隔，最低按 5 分钟处理。
- `PUBLIC_FEED`：是否公开 `/feed.xml`。默认 `false`，需要登录 Cookie。
- `AI_API_KEY`：配置后启用 AI 摘要；为空时只显示原文/RSS 内容。
- `AI_BASE_URL`：OpenAI-compatible API 地址，例如 OpenAI、OpenRouter、兼容本地服务。
- `AI_MODEL`：摘要模型。
- `AI_TIMEOUT_SECONDS`：非流式摘要接口超时时间。

## 添加或修改 RSS 源

RSS 源在这里修改：

```text
lib/sources.ts
```

找到 `FEED_SOURCES` 数组，新增一个对象即可：

```ts
{
  name: "Example AI Blog",
  url: "https://example.com/feed.xml",
  siteUrl: "https://example.com"
}
```

字段说明：

- `name`：页面显示的来源名称。
- `url`：RSS/Atom feed 地址，必须唯一。
- `siteUrl`：来源网站主页。
- `category`：可选，默认是 `"AI"`。

修改后重新构建并启动：

```bash
docker compose up -d --build app
```

然后登录页面点击“刷新 RSS”。应用会把新增源写入 SQLite；如果某个源失败，只会在界面标记错误，不会阻塞其他源。

## 修改摘要 Prompt

摘要逻辑在这里：

```text
lib/ai.ts
```

重点看 `buildRequestBody(...)` 函数：

```ts
function buildRequestBody(article: ArticleWithSource, bodyText: string, stream: boolean) {
  return {
    model: appConfig.ai.model,
    temperature: 0.2,
    stream,
    messages: [
      {
        role: "system",
        content: stream
          ? "流式摘要 Prompt ..."
          : "非流式 JSON 摘要 Prompt ..."
      },
      {
        role: "user",
        content: `来源：${article.source.name}\n标题：${article.title}\n链接：${article.link}\n内容：${truncate(bodyText, 8000)}`
      }
    ]
  };
}
```

这里有两套 Prompt：

- `stream === true`：详情页和网页预览里的流式摘要。要求模型直接输出中文文本，前端会边生成边显示。
- `stream === false`：兼容保留的非流式摘要。要求模型返回 JSON，格式是：

```json
{
  "summary": "2-3句中文摘要",
  "bullets": ["要点1", "要点2", "要点3"]
}
```

如果修改非流式 Prompt，请保持 JSON 字段名 `summary` 和 `bullets` 不变，否则需要同步修改 `parseJsonSummary(...)`。

如果修改流式 Prompt，请保持大致结构：

```text
第一段：2-3 句摘要
要点：
- 要点 1
- 要点 2
- 要点 3
```

否则需要同步修改 `parsePlainSummary(...)`，因为它会在流式结束后把文本解析并保存成结构化摘要。

## 关闭深度思考

AI 请求会默认尝试关闭深度思考。相关代码也在 `lib/ai.ts`：

```ts
function withReasoningDisabled(body: ReturnType<typeof buildRequestBody>) {
  return {
    ...body,
    reasoning_effort: "minimal",
    enable_thinking: false,
    chat_template_kwargs: {
      enable_thinking: false
    }
  };
}
```

如果你的兼容服务不支持这些参数，应用会自动重试一次不带这些扩展字段的请求，避免摘要功能直接失败。

## 原文拉取

详情页会尽力拉取文章原站 HTML，并提取正文。相关代码：

```text
lib/original.ts
```

如果原站反爬、超时、不是 HTML，或正文提取失败，页面会退回 RSS 内容。

## 聚合 RSS 输出

聚合 feed 地址：

```text
/feed.xml
```

默认需要登录。如果希望给外部 RSS 阅读器公开订阅：

```bash
PUBLIC_FEED=true
```

然后重启：

```bash
docker compose up -d app
```

## 常用命令

本地检查：

```bash
npm run lint
npm run build
```

重建并启动应用：

```bash
docker compose up -d --build app
```

查看日志：

```bash
docker compose logs -f app
```

停止：

```bash
docker compose down
```

保留数据只重启应用时，不要删除 Docker volume。SQLite 数据保存在 `ai-rss-data` volume 中。

## 目录速览

```text
app/                         Next.js 页面和 API 路由
components/                  前端组件
lib/sources.ts               内置 RSS 源列表
lib/rss.ts                   RSS 抓取、去重、清理
lib/ai.ts                    摘要 Prompt、AI 请求、流式/非流式解析
lib/original.ts              详情页原文抓取和正文提取
lib/auth.ts                  单用户登录 Cookie
prisma/schema.prisma         SQLite 数据模型
docker-compose.yml           Docker Compose 配置
Dockerfile                   应用镜像构建
Caddyfile                    Caddy 反向代理配置
```
