# ☁️ Cloudflare Toolkit

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Framework: Hoa](https://img.shields.io/badge/Framework-Hoa.js-blue.svg)](https://github.com/hoa-js/hoa)
[![Platform: Cloudflare Workers](https://img.shields.io/badge/Platform-Cloudflare_Workers-orange.svg)](https://workers.cloudflare.com/)

Cloudflare Toolkit 是一个基于 [Cloudflare](https://www.cloudflare.com/) 边缘计算生态构建的高性能工具集。它旨在利用 [Hoa.js](https://github.com/hoa-js/hoa) 框架的极致性能和 Web 标准，为日常开发提供一系列轻量、即用且生产可用的边缘侧解决方案。

## 🌟 工具矩阵

本项目包含以下独立且相互配合的子项目：

| 项目 | 类型 | 核心技术 | 简介 |
| :--- | :--- | :--- | :--- |
| **[Bookmark Saver](./bookmark-saver)** | Backend | Workers + KV | 云端书签 API，支持 UUID 隔离与全文搜索。 |
| **[Bookmark Saver Extension](./bookmark-saver-extension)** | Extension | Browser Extension | 与 API 配合的浏览器插件，支持一键收藏/快捷键。 |
| **[Temp Note](./tempnote)** | Web App | Workers + KV | 即用即走的云端记事本/粘贴板，无需登录。 |
| **[2FA](./2fa)** | Web App | Workers | 轻量级双因素验证码生成器 (TOTP)。 |
| **[Image Transformer](./image-transformer)** | Service | Workers + R2 | 基于 R2 存储的即时图片缩放与优化服务。 |
| **[MyIP](./myip)** | API/Web | Workers | 极简、鲁棒的 IP 检测与地理位置查询服务。 |

## 🚀 核心优势

- **极致性能**: 全面采用 [Hoa.js](https://github.com/hoa-js/hoa) 框架，遵循 Web 标准，实现极低的冷启动延迟与内存占用。
- **边缘原生**: 深度集成 Cloudflare Workers, KV, R2 和 Image Resizing，全球节点就近分发。
- **配置一致**: 所有子项目采用统一的 `wrangler.jsonc` 部署流程，上手门槛极低。
- **隐私优先**: 采用 UUID 隔离、API Key 鉴权等方案，确保个人工具的数据安全。

## 🛠️ 快速上手

### 前置准备

- [Node.js](https://nodejs.org/) >= 20
- [Cloudflare](https://dash.cloudflare.com/) 账户

### 部署流程

每个子项目均遵循以下标准化步骤：

1. **进入子目录**:
   ```bash
   cd project-name
   ```

2. **安装依赖**:
   ```bash
   npm install
   ```

3. **配置参数**:
   根据各目录下的 `wrangler.example.jsonc` 编辑自己的 `wrangler.jsonc`。
   ```bash
   cp wrangler.example.jsonc wrangler.jsonc
   ```

4. **本地开发**:
   ```bash
   npm run dev
   ```

5. **一键部署**:
   ```bash
   npm run deploy
   ```

## 📂 项目结构

```text
cloudflare-toolkit/
├── 2fa/                   # 2FA 验证码生成器
├── bookmark-saver/         # 书签后端 API
├── bookmark-saver-extension/ # 书签浏览器插件
├── image-transformer/      # 图片处理服务
├── myip/                  # IP 检测工具
└── tempnote/              # 临时云记事本
```

## 🤝 贡献指南

我们非常欢迎各种形式的贡献！
- 提交 Issue 报告 Bug 或提出新功能设想。
- 提交 Pull Request 加入你的新工具或优化现有逻辑。
- 完善文档或翻译。

## 📜 开源协议

本项目采用 [MIT License](./LICENSE) 开源协议。

---

> Built with ❤️ and [Hoa.js](https://github.com/hoa-js/hoa) at the Edge.
