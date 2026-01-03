// Popup 页面主脚本 - v2.0

// DOM 元素
const saveForm = document.getElementById('saveForm')
const inputUrl = document.getElementById('inputUrl')
const inputTitle = document.getElementById('inputTitle')
const inputDescription = document.getElementById('inputDescription')
const inputTags = document.getElementById('inputTags')
const btnSave = document.getElementById('btnSave')

const searchInput = document.getElementById('searchInput')
const btnClearSearch = document.getElementById('btnClearSearch')
const btnRefresh = document.getElementById('btnRefresh')

const bookmarksGrouped = document.getElementById('bookmarksGrouped')
const emptyState = document.getElementById('emptyState')
const bookmarkCount = document.getElementById('bookmarkCount')

const btnSettings = document.getElementById('btnSettings')
const settingsPanel = document.getElementById('settingsPanel')
const btnCloseSettings = document.getElementById('btnCloseSettings')
const apiBaseUrl = document.getElementById('apiBaseUrl')
const btnSaveApiUrl = document.getElementById('btnSaveApiUrl')
const apiKey = document.getElementById('apiKey')
const btnSaveApiKey = document.getElementById('btnSaveApiKey')
const currentUserId = document.getElementById('currentUserId')
const btnCopyUserId = document.getElementById('btnCopyUserId')
const importUserId = document.getElementById('importUserId')
const btnImportUserId = document.getElementById('btnImportUserId')
const btnExportData = document.getElementById('btnExportData')

let allBookmarks = []

// ==================== 初始化 ====================

document.addEventListener('DOMContentLoaded', async () => {
    await loadCurrentPage()
    await loadBookmarks()
    await loadUserId()
    await loadWindowSize()

    // 事件监听
    saveForm.addEventListener('submit', handleSave)
    searchInput.addEventListener('input', handleSearch)
    btnClearSearch.addEventListener('click', clearSearch)
    btnRefresh.addEventListener('click', loadBookmarks)

    btnSettings.addEventListener('click', openSettings)
    btnCloseSettings.addEventListener('click', closeSettings)
    btnSaveApiUrl.addEventListener('click', saveApiUrl)
    btnSaveApiKey.addEventListener('click', saveApiKey)
    btnCopyUserId.addEventListener('click', copyUserId)
    btnImportUserId.addEventListener('click', importUserIdHandler)
    btnExportData.addEventListener('click', exportData)

    // 窗口尺寸按钮
    initSizeButtons()
})

// ==================== 加载当前页面信息 ====================

async function loadCurrentPage() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

        if (tab) {
            inputUrl.value = tab.url || ''
            inputTitle.value = tab.title || ''
        }
    } catch (error) {
        console.error('加载当前页面失败:', error)
    }
}

// ==================== 保存书签(一键收藏) ====================

