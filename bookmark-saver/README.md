## Bookmark Saver

基于 Cloudflare Workers 和 KV 存储的云端书签管理 API 服务,使用 [Hoa](https://github.com/hoa-js/hoa) 框架构建。

## 功能特性

- 🚀 **RESTful API** - 标准化的书签增删改查接口
- 💾 **云端存储** - 数据持久化在 Cloudflare KV 中
- 🔍 **全文搜索** - 支持关键词和标签筛选
- 🌐 **全球加速** - 部署在 Cloudflare 边缘网络
- 🔐 **UUID 认证** - 基于用户唯一标识的数据隔离
- ⚡ **高性能** - 毫秒级响应时间

## 技术栈

- [Hoa](https://github.com/hoa-js/hoa) - 轻量级 Web 框架
- [@hoajs/tiny-router](https://github.com/hoa-js/router) - 路由中间件
- Cloudflare Workers - 边缘计算平台
- Cloudflare KV - 键值对存储

## API 接口

### 获取书签列表

```bash
GET /api/bookmarks?userId={uuid}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "bookmarks": [
      {
        "id": "1735564800000-abc123",
        "url": "https://example.com",
        "title": "示例网站",
        "description": "这是一个示例",
        "tags": ["技术", "文档"],
        "favicon": "https://example.com/favicon.ico",
        "createdAt": 1735564800000,
        "updatedAt": 1735564800000
      }
    ],
    "total": 1
  }
}
```

---

### 创建书签

```bash
POST /api/bookmarks
Content-Type: application/json

{
  "userId": "your-uuid",
  "url": "https://example.com",
  "title": "示例网站",
  "description": "网站描述",
  "tags": ["标签1", "标签2"]
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "1735564800000-abc123",
    "createdAt": 1735564800000
  }
}
```

---

### 更新书签

```bash
PUT /api/bookmarks/{id}
Content-Type: application/json

{
  "userId": "your-uuid",
  "title": "新标题",
  "description": "新描述",
  "tags": ["新标签"]
}
```

---

### 删除书签

```bash
DELETE /api/bookmarks/{id}?userId={uuid}
```

---

### 搜索书签

```bash
GET /api/search?userId={uuid}&q={keyword}&tags={tag1,tag2}
```

**参数说明**:
- `q`: 搜索关键词(匹配标题、URL、描述)
- `tags`: 标签过滤(逗号分隔,支持多标签)

---

### 健康检查

```bash
GET /health
```

## 快速开始

### 前置要求

- Node.js >= 20
- Cloudflare 账户

### 安装依赖

```bash
npm install
```

### 配置

1. 复制配置模板:

```bash
cp wrangler.example.jsonc wrangler.jsonc
```

2. 编辑 `wrangler.jsonc` 并填写你的配置:

```jsonc
{
  "account_id": "your-account-id",  // 替换为你的 Cloudflare Account ID
  "name": "bookmark-saver",
  "main": "bookmark-saver.js",
  "compatibility_date": "2025-09-30",
  "no_bundle": false,
  "minify": true,
  "routes": [
    {
      "pattern": "your-domain.com/*",  // 替换为你的域名
      "zone_name": "your-domain.com"   // 替换为你的域名
    }
  ],
  "kv_namespaces": [
    {
      "binding": "KV",
      "id": "your-kv-namespace-id"  // 替换为你的 KV Namespace ID
    }
  ]
}
```

#### 创建 KV Namespace

```bash
# 创建生产环境 KV
wrangler kv:namespace create KV

# 复制返回的 ID 到 wrangler.jsonc 的 kv_namespaces[0].id
```

### 本地开发

```bash
npm run dev
```

服务将在 `http://localhost:8787` 启动。

### 部署

```bash
npm run deploy
```

## 数据结构

### KV 存储格式

**Key**: `bookmarks:{userId}`

**Value**:
```json
{
  "version": "1.0",
  "userId": "uuid-v4",
  "bookmarks": [
    {
      "id": "unique-id",
      "url": "https://example.com",
      "title": "标题",
      "description": "描述",
      "tags": ["标签1", "标签2"],
      "favicon": "https://example.com/favicon.ico",
      "createdAt": 1735564800000,
      "updatedAt": 1735564800000
    }
  ]
}
```

### 数据限制

- URL 长度: ≤ 2048 字符
- 标题长度: ≤ 200 字符
- 描述长度: ≤ 500 字符
- 标签数量: ≤ 10 个
- 单个标签长度: ≤ 20 字符
- 单用户总数据: ≤ 10MB

## 测试

### 使用 curl 测试

```bash
# 创建书签
curl -X POST http://localhost:8787/api/bookmarks \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-uuid-123",
    "url": "https://github.com",
    "title": "GitHub",
    "description": "全球最大的代码托管平台",
    "tags": ["开发", "工具"]
  }'

# 获取书签列表
curl "http://localhost:8787/api/bookmarks?userId=test-uuid-123"

# 搜索书签
curl "http://localhost:8787/api/search?userId=test-uuid-123&q=github"

# 按标签筛选
curl "http://localhost:8787/api/search?userId=test-uuid-123&tags=开发"
```

## CORS 配置

API 默认允许所有来源的跨域请求(`Access-Control-Allow-Origin: *`)。

如需限制特定域名访问,可在 `bookmark-saver.js` 中修改 CORS 中间件:

```javascript
ctx.res.set({
  'Access-Control-Allow-Origin': 'https://your-extension-domain.com',
  // ...
})
```

## 配套浏览器插件

本 API 服务配套有浏览器扩展插件,请参考 [bookmark-saver-extension](../bookmark-saver-extension) 项目。

## License

MIT
