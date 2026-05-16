const ROOM_RE = /^[0-9A-Za-z]{4,32}$/
const TOKEN_RE = /^[0-9a-f]{64}$/
const MAX_TEXT_LENGTH = 65536
const MAX_ROOM_BYTES = 512 * 1024
const MAX_ITEMS = 5
const ROOM_TTL_SECONDS = 300
const POLL_INTERVAL_MS = 5000
const LIMITS = {
  createRoomPerIpHour: 30,
  readPerRoomMinute: 90,
  writePerRoomMinute: 20
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (request.method === 'GET' && url.pathname === '/manifest.webmanifest') {
      return jsonResponse(manifest(url.origin))
    }

    if (request.method === 'GET' && url.pathname === '/sw.js') {
      return new Response(serviceWorker(), {
        headers: {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-store'
        }
      })
    }

    if (url.pathname === '/') {
      return Response.redirect(`${url.origin}/${randomRoom()}#${randomSecret()}`, 302)
    }

    const apiMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)$/)
    if (apiMatch && request.method === 'GET') {
      const room = apiMatch[1]
      const validation = validateRoom(room)
      if (validation) return validation

      const readLimit = await checkLimit(env, 'read', `${room}:${tokenPart(request)}`, 60, LIMITS.readPerRoomMinute)
      if (readLimit) return readLimit

      const auth = await authorizeRoom(env, room, request, { createIfMissing: true })
      if (auth.response) return auth.response

      return jsonResponse({
        room,
        items: publicItems(auth.data.items)
      })
    }

    const itemMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/items$/)
    if (itemMatch && request.method === 'POST') {
      const room = itemMatch[1]
      const validation = validateRoom(room)
      if (validation) return validation

      const writeLimit = await checkLimit(env, 'write', `${room}:${tokenPart(request)}`, 60, LIMITS.writePerRoomMinute)
      if (writeLimit) return writeLimit

      const auth = await authorizeRoom(env, room, request, { createIfMissing: true })
      if (auth.response) return auth.response

      const body = await request.json().catch(() => null)
      if (!body || body.type !== 'text' || !body.iv || !body.payload) {
        return jsonResponse({ error: 'Invalid encrypted text item.' }, 400)
      }

      const item = buildTextItem(body, auth.data)
      if (item.response) return item.response

      const oldItems = auth.data.items || []
      const items = [item.value, ...oldItems].slice(0, MAX_ITEMS)
      await writeRoom(env, room, {
        tokenHash: auth.data.tokenHash,
        items,
        bytesUsed: estimateBytes(items)
      })

      return jsonResponse({ room, item: publicItem(item.value), items: publicItems(items) }, 201)
    }

    if (request.method === 'GET') {
      const room = url.pathname.slice(1)
      const validation = validateRoom(room)
      if (validation) return validation

      return htmlResponse(renderApp({ room, origin: url.origin }))
    }

    return jsonResponse({ error: 'Not found.' }, 404)
  }
}

function validateRoom(room) {
  if (!ROOM_RE.test(room)) {
    return jsonResponse({ error: 'Invalid room.' }, 400)
  }
  return null
}

async function authorizeRoom(env, room, request, options = {}) {
  const tokenHash = request.headers.get('x-room-token') || ''
  if (!TOKEN_RE.test(tokenHash)) {
    return { response: jsonResponse({ error: 'Missing room token.' }, 403) }
  }

  const data = await readRoom(env, room)
  if (!data.tokenHash && options.createIfMissing) {
    const createLimit = await checkLimit(env, 'create', await clientFingerprint(request), 3600, LIMITS.createRoomPerIpHour)
    if (createLimit) return { response: createLimit }

    const next = { tokenHash, items: [], bytesUsed: 0 }
    await writeRoom(env, room, next)
    return { data: next }
  }

  if (!data.tokenHash || data.tokenHash !== tokenHash) {
    return { response: jsonResponse({ error: 'Forbidden.' }, 403) }
  }

  return { data }
}

