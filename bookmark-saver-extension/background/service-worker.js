// Background Service Worker for Bookmark Saver Extension

// API URL 将从 storage 中动态获取,默认为本地开发环境

// 插件安装时初始化
chrome.runtime.onInstalled.addListener(() => {
    console.log('书签收藏助手已安装')

    // 创建右键菜单
    chrome.contextMenus.create({
        id: 'saveBookmark',
        title: '收藏此页面到云端',
        contexts: ['page', 'link']
    })

    // 初始化 UserID
    initializeUserId()

    // 初始化 API Key
    initializeApiKey()

    // 初始化 API URL
    initializeApiUrl()
})

// 右键菜单点击事件
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'saveBookmark') {
        const url = info.linkUrl || tab.url
        const title = tab.title || '未命名网页'

        saveBookmarkFromContext(url, title, tab.favIconUrl)
    }
})

// 快捷键命令监听
chrome.commands.onCommand.addListener((command) => {
    if (command === 'save-bookmark') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                const tab = tabs[0]
                saveBookmarkFromContext(tab.url, tab.title, tab.favIconUrl)
            }
        })
    }
})

// 消息监听(来自 Popup 的请求)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'saveBookmark') {
        saveBookmark(request.data)
            .then(result => sendResponse({ success: true, data: result }))
            .catch(error => sendResponse({ success: false, error: error.message }))
        return true // 保持消息通道开启
    }

    if (request.action === 'getBookmarks') {
        getBookmarks()
            .then(result => sendResponse({ success: true, data: result }))
            .catch(error => sendResponse({ success: false, error: error.message }))
        return true
    }

    if (request.action === 'updateBookmark') {
        updateBookmark(request.id, request.data)
            .then(result => sendResponse({ success: true, data: result }))
            .catch(error => sendResponse({ success: false, error: error.message }))
        return true
    }

    if (request.action === 'deleteBookmark') {
        deleteBookmark(request.id)
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, error: error.message }))
        return true
    }

    if (request.action === 'searchBookmarks') {
        searchBookmarks(request.query, request.tags)
            .then(result => sendResponse({ success: true, data: result }))
            .catch(error => sendResponse({ success: false, error: error.message }))
        return true
    }

    if (request.action === 'getUserId') {
        getUserId()
            .then(userId => sendResponse({ success: true, userId }))
            .catch(error => sendResponse({ success: false, error: error.message }))
        return true
    }

    if (request.action === 'setUserId') {
        setUserId(request.userId)
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, error: error.message }))
        return true
    }

    if (request.action === 'getApiUrl') {
        getApiUrl()
            .then(apiUrl => sendResponse({ success: true, apiUrl }))
            .catch(error => sendResponse({ success: false, error: error.message }))
        return true
    }

    if (request.action === 'setApiUrl') {
        setApiUrl(request.apiUrl)
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, error: error.message }))
        return true
    }

    if (request.action === 'getApiKey') {
        getApiKey()
            .then(apiKey => sendResponse({ success: true, apiKey }))
            .catch(error => sendResponse({ success: false, error: error.message }))
        return true
    }

    if (request.action === 'setApiKey') {
        setApiKey(request.apiKey)
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, error: error.message }))
        return true
    }
})

// ==================== API 调用函数 ====================

/**
 * 保存书签
 */
async function saveBookmark(bookmarkData) {
    const userId = await getUserId()
    const apiUrl = await getApiUrl()
    const apiKey = await getApiKey()

    const response = await fetch(`${apiUrl}/api/bookmarks`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey
        },
        body: JSON.stringify({
            userId,
            ...bookmarkData
        })
    })

    if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '保存失败')
    }

    return response.json()
}

/**
 * 获取书签列表
 */
async function getBookmarks() {
    const userId = await getUserId()
    const apiUrl = await getApiUrl()
    const apiKey = await getApiKey()

    const response = await fetch(`${apiUrl}/api/bookmarks?userId=${userId}`, {
        headers: {
            'X-API-Key': apiKey
        }
    })

    if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '获取书签失败')
    }

    return response.json()
}

/**
 * 更新书签
 */
