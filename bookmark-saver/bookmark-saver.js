import { Hoa } from 'hoa'
import { tinyRouter } from '@hoajs/tiny-router'

const app = new Hoa()
app.extend(tinyRouter())

// CORS 中间件
app.use(async (ctx, next) => {
    // 处理 OPTIONS 预检请求
    if (ctx.req.method === 'OPTIONS') {
        ctx.res.set({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
            'Access-Control-Max-Age': '86400'
        })
        ctx.res.status = 204
        return
    }

    // 为所有响应添加 CORS 头
    ctx.res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-API-Key'
    })

    await next()
})

// API Key 验证中间件
app.use(async (ctx, next) => {
    // 健康检查接口不需要验证
    if (ctx.req.path === '/health') {
        await next()
        return
    }

    // 检查 API Key (注意: Hoa.js 中 headers 是对象,不是 Headers API)
    const apiKey = ctx.req.headers['x-api-key']
    const expectedKey = ctx.env.API_KEY

    if (!apiKey || apiKey !== expectedKey) {
        ctx.res.status = 401
        ctx.res.body = { success: false, error: 'Unauthorized: Invalid or missing API Key' }
        return
    }

    await next()
})

// ==================== API Routes ====================

// 获取书签列表
app.get('/api/bookmarks', async (ctx) => {
    const userId = ctx.req.query.userId

    if (!userId) {
        ctx.res.status = 400
        ctx.res.body = { success: false, error: 'Missing userId parameter' }
        return
    }

    try {
        const data = await getBookmarksData(ctx.env.KV, userId)
        ctx.res.body = {
            success: true,
            data: {
                bookmarks: data.bookmarks,
                total: data.bookmarks.length
            }
        }
    } catch (error) {
        ctx.res.status = 500
        ctx.res.body = { success: false, error: error.message }
    }
})

// 创建书签
app.post('/api/bookmarks', async (ctx) => {
    try {
        const body = await ctx.req.json()
        const { userId, url, title, description = '', tags = [] } = body

        if (!userId || !url || !title) {
            ctx.res.status = 400
            ctx.res.body = { success: false, error: 'Missing required fields: userId, url, title' }
            return
        }

        // 数据验证
        if (url.length > 2048) {
            ctx.res.status = 400
            ctx.res.body = { success: false, error: 'URL exceeds maximum length of 2048 characters' }
            return
        }

        if (title.length > 200) {
            ctx.res.status = 400
            ctx.res.body = { success: false, error: 'Title exceeds maximum length of 200 characters' }
            return
        }

        if (description.length > 500) {
            ctx.res.status = 400
            ctx.res.body = { success: false, error: 'Description exceeds maximum length of 500 characters' }
            return
        }

        if (tags.length > 10) {
            ctx.res.status = 400
            ctx.res.body = { success: false, error: 'Maximum 10 tags allowed' }
            return
        }

        const data = await getBookmarksData(ctx.env.KV, userId)

        // 处理标签:为空标签自动添加"默认分类"
        let bookmarkTags = tags.map(tag => tag.trim().slice(0, 20)).filter(Boolean)
        if (bookmarkTags.length === 0) {
            bookmarkTags = ['默认分类']
        }

        const newBookmark = {
            id: generateId(),
            url: url.trim(),
            title: title.trim(),
            description: description.trim(),
            tags: bookmarkTags,
            favicon: body.favicon || `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}`,
            createdAt: Date.now(),
            updatedAt: Date.now()
        }

        data.bookmarks.unshift(newBookmark)

        await saveBookmarksData(ctx.env.KV, userId, data)

        ctx.res.status = 201
        ctx.res.body = {
            success: true,
            data: {
                id: newBookmark.id,
                createdAt: newBookmark.createdAt
            }
        }
    } catch (error) {
        ctx.res.status = 500
        ctx.res.body = { success: false, error: error.message }
    }
})