function buildTextItem(body, roomData) {
  const now = Date.now()
  const payload = String(body.payload)
  if (payload.length > MAX_TEXT_LENGTH * 2) {
    return { response: jsonResponse({ error: 'Text is too large.' }, 413) }
  }

  const bytes = byteLength(payload)
  const quota = checkRoomQuota(roomData, bytes)
  if (quota) return { response: quota }

  return {
    value: {
      id: crypto.randomUUID(),
      type: 'text',
      iv: String(body.iv),
      payload,
      bytes,
      createdAt: now,
      expiresAt: now + ROOM_TTL_SECONDS * 1000
    }
  }
}

async function readRoom(env, room) {
  const raw = await env.KV.get(roomKey(room))
  if (!raw) return { tokenHash: '', items: [], bytesUsed: 0 }

  try {
    const parsed = JSON.parse(raw)
    const allItems = Array.isArray(parsed.items) ? parsed.items.filter(isValidItem) : []
    const now = Date.now()
    const activeItems = allItems.filter((item) => !item.expiresAt || item.expiresAt > now).slice(0, MAX_ITEMS)
    return {
      tokenHash: typeof parsed.tokenHash === 'string' ? parsed.tokenHash : '',
      items: activeItems,
      bytesUsed: estimateBytes(activeItems)
    }
  } catch {
    return { tokenHash: '', items: [], bytesUsed: 0 }
  }
}

async function writeRoom(env, room, data) {
  await env.KV.put(roomKey(room), JSON.stringify(data), {
    expirationTtl: ROOM_TTL_SECONDS
  })
}

async function checkLimit(env, scope, subject, windowSeconds, maxHits) {
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000))
  const storageKey = `limit_${scope}_${await sha256Hex(subject)}_${bucket}`
  const current = Number(await env.KV.get(storageKey)) || 0
  if (current >= maxHits) {
    return jsonResponse({ error: 'Rate limit exceeded.', retryAfter: windowSeconds }, 429, {
      'Retry-After': String(windowSeconds)
    })
  }
  await env.KV.put(storageKey, String(current + 1), {
    expirationTtl: windowSeconds + 60
  })
  return null
}

function checkRoomQuota(roomData, nextBytes) {
  const bytesUsed = typeof roomData.bytesUsed === 'number' ? roomData.bytesUsed : estimateBytes(roomData.items || [])
  if (bytesUsed + nextBytes > MAX_ROOM_BYTES) {
    return jsonResponse({ error: 'Room quota exceeded.' }, 413)
  }
  return null
}

function estimateBytes(items) {
  return items.reduce((total, item) => total + (Number(item.bytes) || byteLength(item.payload || '')), 0)
}

function byteLength(value) {
  return new TextEncoder().encode(String(value)).byteLength
}

function tokenPart(request) {
  return (request.headers.get('x-room-token') || 'missing').slice(0, 16)
}

async function clientFingerprint(request) {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'local'
  const ua = request.headers.get('user-agent') || ''
  return sha256Hex(`${ip}:${ua}`).then((value) => value.slice(0, 24))
}

async function sha256Hex(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function publicItems(items) {
  return items.map(publicItem)
}

function publicItem(item) {
  return {
    id: item.id,
    type: 'text',
    iv: item.iv,
    payload: item.payload,
    createdAt: item.createdAt,
    expiresAt: item.expiresAt || 0
  }
}

function isValidItem(item) {
  return (
    item &&
    item.type === 'text' &&
    typeof item.id === 'string' &&
    typeof item.iv === 'string' &&
    typeof item.payload === 'string' &&
    typeof item.createdAt === 'number' &&
    (!item.expiresAt || typeof item.expiresAt === 'number')
  )
}

function roomKey(room) {
  return `room_${room}`
}

function randomRoom(len = 6) {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => chars[byte % chars.length]).join('')
}

function randomSecret(len = 24) {
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  return base64Url(bytes)
}

function base64Url(bytes) {
  let value = ''
  for (const byte of bytes) value += String.fromCharCode(byte)
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers
    }
  })
}

function htmlResponse(html) {
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0'
    }
  })
}