async function handleSave(e) {
    e.preventDefault()

    const url = inputUrl.value.trim()
    const title = inputTitle.value.trim()
    const description = inputDescription.value.trim()
    let tags = inputTags.value
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean)

    if (!url || !title) {
        showNotification('请填写标题', 'error')
        return
    }

    // 检查是否已收藏该网址
    const duplicateBookmark = allBookmarks.find(b => b.url === url)
    if (duplicateBookmark) {
        showNotification('该网址已收藏!', 'warning')
        return
    }

    // 如果没有标签,后端会自动添加"默认分类",这里不需要手动处理

    btnSave.disabled = true
    btnSave.textContent = '保存中...'

    try {
        const response = await sendMessage({
            action: 'saveBookmark',
            data: { url, title, description, tags }
        })

        if (response.success) {
            showNotification('收藏成功!', 'success')
            // 仅清空备注和标签,保留标题以便用户连续收藏
            inputDescription.value = ''
            inputTags.value = ''
            await loadBookmarks()
        } else {
            showNotification(`保存失败: ${response.error}`, 'error')
        }
    } catch (error) {
        showNotification(`保存失败: ${error.message}`, 'error')
    } finally {
        btnSave.disabled = false
        btnSave.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" stroke-width="2"/>
        <polyline points="17 21 17 13 7 13 7 21" stroke-width="2"/>
        <polyline points="7 3 7 8 15 8" stroke-width="2"/>
      </svg>
      一键收藏
    `
    }
}

// ==================== 加载书签列表 ====================

async function loadBookmarks() {
    try {
        const response = await sendMessage({ action: 'getBookmarks' })

        if (response.success) {
            allBookmarks = response.data.data.bookmarks
            renderGroupedBookmarks(allBookmarks)
        } else {
            showNotification(`加载失败: ${response.error}`, 'error')
        }
    } catch (error) {
        showNotification(`加载失败: ${error.message}`, 'error')
    }
}

// ==================== 标签分组逻辑 ====================

function groupBookmarksByTags(bookmarks) {
    const groups = {}

    bookmarks.forEach(bookmark => {
        // 如果书签没有标签,归入"默认分类"
        const tags = bookmark.tags && bookmark.tags.length > 0 ? bookmark.tags : ['默认分类']

        tags.forEach(tag => {
            if (!groups[tag]) {
                groups[tag] = []
            }
            // 避免重复添加(如果书签已经在该分组中)
            if (!groups[tag].find(b => b.id === bookmark.id)) {
                groups[tag].push(bookmark)
            }
        })
    })

    return groups
}

// ==================== 渲染标签分组书签 ====================

function renderGroupedBookmarks(bookmarks) {
    bookmarkCount.textContent = bookmarks.length

    if (bookmarks.length === 0) {
        emptyState.style.display = 'flex'
        bookmarksGrouped.innerHTML = ''
        bookmarksGrouped.appendChild(emptyState)
        return
    }

    emptyState.style.display = 'none'

    const groups = groupBookmarksByTags(bookmarks)
    const sortedTags = Object.keys(groups).sort((a, b) =>
        groups[b].length - groups[a].length
    )

    bookmarksGrouped.innerHTML = ''

    sortedTags.forEach(tag => {
        const groupEl = createTagGroup(tag, groups[tag])
        bookmarksGrouped.appendChild(groupEl)
    })
}

// ==================== 创建标签分组 ====================

function createTagGroup(tagName, bookmarks) {
    const group = document.createElement('div')
    group.className = 'tag-group'

    // 分组标题
    const header = document.createElement('div')
    header.className = 'tag-group-header'

    const titleSpan = document.createElement('div')
    titleSpan.className = 'tag-group-title'
    titleSpan.innerHTML = `
    📂 ${tagName} <span class="tag-count">${bookmarks.length}</span>
  `

    const toggleBtn = document.createElement('button')
    toggleBtn.className = 'toggle-group'
    toggleBtn.innerHTML = '∨'

    header.appendChild(titleSpan)
    header.appendChild(toggleBtn)

    // 书签内容区
    const content = document.createElement('div')
    content.className = 'tag-group-content'

    bookmarks.forEach(bookmark => {
        const item = createBookmarkItem(bookmark)
        content.appendChild(item)
    })

    // 折叠/展开功能
    header.addEventListener('click', () => {
        content.classList.toggle('collapsed')
        header.classList.toggle('collapsed')
    })

    group.appendChild(header)
    group.appendChild(content)

    return group
}

// ==================== 创建书签项 ====================

function createBookmarkItem(bookmark) {
    const item = document.createElement('div')
    item.className = 'bookmark-item'

    const header = document.createElement('div')
    header.className = 'bookmark-header'

    const favicon = document.createElement('img')
    favicon.className = 'bookmark-favicon'
    favicon.src = bookmark.favicon || 'assets/icon16.png'
    favicon.onerror = () => { favicon.src = 'assets/icon16.png' }

    const content = document.createElement('div')
    content.className = 'bookmark-content'

    const title = document.createElement('a')
    title.className = 'bookmark-title'
    title.href = bookmark.url
    title.target = '_blank'
    title.textContent = bookmark.title
    title.title = bookmark.title

    const url = document.createElement('a')
    url.className = 'bookmark-url'
    url.href = bookmark.url
    url.target = '_blank'
    url.textContent = bookmark.url
    url.title = '点击打开: ' + bookmark.url

    content.appendChild(title)
    content.appendChild(url)

    header.appendChild(favicon)
    header.appendChild(content)

    item.appendChild(header)

    // 描述
    if (bookmark.description) {
        const description = document.createElement('div')
        description.className = 'bookmark-description'
        description.textContent = bookmark.description
        item.appendChild(description)
    }

    // 标签列表
    if (bookmark.tags && bookmark.tags.length > 0) {
        const tagsContainer = document.createElement('div')
        tagsContainer.className = 'bookmark-tags'

        bookmark.tags.forEach(tag => {
            const tagEl = document.createElement('span')
            tagEl.className = 'tag'
            tagEl.textContent = tag
            tagsContainer.appendChild(tagEl)
        })

        item.appendChild(tagsContainer)
    }

    // 操作按钮
    const actions = document.createElement('div')
    actions.className = 'bookmark-actions'

    const btnEdit = document.createElement('button')
    btnEdit.className = 'btn-icon'
    btnEdit.textContent = '编辑'
    btnEdit.addEventListener('click', () => editBookmark(bookmark))

    const btnDelete = document.createElement('button')
    btnDelete.className = 'btn-icon delete'
    btnDelete.textContent = '删除'
    btnDelete.addEventListener('click', () => deleteBookmark(bookmark.id))

    actions.appendChild(btnEdit)
    actions.appendChild(btnDelete)

    item.appendChild(actions)

    return item
}

// ==================== 搜索功能 ====================

function handleSearch() {
    const query = searchInput.value.trim()

    if (query) {
        btnClearSearch.style.display = 'flex'
        const filtered = allBookmarks.filter(bookmark => {
            const searchText = `${bookmark.title} ${bookmark.url} ${bookmark.description}`.toLowerCase()
            return searchText.includes(query.toLowerCase())
        })
        renderGroupedBookmarks(filtered)
    } else {
        btnClearSearch.style.display = 'none'
        renderGroupedBookmarks(allBookmarks)
    }
}

function clearSearch() {
    searchInput.value = ''
    btnClearSearch.style.display = 'none'
    renderGroupedBookmarks(allBookmarks)
}

// ==================== 编辑书签 ====================

function editBookmark(bookmark) {
    const newTitle = prompt('修改标题:', bookmark.title)
    if (newTitle === null) return

    const newDescription = prompt('修改备注:', bookmark.description || '')
    if (newDescription === null) return

    const newTags = prompt('修改标签(逗号分隔):', bookmark.tags.join(', '))
    if (newTags === null) return

    updateBookmark(bookmark.id, {
        title: newTitle.trim(),
        description: newDescription.trim(),
        tags: newTags.split(',').map(t => t.trim()).filter(Boolean)
    })
}

async function updateBookmark(id, data) {
    try {
        const response = await sendMessage({
            action: 'updateBookmark',
            id,
            data
        })

        if (response.success) {
            showNotification('更新成功!', 'success')
            await loadBookmarks()
        } else {
            showNotification(`更新失败: ${response.error}`, 'error')
        }
    } catch (error) {
        showNotification(`更新失败: ${error.message}`, 'error')
    }
}

// ==================== 删除书签 ====================

async function deleteBookmark(id) {
    if (!confirm('确定要删除这个书签吗?')) return

    try {
        const response = await sendMessage({
            action: 'deleteBookmark',
            id
        })

        if (response.success) {
            showNotification('删除成功!', 'success')
            await loadBookmarks()
        } else {
            showNotification(`删除失败: ${response.error}`, 'error')
        }
    } catch (error) {
        showNotification(`删除失败: ${error.message}`, 'error')
    }
}

// ==================== 设置面板 ====================

function openSettings() {
    settingsPanel.style.display = 'flex'
    loadApiUrl()
    loadApiKey()
}

function closeSettings() {
    settingsPanel.style.display = 'none'
}

async function loadApiUrl() {
    try {
        const response = await sendMessage({ action: 'getApiUrl' })
        if (response.success) {
            apiBaseUrl.value = response.apiUrl || 'http://localhost:8787'
        }
    } catch (error) {
        console.error('加载 API 地址失败:', error)
        apiBaseUrl.value = 'http://localhost:8787'
    }
}

async function saveApiUrl() {
    const url = apiBaseUrl.value.trim()

    if (!url) {
        showNotification('请输入 API 地址', 'error')
        return
    }

    // 简单验证URL格式
    try {
        new URL(url)
    } catch {
        showNotification('API 地址格式不正确', 'error')
        return
    }

    try {
        const response = await sendMessage({
            action: 'setApiUrl',
            apiUrl: url
        })

        if (response.success) {
            showNotification('API 地址保存成功!', 'success')
        } else {
            showNotification(`保存失败: ${response.error}`, 'error')
        }
    } catch (error) {
        showNotification(`保存失败: ${error.message}`, 'error')
    }
}

async function loadUserId() {
    try {
        const response = await sendMessage({ action: 'getUserId' })

        if (response.success) {
            currentUserId.value = response.userId
        }
    } catch (error) {
        console.error('加载 UserID 失败:', error)
    }
}

function copyUserId() {
    currentUserId.select()
    document.execCommand('copy')
    showNotification('UserID 已复制到剪贴板!', 'success')
}

async function importUserIdHandler() {
    const newUserId = importUserId.value.trim()

    if (!newUserId) {
        showNotification('请输入 UserID', 'error')
        return
    }

    if (!confirm('导入新的 UserID 将覆盖当前数据,确定继续吗?')) return

    try {
        const response = await sendMessage({
            action: 'setUserId',
            userId: newUserId
        })

        if (response.success) {
            showNotification('UserID 导入成功!', 'success')
            currentUserId.value = newUserId
            importUserId.value = ''
            await loadBookmarks()
        } else {
            showNotification(`导入失败: ${response.error}`, 'error')
        }
    } catch (error) {
        showNotification(`导入失败: ${error.message}`, 'error')
    }
}

async function exportData() {
    try {
        const response = await sendMessage({ action: 'getBookmarks' })

        if (response.success) {
            const data = JSON.stringify(response.data.data.bookmarks, null, 2)
            const blob = new Blob([data], { type: 'application/json' })
            const url = URL.createObjectURL(blob)

            const a = document.createElement('a')
            a.href = url
            a.download = `bookmarks-${Date.now()}.json`
            a.click()

            URL.revokeObjectURL(url)
            showNotification('导出成功!', 'success')
        } else {
            showNotification(`导出失败: ${response.error}`, 'error')
        }
    } catch (error) {
        showNotification(`导出失败: ${error.message}`, 'error')
    }
}

// ==================== 工具函数 ====================

function sendMessage(message) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, response => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message))
            } else {
                resolve(response)
            }
        })
    })
}

function showNotification(message, type = 'info') {
    const color = type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#0E75B6'

    const notification = document.createElement('div')
    notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${color};
    color: white;
    padding: 12px 20px;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    font-size: 13px;
    animation: slideIn 0.3s ease-out;
  `
    notification.textContent = message

    document.body.appendChild(notification)

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out'
        setTimeout(() => notification.remove(), 300)
    }, 3000)
}

