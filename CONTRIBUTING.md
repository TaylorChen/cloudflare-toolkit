# Contributing to Cloudflare Toolkit

感谢您对 Cloudflare Toolkit 的关注！我们欢迎各种形式的贡献。

## 如何贡献

### 提交问题 (Issues)
如果您发现了 Bug 或有新的功能想法，请通过 GitHub Issues 提交。在提交时，请尽量提供详细的信息：
- 问题描述
- 重现步骤
- 期望的行为
- 操作系统和环境信息

### 提交改进 (Pull Requests)
1. Fork 本仓库。
2. 创建您的特性分支 (`git checkout -b feature/AmazingFeature`)。
3. 提交您的修改 (`git commit -m 'Add some AmazingFeature'`)。
4. 推送到分支 (`git push origin feature/AmazingFeature`)。
5. 开启一个 Pull Request。

## 核心框架：Hoa.js

本项目的所有 Workers 均基于 [Hoa.js](https://github.com/hoa-js/hoa) 框架。在提交代码前，请确保：
- 遵循 Web 标准，避免依赖 Node.js 特有 API 以确保边缘侧兼容性。
- 保持代码紧凑、高性能。
- 更新相关的 `README.md` 和 `wrangler.example.jsonc`。

## 代码风格
- 使用标准 JavaScript 代码风格。
- 保持注释简洁明了。

## 开源协议
通过参与本项目的贡献，您同意您的贡献将基于 **MIT 协议** 开源。
