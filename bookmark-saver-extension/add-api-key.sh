#!/bin/bash
# 为 service-worker.js 添加 API Key 支持的补丁脚本

FILE="background/service-worker.js"

# 1. 在 initializeUserId() 后添加 initializeApiKey()
sed -i '' 's/initializeUserId()/initializeUserId()\n  \n  \/\/ 初始化 API Key\n  initializeApiKey()/' "$FILE"

# 2. 在文件末尾添加 API Key 管理函数
cat >>  "$FILE" << 'EOFKEY'

// ==================== API Key 管理 ====================

/**
 * 初始化 API Key
 */
async function initializeApiKey() {
  const result = await chrome.storage.sync.get(['apiKey'])
  
  if (!result.apiKey) {
    const defaultKey = 'dev-test-key-12345'
    await chrome.storage.sync.set({ apiKey: defaultKey })
    console.log('使用默认 API Key:', defaultKey)
  } else {
    console.log('当前 API Key 已配置')
  }
}

/**
 * 获取 API Key
 */
async function getApiKey() {
  const result = await chrome.storage.sync.get(['apiKey'])
  
  if (!result.apiKey) {
    const defaultKey = 'dev-test-key-12345'
    await chrome.storage.sync.set({ apiKey: defaultKey })
    return defaultKey
  }
  
  return result.apiKey
}

/**
 * 设置 API Key
 */
async function setApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('无效的 API Key')
  }
  
  await chrome.storage.sync.set({ apiKey })
  console.log('API Key 已更新')
}
EOFKEY

echo "API Key 函数已添加到 service-worker.js"