// 添加动画样式
const style = document.createElement('style')
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(500px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(500px);
      opacity: 0;
    }
  }
`
document.head.appendChild(style)

// ==================== API Key 管理 ====================

async function loadApiKey() {
    try {
        const response = await sendMessage({ action: 'getApiKey' })
        if (response.success) {
            apiKey.value = response.apiKey || 'dev-test-key-12345'
        }
    } catch (error) {
        console.error('加载 API Key 失败:', error)
        apiKey.value = ''
    }
}

async function saveApiKey() {
    const key = apiKey.value.trim()

    if (!key) {
        showNotification('请输入 API Key', 'error')
        return
    }

    try {
        const response = await sendMessage({
            action: 'setApiKey',
            apiKey: key
        })

        if (response.success) {
            showNotification('API Key 保存成功!', 'success')
        } else {
            showNotification(`保存失败: ${response.error}`, 'error')
        }
    } catch (error) {
        showNotification(`保存失败: ${error.message}`, 'error')
    }
}

// ==================== 窗口尺寸管理 ====================

function initSizeButtons() {
    const sizeButtons = document.querySelectorAll('.btn-size')

    sizeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const size = btn.dataset.size
            setWindowSize(size)
        })
    })
}

async function loadWindowSize() {
    try {
        const result = await chrome.storage.sync.get(['windowSize'])
        const size = result.windowSize || 'standard'
        applyWindowSize(size)
    } catch (error) {
        console.error('加载窗口尺寸失败:', error)
        applyWindowSize('standard')
    }
}

async function setWindowSize(size) {
    try {
        await chrome.storage.sync.set({ windowSize: size })
        applyWindowSize(size)
        showNotification(`已切换到${getSizeName(size)}尺寸`, 'success')
    } catch (error) {
        console.error('保存窗口尺寸失败:', error)
        showNotification('保存尺寸设置失败', 'error')
    }
}

function applyWindowSize(size) {
    // 移除所有尺寸类
    document.body.classList.remove('size-compact', 'size-standard', 'size-spacious')

    // 添加新的尺寸类
    document.body.classList.add(`size-${size}`)

    // 更新按钮状态
    const sizeButtons = document.querySelectorAll('.btn-size')
    sizeButtons.forEach(btn => {
        if (btn.dataset.size === size) {
            btn.classList.add('active')
        } else {
            btn.classList.remove('active')
        }
    })
}

function getSizeName(size) {
    const names = {
        compact: '紧凑',
        standard: '标准',
        spacious: '宽敞'
    }
    return names[size] || '标准'
}