async function updateBookmark(id, data) {
    const userId = await getUserId()
    const apiUrl = await getApiUrl()
    const apiKey = await getApiKey()

    const response = await fetch(`${apiUrl}/api/bookmarks/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey
        },
        body: JSON.stringify({
            userId,
            ...data
        })
    })

    if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '更新失败')
    }

    return response.json()
}

/**
 * 删除书签
 */
async function deleteBookmark(id) {
    const userId = await getUserId()
    const apiUrl = await getApiUrl()
    const apiKey = await getApiKey()

    const response = await fetch(`${apiUrl}/api/bookmarks/${id}?userId=${userId}`, {
        method: 'DELETE',
        headers: {
            'X-API-Key': apiKey
        }
    })

    if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '删除失败')
    }

    return response.json()
}

/**
 * 搜索书签
 */
async function searchBookmarks(query = '', tags = []) {
    const userId = await getUserId()
    const apiUrl = await getApiUrl()
    const apiKey = await getApiKey()
    const tagsParam = tags.length > 0 ? `&tags=${tags.join(',')}` : ''

    const response = await fetch(
        `${apiUrl}/api/search?userId=${userId}&q=${encodeURIComponent(query)}${tagsParam}`,
        {
            headers: {
                'X-API-Key': apiKey
            }
        }
    )

    if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '搜索失败')
    }

    return response.json()
}

/**
 * 从右键菜单或快捷键保存书签
 */
async function saveBookmarkFromContext(url, title, favicon) {
    try {
        await saveBookmark({
            url,
            title,
            favicon: favicon || `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}`,
            description: '',
            tags: []
        })

        // 发送通知
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'assets/icon128.png',
            title: '收藏成功',
            message: `已收藏: ${title}`
        })
    } catch (error) {
        console.error('保存书签失败:', error)
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'assets/icon128.png',
            title: '收藏失败',
            message: error.message
        })
    }
}

// ==================== UserID 管理 ====================

/**
 * 初始化用户 ID
 */
async function initializeUserId() {
    const result = await chrome.storage.sync.get(['userId'])

    if (!result.userId) {
        const newUserId = generateUUID()
        await chrome.storage.sync.set({ userId: newUserId })
        console.log('生成新的 UserID:', newUserId)
    } else {
        console.log('当前 UserID:', result.userId)
    }
}

/**
 * 获取用户 ID
 */
async function getUserId() {
    const result = await chrome.storage.sync.get(['userId'])

    if (!result.userId) {
        const newUserId = generateUUID()
        await chrome.storage.sync.set({ userId: newUserId })
        return newUserId
    }

    return result.userId
}

/**
 * 设置用户 ID(用于导入)
 */
async function setUserId(userId) {
    if (!userId || typeof userId !== 'string') {
        throw new Error('无效的 UserID')
    }

    await chrome.storage.sync.set({ userId })
    console.log('UserID 已更新:', userId)
}

// ==================== API URL 管理 ====================

/**
 * 初始化 API URL
 */
async function initializeApiUrl() {
    const result = await chrome.storage.sync.get(['apiUrl'])

    if (!result.apiUrl) {
        const defaultUrl = 'http://localhost:8787'
        await chrome.storage.sync.set({ apiUrl: defaultUrl })
        console.log('使用默认 API URL:', defaultUrl)
    } else {
        console.log('当前 API URL:', result.apiUrl)
    }
}

/**
 * 获取 API URL
 */
async function getApiUrl() {
    const result = await chrome.storage.sync.get(['apiUrl'])

    if (!result.apiUrl) {
        const defaultUrl = 'http://localhost:8787'
        await chrome.storage.sync.set({ apiUrl: defaultUrl })
        return defaultUrl
    }

    return result.apiUrl
}

/**
 * 设置 API URL
 */
async function setApiUrl(apiUrl) {
    if (!apiUrl || typeof apiUrl !== 'string') {
        throw new Error('无效的 API URL')
    }

    // 简单验证URL格式
    try {
        new URL(apiUrl)
    } catch {
        throw new Error('API URL 格式不正确')
    }

    await chrome.storage.sync.set({ apiUrl })
    console.log('API URL 已更新:', apiUrl)
}

// ==================== 工具函数 ====================

/**
 * 生成 UUID v4
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
    })
}

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
