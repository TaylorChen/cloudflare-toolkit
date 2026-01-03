## 书签收藏助手 - 浏览器扩展插件

基于 Cloudflare KV 的云端书签管理浏览器插件,支持 Chrome/Edge 浏览器。

![插件预览](../assets/extension-preview.png)

## 功能特性

- ⚡ **快速收藏** - 一键保存当前网页到云端
- 🔍 **实时搜索** - 快速查找已保存的书签
- 🏷️ **标签管理** - 使用标签分类组织书签
- ☁️ **云端同步** - 数据存储在 Cloudflare KV
- 🔐 **隐私安全** - 基于 UUID 的用户身份识别
- 🌐 **跨设备** - 导出/导入 UserID 实现多设备同步
- ⌨️ **快捷键** - 支持 Ctrl+Shift+D (Mac: Cmd+Shift+D) 快速收藏
- 🖱️ **右键菜单** - 右键点击网页或链接即可收藏

## 安装方法

### 开发者模式安装

1. 下载本项目源码
2. 打开 Chrome 浏览器,访问 `chrome://extensions`
3. 开启右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `bookmark-saver-extension` 文件夹

### 配置后端 API

在安装前,请先修改 `background/service-worker.js` 中的 API 地址:

```javascript
// 将这行修改为你的 Cloudflare Workers 部署地址
const API_BASE_URL = 'https://your-worker.workers.dev'
```

## 使用指南

### 首次使用

1. 安装插件后,点击浏览器工具栏的插件图标
2. 插件会自动生成一个唯一的 UserID
3. 在"设置"中可以查看和导出 UserID

### 收藏网页

**方法 1: 插件弹窗**
- 点击插件图标
- 在"快速收藏"表单中编辑信息
- 点击"保存书签"

**方法 2: 右键菜单**
- 在任意网页上右键点击
- 选择"收藏此页面到云端"

**方法 3: 快捷键**
- Windows/Linux: `Ctrl + Shift + D`
- Mac: `Cmd + Shift + D`

### 管理书签

- **查看**: 在插件弹窗中滚动浏览书签列表
- **搜索**: 在搜索框中输入关键词筛选书签
- **编辑**: 点击书签卡片上的"编辑"按钮
- **删除**: 点击书签卡片上的"删除"按钮

### 跨设备同步

1. 在设备 A 上,点击"设置" → 复制 UserID
2. 在设备 B 上安装插件
3. 点击"设置" → 粘贴 UserID → 点击"导入"
4. 两台设备将共享同一份书签数据

### 数据导出

1. 点击"设置"
2. 点击"导出所有书签 (JSON)"
3. 保存 JSON 文件到本地

## 项目结构

```
bookmark-saver-extension/
├── manifest.json              # Manifest V3 配置文件
├── popup/
│   ├── popup.html            # 弹窗界面
│   ├── popup.css             # 样式表
│   └── popup.js              # 交互逻辑
├── background/
│   └── service-worker.js     # 后台服务 Worker
├── assets/
│   ├── icon16.png            # 16x16 图标
│   ├── icon48.png            # 48x48 图标
│   └── icon128.png           # 128x128 图标
└── README.md
```

## 技术栈

- **Manifest V3** - Chrome 扩展平台最新标准
- **Service Worker** - 事件驱动的后台脚本
- **Chrome Storage API** - 本地存储 UserID
- **Fetch API** - 与后端 API 通信

## 权限说明

插件请求以下权限:

- `activeTab`: 读取当前标签页的 URL 和标题
- `contextMenus`: 创建右键菜单项
- `storage`: 存储 UserID 到浏览器本地

## 隐私声明

- 本插件不会收集任何用户个人信息
- 所有书签数据仅存储在用户指定的 Cloudflare KV 中
- UserID 仅用于区分不同用户的数据,不包含任何个人身份信息

## 常见问题

### Q: 如何修改插件使用的后端 API 地址?

A: 编辑 `background/service-worker.js`,修改第 3 行的 `API_BASE_URL` 变量。

### Q: 书签数据存储在哪里?

A: 数据存储在 Cloudflare KV 中,由后端 API 管理。插件本身不保存书签内容。

### Q: 忘记了 UserID 怎么办?

A: 可以在插件的"设置"页面查看当前 UserID。如果需要恢复旧数据,请使用之前导出的 UserID 重新导入。

### Q: 支持 Firefox 浏览器吗?

A: 当前版本仅支持基于 Chromium 的浏览器(Chrome/Edge)。Firefox 支持计划在后续版本中添加。

### Q: 可以离线使用吗?

A: 查看书签需要网络连接。插件依赖后端 API 服务获取数据。

## 配套后端服务

本插件需要配合后端 API 服务使用,请参考 [bookmark-saver](../bookmark-saver) 项目部署后端。

## 开发调试

### 修改代码后重新加载

1. 访问 `chrome://extensions`
2. 找到"书签收藏助手"
3. 点击刷新图标

### 查看日志

1. 访问 `chrome://extensions`
2. 点击"书签收藏助手"下的"检查视图"
3. 选择"background page" 或 "popup.html"
4. 在开发者工具的 Console 中查看日志

## License

MIT

## 贡献

欢迎提交 Issue 和 Pull Request!

## 更新日志

### v1.0.0 (2026-01-02)

- ✨ 初始版本发布
- ⚡ 支持快速收藏和管理书签
- 🔍 实现搜索和标签功能
- ☁️ 集成 Cloudflare KV 云端存储