function manifest(origin) {
  return {
    name: 'ClipFerry',
    short_name: 'ClipFerry',
    description: 'Lightweight cross-device clipboard sharing.',
    start_url: origin,
    display: 'standalone',
    background_color: '#faf9f5',
    theme_color: '#faf9f5',
    icons: []
  }
}

function serviceWorker() {
  return `
self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()))
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
`
}

function renderApp({ room, origin }) {
  const roomJson = JSON.stringify(room).replace(/</g, '\\u003c')
  const baseUrl = `${origin}/${room}`

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#faf9f5" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <title>ClipFerry</title>
  <style>
    :root {
      color-scheme: light;
      --canvas: #faf9f5;
      --surface: #f5f0e8;
      --cream-strong: #e8e0d2;
      --ink: #141413;
      --body: #3d3d3a;
      --muted: #6c6a64;
      --line: #e6dfd8;
      --coral: #cc785c;
      --coral-active: #a9583e;
      --dark: #181715;
      --dark-raised: #252320;
      --on-dark: #faf9f5;
      --on-dark-soft: #a09d96;
      --danger: #c64545;
      --success: #5db8a6;
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      min-height: 100%;
      margin: 0;
      background: var(--canvas);
      color: var(--ink);
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 16px;
      line-height: 1.5;
      letter-spacing: 0;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    body {
      padding: 24px;
      padding-left: max(24px, env(safe-area-inset-left));
      padding-right: max(24px, env(safe-area-inset-right));
    }

    button,
    textarea,
    input {
      font: inherit;
    }

    button {
      border: 1px solid var(--line);
      border-radius: 8px;
      min-height: 42px;
      padding: 0 14px;
      color: var(--ink);
      background: var(--canvas);
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0;
    }

    button:hover {
      border-color: var(--cream-strong);
      background: var(--surface);
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }

    .primary {
      background: var(--coral);
      border-color: var(--coral);
      color: #fff;
    }

    .primary:hover {
      background: var(--coral-active);
      border-color: var(--coral-active);
    }

    .app {
      width: min(1120px, 100%);
      margin: 0 auto;
      display: grid;
      gap: 16px;
    }

    .topbar {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
      min-height: 56px;
    }

    .brand,
    .room {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .mark {
      width: 28px;
      height: 28px;
      color: var(--ink);
      display: grid;
      place-items: center;
      font-size: 22px;
      line-height: 1;
    }

    h1,
    h2 {
      margin: 0;
      font-family: "Cormorant Garamond", "EB Garamond", Georgia, serif;
      font-weight: 500;
      letter-spacing: 0;
    }

    h1 {
      font-size: 28px;
      line-height: 1;
    }

    h2 {
      font-size: 22px;
      line-height: 1.15;
    }

    .room-code,
    .status,
    .updated {
      font-size: 13px;
      color: var(--muted);
    }

    .room-code {
      border: 1px solid var(--line);
      background: var(--surface);
      border-radius: 999px;
      padding: 6px 10px;
      color: var(--ink);
      font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-weight: 500;
    }

    .grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 280px;
      gap: 18px;
      align-items: start;
    }

    .workspace {
      display: grid;
      gap: 18px;
      min-width: 0;
    }

    .composer,
    .history,
    .share {
      border: 1px solid var(--line);
      border-radius: 12px;
    }

    .composer,
    .history {
      background: var(--surface);
      padding: 18px;
    }

    .composer {
      display: grid;
      gap: 12px;
    }

    textarea {
      width: 100%;
      min-height: 190px;
      resize: vertical;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 14px;
      color: var(--ink);
      background: var(--canvas);
      line-height: 1.55;
    }

    textarea::placeholder {
      color: var(--muted);
    }

    textarea:focus,
    input:focus {
      outline: 2px solid rgba(204, 120, 92, 0.18);
      border-color: var(--coral);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    .status {
      min-height: 20px;
    }

    .status.error {
      color: var(--danger);
    }

    .share {
      background: var(--dark);
      color: var(--on-dark);
      padding: 16px;
      display: grid;
      gap: 12px;
    }

    .share-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--success);
    }

    .share-room {
      color: var(--on-dark-soft);
      font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 13px;
    }

    .qr {
      width: 168px;
      height: 168px;
      border: 8px solid var(--canvas);
      border-radius: 8px;
      justify-self: center;
      background: var(--canvas);
    }

    .share-link {
      width: 100%;
      border: 1px solid var(--dark-raised);
      border-radius: 8px;
      padding: 10px;
      color: var(--on-dark);
      background: var(--dark-raised);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 13px;
    }

    .share button {
      background: var(--dark-raised);
      border-color: var(--dark-raised);
      color: var(--on-dark);
    }

    .section-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      margin-bottom: 12px;
    }

    .updated {
      white-space: nowrap;
    }

    .items {
      display: grid;
      gap: 10px;
    }

    .item {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 12px;
      display: grid;
      gap: 10px;
      background: var(--canvas);
    }

    .item-text {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      max-height: 180px;
      overflow: auto;
      color: var(--body);
    }

    .item-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      color: var(--muted);
      font-size: 13px;
    }

    .empty {
      border: 1px dashed var(--cream-strong);
      border-radius: 10px;
      color: var(--muted);
      padding: 24px;
      text-align: center;
    }

    @media (max-width: 860px) {
      body {
        padding: 14px;
        padding-left: max(14px, env(safe-area-inset-left));
        padding-right: max(14px, env(safe-area-inset-right));
      }

      .grid {
        grid-template-columns: 1fr;
      }

      .topbar {
        align-items: flex-start;
        flex-direction: column;
      }

      .share {
        order: 2;
      }

      .qr {
        width: 160px;
        height: 160px;
      }
    }

    @media (max-width: 560px) {
      body {
        padding-top: 12px;
      }

      .app {
        gap: 12px;
      }

      .topbar {
        min-height: 0;
        gap: 10px;
      }

      .brand {
        width: auto;
        justify-content: flex-start;
      }

      h1 {
        font-size: 26px;
      }

      .room {
        width: 100%;
        justify-content: space-between;
        gap: 8px;
      }

      .room-code {
        min-width: 0;
        max-width: calc(100% - 104px);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .room button {
        width: auto;
        min-width: 96px;
      }

      .composer,
      .history,
      .share {
        border-radius: 10px;
      }

      .composer,
      .history {
        padding: 12px;
      }

      textarea {
        min-height: 150px;
        max-height: 38vh;
        padding: 12px;
        font-size: 16px;
      }

      .actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }

      #copyLatestButton {
        grid-column: 1 / -1;
      }

      .actions button,
      .share button {
        width: 100%;
        min-height: 44px;
        padding: 0 10px;
      }

      .status {
        min-height: 18px;
        font-size: 13px;
      }

      .share {
        padding: 12px;
        gap: 10px;
      }

      .share-head {
        display: none;
      }

      .qr {
        width: 132px;
        height: 132px;
        border-width: 6px;
      }

      .share-link {
        font-size: 12px;
      }

      .section-head {
        align-items: flex-start;
      }

      h2 {
        font-size: 20px;
      }

      .updated {
        font-size: 12px;
      }

      .item {
        padding: 10px;
      }

      .item-meta {
        align-items: stretch;
        flex-direction: column;
      }
    }
  </style>