// 更新书签
app.put('/api/bookmarks/:id', async (ctx) => {
    try {
        const bookmarkId = ctx.req.params.id
        const body = await ctx.req.json()
        const { userId, title, description, tags } = body

        if (!userId) {
            ctx.res.status = 400
            ctx.res.body = { success: false, error: 'Missing userId parameter' }
            return
        }

        const data = await getBookmarksData(ctx.env.KV, userId)
        const bookmarkIndex = data.bookmarks.findIndex(b => b.id === bookmarkId)

        if (bookmarkIndex === -1) {
            ctx.res.status = 404
            ctx.res.body = { success: false, error: 'Bookmark not found' }
            return
        }

        // 更新字段
        if (title !== undefined) {
            if (title.length > 200) {
                ctx.res.status = 400
                ctx.res.body = { success: false, error: 'Title exceeds maximum length of 200 characters' }
                return
            }
            data.bookmarks[bookmarkIndex].title = title.trim()
        }

        if (description !== undefined) {
            if (description.length > 500) {
                ctx.res.status = 400
                ctx.res.body = { success: false, error: 'Description exceeds maximum length of 500 characters' }
                return
            }
            data.bookmarks[bookmarkIndex].description = description.trim()
        }

        if (tags !== undefined) {
            if (tags.length > 10) {
                ctx.res.status = 400
                ctx.res.body = { success: false, error: 'Maximum 10 tags allowed' }
                return
            }
            data.bookmarks[bookmarkIndex].tags = tags.map(tag => tag.trim().slice(0, 20)).filter(Boolean)
        }

        data.bookmarks[bookmarkIndex].updatedAt = Date.now()

        await saveBookmarksData(ctx.env.KV, userId, data)

        ctx.res.body = {
            success: true,
            data: data.bookmarks[bookmarkIndex]
        }
    } catch (error) {
        ctx.res.status = 500
        ctx.res.body = { success: false, error: error.message }
    }
})

// 删除书签
app.delete('/api/bookmarks/:id', async (ctx) => {
    const bookmarkId = ctx.req.params.id
    const userId = ctx.req.query.userId

    if (!userId) {
        ctx.res.status = 400
        ctx.res.body = { success: false, error: 'Missing userId parameter' }
        return
    }

    try {
        const data = await getBookmarksData(ctx.env.KV, userId)
        const initialLength = data.bookmarks.length

        data.bookmarks = data.bookmarks.filter(b => b.id !== bookmarkId)

        if (data.bookmarks.length === initialLength) {
            ctx.res.status = 404
            ctx.res.body = { success: false, error: 'Bookmark not found' }
            return
        }

        await saveBookmarksData(ctx.env.KV, userId, data)

        ctx.res.body = { success: true }
    } catch (error) {
        ctx.res.status = 500
        ctx.res.body = { success: false, error: error.message }
    }
})

// 搜索书签
app.get('/api/search', async (ctx) => {
    const userId = ctx.req.query.userId
    const keyword = (ctx.req.query.q || '').toLowerCase()
    const tagFilter = ctx.req.query.tags ? ctx.req.query.tags.split(',').map(t => t.trim().toLowerCase()) : []

    if (!userId) {
        ctx.res.status = 400
        ctx.res.body = { success: false, error: 'Missing userId parameter' }
        return
    }

    try {
        const data = await getBookmarksData(ctx.env.KV, userId)

        let results = data.bookmarks

        // 关键词搜索
        if (keyword) {
            results = results.filter(bookmark => {
                return bookmark.title.toLowerCase().includes(keyword) ||
                    bookmark.url.toLowerCase().includes(keyword) ||
                    bookmark.description.toLowerCase().includes(keyword)
            })
        }

        // 标签过滤
        if (tagFilter.length > 0) {
            results = results.filter(bookmark => {
                const bookmarkTags = bookmark.tags.map(t => t.toLowerCase())
                return tagFilter.some(tag => bookmarkTags.includes(tag))
            })
        }

        ctx.res.body = {
            success: true,
            data: {
                bookmarks: results,
                total: results.length
            }
        }
    } catch (error) {
        ctx.res.status = 500
        ctx.res.body = { success: false, error: error.message }
    }
})

// 健康检查
app.get('/health', async (ctx) => {
    ctx.res.body = { status: 'ok', timestamp: Date.now() }
})

// 默认路由
app.use(async (ctx) => {
    ctx.res.status = 404
    ctx.res.body = { success: false, error: 'Endpoint not found' }
})

export default app

// ==================== Helper Functions ====================

/**
 * 从 KV 获取用户书签数据
 */
async function getBookmarksData(kv, userId) {
    const key = `bookmarks:${userId}`
    const stored = await kv.get(key)

    if (!stored) {
        return {
            version: '1.0',
            userId,
            bookmarks: []
        }
    }

    try {
        return JSON.parse(stored)
    } catch {
        return {
            version: '1.0',
            userId,
            bookmarks: []
        }
    }
}

/**
 * 保存用户书签数据到 KV
 */
async function saveBookmarksData(kv, userId, data) {
    const key = `bookmarks:${userId}`
    await kv.put(key, JSON.stringify(data))
}

/**
 * 生成唯一 ID
 */
function generateId() {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
}
