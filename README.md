# spark-org-im.github.io

SparkOrg 服务域名服务 / SparkOrg service-domain service.

后台数据**只有一个文件** [`services.toml`](services.toml)。每个变量 = 一个服务 = 一个域名；
编辑它即可更新全部接口与页面。

The backend data is **a single file** ([`services.toml`](services.toml)). Each variable is one service
with exactly one domain. Edit it and every endpoint/page updates.

> 旧版 `domain.txt` 已迁移为 TOML 格式的 `services.toml`。
> The legacy `domain.txt` has been replaced by `services.toml` (TOML).

## 配置 / Configuration

```toml
[services]
HOME = "sparkorg.dpdns.org"
FORUM = "forum.sparkorg.dpdns.org"
GIT = "git.sparkorg.dpdns.org"
STATUS = "status.sparkorg.dpdns.org"
CLOUD_ST = ""
```

- 一个变量只对应一个域名 / one variable = one domain.
- 值留空表示未配置，生成器会跳过它 / an empty value disables the service.
- 新增服务只需在 `[services]` 中加一行 / add a new line to add a service.
- 可选：用 `[labels.HOME]` 等表配置中英文显示名称与说明 / optional bilingual labels.

## 接口 / API

Base URL: `https://spark-org-im.github.io`

| Endpoint | Format | Description |
| --- | --- | --- |
| `/api/services.txt` | `text/plain` | 全部服务，每行 `KEY=域名` / All services, `KEY=domain` per line |
| `/api/services.json` | `application/json` | JSON（含双语 `labels` 与 `disabled`） |
| `/api/services.yaml` · `/api/services.yml` | `text/yaml` | YAML（等价别名） |
| `/api/services.toml` | `application/toml` | TOML |
| `/api/services.ini` | `text/plain` | INI |
| `/api/services.xml` | `application/xml` | XML |
| `/api/services.csv` | `text/csv` | CSV，列 `service,domain` |
| `/api/services.env` | `text/plain` | dotenv 环境变量 |
| `/api/home.txt` | `text/plain` | 主页域名（HOME）纯文本 / Raw HOME domain |
| `/api/domain.txt` | `text/plain` | `/api/home.txt` 的兼容别名 / Legacy alias |
| `/services.toml` | `text/plain` | 完整配置文件 / Full config file |
| `/go.html` | redirect | 跳转服务，默认 HOME / Redirect to a service, defaults to HOME |

`/api/services.json` 的结构 / shape:

```json
{
  "home": "HOME",
  "home_domain": "sparkorg.dpdns.org",
  "services": {
    "HOME": "sparkorg.dpdns.org",
    "FORUM": "forum.sparkorg.dpdns.org",
    "GIT": "git.sparkorg.dpdns.org",
    "STATUS": "status.sparkorg.dpdns.org"
  },
  "labels": {
    "HOME": {
      "zh": "主页",
      "en": "Home",
      "desc_zh": "SparkOrg 主站入口",
      "desc_en": "SparkOrg main site"
    }
  },
  "disabled": ["CLOUD_ST"]
}
```

完整文档（含在线演示与代码示例）/ Full docs (live demo + examples):

- [`docs.html`](docs.html) — 文档入口，按语言偏好自动跳转 / docs entry, auto-routes by language
- [`docs.zh.html`](docs.zh.html) — 中文接口文档 / Chinese API docs
- [`docs.en.html`](docs.en.html) — 英文接口文档 / English API docs

## 快速使用 / Quick start

```bash
# 全部服务，纯文本
curl -s https://spark-org-im.github.io/api/services.txt
# => HOME=sparkorg.dpdns.org
#    FORUM=forum.sparkorg.dpdns.org
#    GIT=git.sparkorg.dpdns.org
#    STATUS=status.sparkorg.dpdns.org

# 主页域名，纯文本
curl -s https://spark-org-im.github.io/api/home.txt
# => sparkorg.dpdns.org

# JSON
curl -s https://spark-org-im.github.io/api/services.json

# TOML / YAML / XML / CSV / ENV
curl -s https://spark-org-im.github.io/api/services.toml
curl -s https://spark-org-im.github.io/api/services.yaml
```

## 跳转接口 / Redirect

- `https://spark-org-im.github.io/go.html` → HOME
- `https://spark-org-im.github.io/go.html?to=FORUM` → FORUM
- `https://spark-org-im.github.io/go.html?to=GIT` → GIT
- `https://spark-org-im.github.io/go.html?to=STATUS` → STATUS
- `https://spark-org-im.github.io/go.html?to=2` → 第 N 个已配置服务 / N-th configured service
- `https://spark-org-im.github.io/go.html?to=other` → 第一个非 HOME 服务（兼容旧参数）
- `https://spark-org-im.github.io/go.html?to=FDROID/repo/` → 服务 + 路径后缀 / service with a path suffix

`go.html` 优先**运行时实时读取** `services.toml`，因此跳转始终使用最新配置；
若读取失败或 JS 不可用，回退到生成时烘焙的 HOME 域名（meta refresh 兜底）。

## 生成接口文件 / Generate the endpoint files

```bash
node scripts/generate-api.mjs
```

零依赖，Node ≥ 16。生成 `api/*` 各格式文件、`api/home.txt` 与 `go.html`；内容无变化时不会重写。

## 自动同步 / Auto sync

推送 `services.toml`（或生成脚本）变更到 `main` 后，GitHub Action
[`.github/workflows/api-sync.yml`](.github/workflows/api-sync.yml) 会自动运行生成器并提交结果，
**无需手动操作**。

After pushing a change to `services.toml` (or the generator script) on `main`, the GitHub Action
[`.github/workflows/api-sync.yml`](.github/workflows/api-sync.yml) regenerates and commits every
endpoint file automatically.

## 页面 / Pages

- [`index.html`](index.html) — 语言选择 + 服务预览 / language picker + service preview
- [`zh.html`](zh.html) / [`en.html`](en.html) — 服务列表 + API 入口 / service cards with API links
- [`docs.html`](docs.html) — 接口文档入口（自动按语言跳转）/ API docs entry
- [`docs.zh.html`](docs.zh.html) / [`docs.en.html`](docs.en.html) — 中文 / 英文接口文档
- [`go.html`](go.html) — 跳转 HOME / redirect to HOME