</head>
<body>
  <main class="app">
    <header class="topbar">
      <div class="brand">
        <div class="mark">*</div>
        <h1>ClipFerry</h1>
      </div>
      <div class="room">
        <span class="room-code" id="roomCode"></span>
        <button id="newRoomButton" type="button">新房间</button>
      </div>
    </header>

    <section class="grid">
      <div class="workspace">
        <section class="composer">
          <textarea id="textInput" maxlength="${MAX_TEXT_LENGTH}" placeholder="输入或粘贴"></textarea>
          <div class="actions">
            <button class="primary" id="readButton" type="button">读取剪贴板</button>
            <button id="sendButton" type="button">发送</button>
            <button id="copyLatestButton" type="button">复制最新</button>
          </div>
          <div class="status" id="status" aria-live="polite"></div>
        </section>

        <section class="history">
          <div class="section-head">
            <h2>最近内容</h2>
            <span class="updated" id="updated"></span>
          </div>
          <div class="items" id="items"></div>
        </section>
      </div>

      <aside class="share">
        <div class="share-head">
          <span class="dot"></span>
          <span class="share-room">${escapeHtml(room)}</span>
        </div>
        <img class="qr" id="qr" alt="房间二维码" />
        <input class="share-link" id="shareLink" readonly />
        <button id="copyLinkButton" type="button">复制链接</button>
      </aside>
    </section>
  </main>

  <script>
    const room = ${roomJson}
    const baseUrl = ${JSON.stringify(baseUrl)}
    const state = {
      items: [],
      tokenHash: '',
      cryptoKey: null,
      polling: null
    }

    const els = {
      roomCode: document.querySelector('#roomCode'),
      textInput: document.querySelector('#textInput'),
      readButton: document.querySelector('#readButton'),
      sendButton: document.querySelector('#sendButton'),
      copyLatestButton: document.querySelector('#copyLatestButton'),
      copyLinkButton: document.querySelector('#copyLinkButton'),
      newRoomButton: document.querySelector('#newRoomButton'),
      shareLink: document.querySelector('#shareLink'),
      qr: document.querySelector('#qr'),
      items: document.querySelector('#items'),
      status: document.querySelector('#status'),
      updated: document.querySelector('#updated')
    }

    init().catch(() => setStatus('初始化失败。', true))

    async function init() {
      const secret = ensureSecret()
      state.tokenHash = await sha256Hex('token:' + secret)
      state.cryptoKey = await crypto.subtle.importKey(
        'raw',
        await sha256Bytes('key:' + secret),
        'AES-GCM',
        false,
        ['encrypt', 'decrypt']
      )

      const shareUrl = baseUrl + '#' + secret
      els.roomCode.textContent = room
      els.shareLink.value = shareUrl
      els.qr.src = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent(shareUrl)

      els.readButton.addEventListener('click', readClipboardText)
      els.sendButton.addEventListener('click', () => sendText(els.textInput.value))
      els.copyLatestButton.addEventListener('click', copyLatest)
      els.copyLinkButton.addEventListener('click', () => copyText(els.shareLink.value, '链接已复制。'))
      els.newRoomButton.addEventListener('click', () => {
        window.location.href = '/'
      })

      await loadItems(true)
      state.polling = window.setInterval(() => {
        if (!document.hidden) loadItems(true)
      }, ${POLL_INTERVAL_MS})
    }

    function ensureSecret() {
      const current = window.location.hash.replace(/^#/, '')
      if (current.length >= 24) return current
      const secret = randomSecret()
      history.replaceState(null, '', window.location.pathname + '#' + secret)
      return secret
    }

    async function readClipboardText() {
      setBusy('reading')
      setStatus('正在读取剪贴板...')
      try {
        const text = await navigator.clipboard.readText()
        els.textInput.value = text
        setStatus(text ? '已读取文本。' : '剪贴板没有文本。', !text)
      } catch {
        setStatus('请手动粘贴文本。', true)
      } finally {
        setBusy('')
      }
    }

    async function sendText(text) {
      if (!text) {
        setStatus('没有内容。', true)
        return
      }

      setBusy('sending')
      setStatus('正在发送...')
      try {
        const encrypted = await encryptBytes(new TextEncoder().encode(text.slice(0, ${MAX_TEXT_LENGTH})))
        const ok = await sendEncryptedItem({
          type: 'text',
          iv: encrypted.iv,
          payload: encrypted.payload
        })
        if (ok) setStatus('已发送。')
      } catch {
        setStatus('发送失败。', true)
      } finally {
        setBusy('')
      }
    }

    async function sendEncryptedItem(item) {
      const res = await fetch('/api/rooms/' + encodeURIComponent(room) + '/items', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(item)
      })

      if (!res.ok) {
        setStatus('发送失败。', true)
        return false
      }

      const data = await res.json()
      state.items = data.items || []
      await renderItems()
      return true
    }

    async function loadItems(silent = false) {
      try {
        const res = await fetch('/api/rooms/' + encodeURIComponent(room), {
          headers: authHeaders({ Accept: 'application/json' })
        })
        if (!res.ok) throw new Error('load failed')
        const data = await res.json()
        state.items = data.items || []
        await renderItems()
        if (!silent) setStatus('已刷新。')
      } catch {
        setStatus('无法访问。', true)
      }
    }

    async function renderItems() {
      els.updated.textContent = new Date().toLocaleTimeString()

      if (!state.items.length) {
        els.items.innerHTML = '<div class="empty">暂无内容</div>'
        return
      }

      els.items.innerHTML = ''
      for (const item of state.items) {
        els.items.append(await renderItem(item))
      }
    }

    async function renderItem(item) {
      const node = document.createElement('article')
      node.className = 'item'
      const plainText = await decryptText(item)
      item.plainText = plainText

      const text = document.createElement('div')
      text.className = 'item-text'
      text.textContent = plainText
      node.append(text)

      const meta = document.createElement('div')
      meta.className = 'item-meta'

      const time = document.createElement('span')
      time.textContent = formatTime(item.createdAt)

      const copy = document.createElement('button')
      copy.type = 'button'
      copy.textContent = '复制'
      copy.addEventListener('click', () => copyItem(item))

      meta.append(time, copy)
      node.append(meta)
      return node
    }

    async function copyLatest() {
      const latest = state.items[0]
      if (!latest) {
        setStatus('暂无内容。', true)
        return
      }
      await copyItem(latest)
    }

    async function copyItem(item) {
      await copyText(item.plainText || await decryptText(item), '已复制。')
    }

    async function decryptText(item) {
      const bytes = await decryptBytes(item.iv, item.payload)
      return new TextDecoder().decode(bytes)
    }

    async function encryptBytes(bytes) {
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, state.cryptoKey, bytes)
      return {
        iv: bytesToBase64(iv),
        payload: bytesToBase64(new Uint8Array(encrypted))
      }
    }

    async function decryptBytes(iv, payload) {
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToBytes(iv) },
        state.cryptoKey,
        base64ToBytes(payload)
      )
      return new Uint8Array(decrypted)
    }

    async function sha256Hex(value) {
      return bytesToHex(await sha256Bytes(value))
    }

    async function sha256Bytes(value) {
      return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
    }

    function authHeaders(headers = {}) {
      return {
        ...headers,
        'X-Room-Token': state.tokenHash
      }
    }

    async function copyText(text, message) {
      try {
        await navigator.clipboard.writeText(text)
        setStatus(message)
      } catch {
        selectFallbackText(text)
        setStatus('请手动复制。', true)
      }
    }

    function selectFallbackText(text) {
      els.textInput.value = text
      els.textInput.focus()
      els.textInput.select()
    }

    function setBusy(mode) {
      const busy = Boolean(mode)
      els.readButton.disabled = busy
      els.sendButton.disabled = busy
      els.readButton.textContent = mode === 'reading' ? '读取中...' : '读取剪贴板'
      els.sendButton.textContent = mode === 'sending' ? '发送中...' : '发送'
    }

    function setStatus(message, isError = false) {
      els.status.textContent = message
      els.status.classList.toggle('error', isError)
    }

    function formatTime(value) {
      if (!value) return ''
      return new Date(value).toLocaleString()
    }

    function randomSecret() {
      const bytes = crypto.getRandomValues(new Uint8Array(24))
      return bytesToBase64Url(bytes)
    }

    function bytesToHex(bytes) {
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
    }

    function bytesToBase64(bytes) {
      let value = ''
      for (const byte of bytes) value += String.fromCharCode(byte)
      return btoa(value)
    }

    function bytesToBase64Url(bytes) {
      return bytesToBase64(bytes).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/g, '')
    }

    function base64ToBytes(value) {
      const binary = atob(value)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      return bytes
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  </script>
</body>
</html>`
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
