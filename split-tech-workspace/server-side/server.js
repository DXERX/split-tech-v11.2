// splittech-api — Cloud Run API Gateway
// Replaces all 14 Supabase Edge Functions
// Node.js 20 + Express + pg (direct DB) + GoTrue (auth)

const express = require('express')
const { GoogleAuth } = require('google-auth-library')
const { Pool } = require('pg')

const app = express()
app.use(express.json({ limit: '20mb' }))

// ── CORS ──────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = new Set([
  'https://splittech.sa',
  'https://www.splittech.sa',
  'https://app.splittech.sa',
  'https://splittech-api-170306286467.me-central2.run.app',
  'https://splittech-api-impdbmxt6q-wx.a.run.app',
  'http://localhost:5173',
  'http://localhost:4173',
])
const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, apikey, x-split-region, x-supabase-api-version, x-client-info, prefer, range, accept-profile, content-profile, x-retry-count',
  'Access-Control-Allow-Credentials': 'true',
  Vary: 'Origin',
}
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(200).end()
  next()
})

// ── Request ID middleware ─────────────────────────────────────────────────────
app.use((req, res, next) => {
  req.reqId = req.headers['x-request-id'] || crypto.randomUUID()
  res.setHeader('x-request-id', req.reqId)
  next()
})

// ── DB Pool ───────────────────────────────────────────────────────────────────
let pool
function getPool() {
  if (pool) return pool
  pool = new Pool({
    host: process.env.DB_HOST,
    port: 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })
  pool.on('error', (err) => console.error('pg pool error', err))
  return pool
}

// ── Rate Limiter (in-memory per-instance) ────────────────────────────────────
const rlMap = new Map()
function checkRateLimit(key, windowMs, max) {
  const now = Date.now()
  let e = rlMap.get(key)
  if (!e || now > e.resetAt) e = { count: 0, resetAt: now + windowMs }
  e.count++
  rlMap.set(key, e)
  return { allowed: e.count <= max }
}

// ── SMS via Msegat (Saudi Arabia) ─────────────────────────────────────────────
async function sendSMS(phone, message) {
  const username = process.env.SMS_MSEGAT_USERNAME
  const apikey   = process.env.SMS_MSEGAT_API_KEY
  const sender   = process.env.SMS_SENDER_NAME || 'SPLIT'
  if (!username || !apikey) return false

  // Normalize to Saudi international format (9665XXXXXXXX)
  let num = phone.replace(/[\s\-\+\(\)]/g, '')
  if (num.startsWith('00966')) num = num.slice(2)
  if (num.startsWith('966'))   num = num
  else if (num.startsWith('0')) num = '966' + num.slice(1)
  else if (num.startsWith('5')) num = '966' + num

  try {
    const res = await fetch('https://www.msegat.com/gw/sendsms.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userName: username, numbers: num, userSender: sender, apikey, msg: message }),
    })
    const body = await res.text()
    console.log(`[SMS] to=${num} status=${res.status} body=${body.slice(0, 200)}`)
    // Msegat returns "1" on success (plain text or JSON)
    return body.trim() === '1' || body.includes('"code":"1"') || body.includes('"status":"1"')
  } catch (e) {
    console.error('[SMS] error:', e.message)
    return false
  }
}

// ── OTP store — DB-backed so it works across Cloud Run instances ──────────────
async function generateOtpDB(userId, phone) {
  const code = String(Math.floor(100000 + Math.random() * 900000))
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000)
  await getPool().query(
    `INSERT INTO public.otp_codes (user_id, phone, code, expires_at, attempts, last_sent_at)
     VALUES ($1, $2, $3, $4, 0, NOW())
     ON CONFLICT (user_id, phone)
     DO UPDATE SET code = EXCLUDED.code, expires_at = EXCLUDED.expires_at, attempts = 0, created_at = NOW(), last_sent_at = NOW()`,
    [userId, phone, code, expiresAt]
  )
  return code
}

async function checkOtpCooldown(userId, phone) {
  const { rows } = await getPool().query(
    `SELECT last_sent_at FROM public.otp_codes WHERE user_id = $1 AND phone = $2`,
    [userId, phone]
  )
  if (!rows[0]?.last_sent_at) return { allowed: true }
  const elapsed = Date.now() - new Date(rows[0].last_sent_at).getTime()
  const waitMs = 60_000 - elapsed
  if (waitMs > 0) return { allowed: false, waitSeconds: Math.ceil(waitMs / 1000) }
  return { allowed: true }
}
async function verifyOtpDB(userId, phone, code) {
  const db = getPool()
  const { rows } = await db.query(
    `SELECT code, expires_at, attempts FROM public.otp_codes WHERE user_id = $1 AND phone = $2`,
    [userId, phone]
  )
  const entry = rows[0]
  if (!entry) return { valid: false, reason: 'لم يتم إرسال رمز أو انتهت صلاحيته' }
  if (new Date() > new Date(entry.expires_at)) {
    await db.query(`DELETE FROM public.otp_codes WHERE user_id = $1 AND phone = $2`, [userId, phone])
    return { valid: false, reason: 'انتهت صلاحية الرمز' }
  }
  // Atomic increment to prevent race condition on concurrent attempts
  const { rows: incRows } = await db.query(
    `UPDATE public.otp_codes SET attempts = attempts + 1
     WHERE user_id = $1 AND phone = $2
     RETURNING attempts, code`,
    [userId, phone]
  )
  if (!incRows.length) return { valid: false, reason: 'لم يتم إرسال رمز أو انتهت صلاحيته' }
  const attempts = incRows[0].attempts
  const storedCode = incRows[0].code
  if (attempts > 5) {
    await db.query(`DELETE FROM public.otp_codes WHERE user_id = $1 AND phone = $2`, [userId, phone])
    return { valid: false, reason: 'تجاوزت عدد المحاولات المسموح بها' }
  }
  if (storedCode !== String(code)) {
    return { valid: false, reason: `الرمز غير صحيح — المحاولات المتبقية: ${6 - attempts}` }
  }
  await db.query(`DELETE FROM public.otp_codes WHERE user_id = $1 AND phone = $2`, [userId, phone])
  return { valid: true }
}

// Activation brute-force limiter (longer window)
const activationMap = new Map()
function checkActivationLimit(key) {
  const now = Date.now()
  let e = activationMap.get(key) || { count: 0, lockedUntil: null }
  if (e.lockedUntil && now < e.lockedUntil) return { allowed: false, lockedUntil: e.lockedUntil }
  if (e.lockedUntil && now >= e.lockedUntil) e = { count: 0, lockedUntil: null }
  e.count++
  if (e.count > 5) e.lockedUntil = now + 15 * 60_000
  activationMap.set(key, e)
  return { allowed: e.count <= 5, lockedUntil: e.lockedUntil }
}
function resetActivationLimit(key) { activationMap.delete(key) }

// Prevent unbounded memory growth — purge expired entries every 5 min
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of rlMap) if (now > v.resetAt) rlMap.delete(k)
  for (const [k, v] of activationMap) if (!v.lockedUntil && v.count === 0) activationMap.delete(k)
}, 300_000)

// ── Camera password encryption (AES-256-GCM) ─────────────────────────────────
// ENCRYPTION_KEY env var must be a 64-char hex string (32 bytes)
const crypto = require('crypto')
function encryptPassword(plaintext) {
  const key = Buffer.from((process.env.ENCRYPTION_KEY || '').slice(0, 64), 'hex')
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must be a 64-char hex string')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${Buffer.concat([iv, tag, enc]).toString('base64')}`
}
function decryptPassword(stored) {
  if (!stored?.startsWith('v1:')) return stored // legacy plain-text passthrough
  const key = Buffer.from((process.env.ENCRYPTION_KEY || '').slice(0, 64), 'hex')
  const buf = Buffer.from(stored.slice(3), 'base64')
  const iv = buf.slice(0, 12)
  const tag = buf.slice(12, 28)
  const enc = buf.slice(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(enc) + decipher.final('utf8')
}

// ── Email helpers ─────────────────────────────────────────────────────────────
function emailLayout(preheader, content) {
  const APP_URL = process.env.APP_URL || 'https://splittech.sa'
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F3F4F6;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
        <!-- header -->
        <tr>
          <td style="background:#005F2D;border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;">
            <div style="font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">SPLIT Intelligence</div>
            <div style="font-size:12px;color:#86EFAC;margin-top:6px;">سبلت تيك للرقابة التشغيلية</div>
          </td>
        </tr>
        <!-- body -->
        <tr>
          <td style="background:#ffffff;padding:36px 32px;border-radius:0 0 16px 16px;border:1px solid #E5E7EB;border-top:none;">
            ${content}
          </td>
        </tr>
        <!-- footer -->
        <tr>
          <td style="padding:20px 0;text-align:center;">
            <p style="margin:0;color:#9CA3AF;font-size:12px;line-height:2;">
              هذه الرسالة أُرسلت تلقائياً من منصة SPLIT Intelligence<br>
              إذا لم تطلب هذه الرسالة، تجاهلها بأمان<br>
              <a href="${APP_URL}" style="color:#005F2D;text-decoration:none;">splittech.sa</a>
              &nbsp;·&nbsp;
              <a href="mailto:support@splittech.sa" style="color:#005F2D;text-decoration:none;">support@splittech.sa</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

async function sendMail(to, subject, html) {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY not configured')
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'SPLIT Intelligence <noreply@splittech.sa>',
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    }),
  })
  if (!r.ok) {
    const err = await r.text()
    throw new Error(`Resend ${r.status}: ${err}`)
  }
  return r.json()
}

// ── GoTrue auth ───────────────────────────────────────────────────────────────
// GOTRUE_URL = internal IP of splittech-auth-vm, e.g. http://10.10.0.2:9999
const GOTRUE_URL = process.env.GOTRUE_URL

// ── PostgREST ─────────────────────────────────────────────────────────────────
// Internal Cloud Run URL for PostgREST (no public access needed, VPC-internal)
const POSTGREST_URL = process.env.POSTGREST_URL || 'http://10.10.0.2:3000'

// Generic HTTP proxy helper used by both /auth/v1/* and /rest/v1/* routes.
const SKIP_REQ_HEADERS = new Set(['host', 'content-length', 'transfer-encoding', 'connection'])
// نمنع PostgREST/GoTrue من تلويث CORS headers التي ضبطها Express middleware
const SKIP_RES_HEADERS = new Set([
  'transfer-encoding', 'connection', 'content-encoding',
  'access-control-allow-origin',
  'access-control-allow-headers',
  'access-control-allow-methods',
  'access-control-allow-credentials',
  'access-control-expose-headers',
  'access-control-max-age',
])

async function proxyTo(targetBase, stripPrefix, req, res) {
  try {
    const suffix = req.originalUrl.startsWith(stripPrefix)
      ? req.originalUrl.slice(stripPrefix.length) || '/'
      : req.originalUrl

    const url = `${targetBase}${suffix}`
    const headers = {}
    for (const [k, v] of Object.entries(req.headers)) {
      if (!SKIP_REQ_HEADERS.has(k.toLowerCase())) headers[k] = v
    }

    const hasBody = !['GET', 'HEAD'].includes(req.method) && req.body && Object.keys(req.body).length > 0
    if (hasBody) headers['content-type'] = 'application/json'

    const upstream = await fetch(url, {
      method: req.method,
      headers,
      body: hasBody ? JSON.stringify(req.body) : undefined,
    })

    res.status(upstream.status)
    for (const [k, v] of upstream.headers.entries()) {
      if (!SKIP_RES_HEADERS.has(k.toLowerCase())) res.setHeader(k, v)
    }
    // أعد تطبيق CORS headers بعد النسخ لضمان صحتها
    const origin = req.headers.origin
    if (origin && ALLOWED_ORIGINS.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Access-Control-Allow-Credentials', 'true')
    }
    res.send(await upstream.text())
  } catch (err) {
    console.error(`proxy error → ${targetBase}:`, err.message)
    res.status(502).json({ error: 'upstream unavailable' })
  }
}

// ── Vertex AI (ADC via GoogleAuth) ────────────────────────────────────────────
const VERTEX_MODEL = process.env.VERTEX_MODEL || 'gemini-2.5-flash'
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || process.env.GCP_REGION || 'me-central2'
const GCP_PROJECT = process.env.GCP_PROJECT || 'split-tech-492620'
const vertexAuth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' })

async function callVertexGemini(prompt, timeoutMs = 30_000) {
  const GEMINI_KEY = process.env.GEMINI_API_KEY
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not configured')
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini API error ${res.status}: ${err}`)
  }
  const d = await res.json()
  // Gemini 2.5 may include thinking parts — get the last non-thought text
  const parts = d?.candidates?.[0]?.content?.parts || []
  const out = [...parts].reverse().find(p => !p.thought && p.text) || parts[0]
  return out?.text || ''
}

async function verifyToken(token) {
  try {
    const res = await fetch(`${GOTRUE_URL}/user`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// ── DB helpers ────────────────────────────────────────────────────────────────
async function validateApiKey(apiKey) {
  const { rows } = await getPool().query(
    `SELECT store_id, is_active, expires_at FROM public.store_api_keys WHERE api_key = $1`,
    [apiKey]
  )
  return rows[0] || null
}

async function getUserRole(userId) {
  // Primary: direct pg
  try {
    const { rows } = await getPool().query(
      `SELECT role FROM public.user_roles WHERE user_id = $1`,
      [userId]
    )
    if (rows[0]?.role) return rows[0].role
  } catch (_) { /* fall through to PostgREST */ }

  // Fallback: PostgREST with service key (avoids pg password dependency)
  try {
    const svcKey = process.env.GOTRUE_SERVICE_KEY
    if (!svcKey) return null
    const r = await fetch(
      `${POSTGREST_URL}/user_roles?user_id=eq.${userId}&select=role&limit=1`,
      { headers: { Authorization: `Bearer ${svcKey}`, Accept: 'application/json' } }
    )
    if (!r.ok) return null
    const rows = await r.json()
    return rows[0]?.role || null
  } catch (_) { return null }
}

// ── Cloudflare Turnstile server-side validation ───────────────────────────────
async function validateTurnstile(token, ip) {
  const secretKey = process.env.TURNSTILE_SECRET_KEY
  if (!secretKey) return true      // disabled — pass all
  if (!token)     return false     // required when enabled
  try {
    const params = new URLSearchParams({ secret: secretKey, response: token })
    if (ip && ip !== 'unknown') params.append('remoteip', ip)
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: AbortSignal.timeout(5000),
    })
    const d = await r.json()
    if (!d.success) console.warn('[turnstile] rejected:', d['error-codes'])
    return d.success === true
  } catch (e) {
    console.error('[turnstile] validation error:', e?.message)
    return true // fail open on network error — don't block real users
  }
}

// ── Admin audit log helper ────────────────────────────────────────────────────
async function logAdminAction(actorId, actorRole, action, targetType, targetId, details = {}) {
  try {
    await getPool().query(
      `INSERT INTO public.admin_audit_log (actor_id, actor_role, action, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [actorId, actorRole, action, targetType, String(targetId), JSON.stringify(details)]
    )
  } catch (e) {
    console.error('[audit-log] write failed:', e?.message)
  }
}

// ── PostgREST admin helper (service-key bypass — no pg password needed) ──────
let subscriptionsServiceColumnCache = null

async function hasSubscriptionsServiceColumn(db = getPool()) {
  if (subscriptionsServiceColumnCache !== null) return subscriptionsServiceColumnCache

  try {
    const { rows } = await db.query(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'subscriptions'
           AND column_name = 'service'
       ) AS exists`
    )
    subscriptionsServiceColumnCache = Boolean(rows[0]?.exists)
  } catch (_) {
    subscriptionsServiceColumnCache = false
  }

  return subscriptionsServiceColumnCache
}

function inferSubscriptionServiceFromTier(tier) {
  return String(tier || '').startsWith('voice_') ? 'voice' : 'vision'
}

async function pgRest(method, path, body) {
  const svcKey = process.env.GOTRUE_SERVICE_KEY
  const url = `${POSTGREST_URL}${path}`
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${svcKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Prefer: 'return=representation',
    },
  }
  if (body && method !== 'GET') opts.body = JSON.stringify(body)
  const r = await fetch(url, opts)
  const text = await r.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  return { ok: r.ok, status: r.status, data }
}

// ── DB query with PostgREST fallback ─────────────────────────────────────────
async function dbQuery(sql, params) {
  return getPool().query(sql, params)
}

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ ok: true }))

// ── JWT payload decoder (no verification — for role-patching only) ────────────
function parseJwtPayload(token) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString())
  } catch { return null }
}

// ── Supabase-client compatibility: auth + DB proxy ────────────────────────────
// The frontend Supabase JS client sends:
//   /auth/v1/*  → GoTrue at GOTRUE_URL (strips /auth/v1 — GoTrue serves / directly)
//   /rest/v1/*  → PostgREST at POSTGREST_URL (strips the /rest/v1 prefix)
//
// PostgREST problem: GoTrue JWTs have role:"" (empty) so PostgREST falls back to
// the anon role and RLS blocks everything. Fix: when the request carries a valid
// user JWT (has a sub claim), swap it for the service-role key so PostgREST
// operates with full access. The Express layer is the auth boundary — the VM
// PostgREST port is not publicly reachable.
app.all('/auth/v1*', (req, res) => proxyTo(GOTRUE_URL, '/auth/v1', req, res))

// ── analytics_logs — direct DB (bypasses PostgREST entirely) ─────────────────
// يتجاوز PostgREST — يستبعد الأعمدة الكبيرة (صور + YOLO) لضمان حجم استجابة < 1 MB
app.get('/rest/v1/analytics_logs', async (req, res) => {
  try {
    // Belt-and-suspenders CORS — also set in middleware, but repeat to be safe
    const origin = req.headers.origin
    if (origin && ALLOWED_ORIGINS.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Access-Control-Allow-Credentials', 'true')
    }
    res.setHeader('Cache-Control', 'no-cache, no-store')

    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
    const user  = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })

    const db     = getPool()
    const params = []
    const where  = []
    let   p      = 1

    // store_id=eq.UUID
    const storeId = req.query.store_id
    if (storeId?.startsWith('eq.')) {
      where.push(`store_id = $${p++}`)
      params.push(storeId.slice(3))
    }

    // created_at: support gte. / lte. / gt. / lt.
    const createdAt = req.query.created_at
    if (createdAt) {
      if (createdAt.startsWith('gte.')) {
        where.push(`created_at >= $${p++}`); params.push(createdAt.slice(4))
      } else if (createdAt.startsWith('gt.')) {
        where.push(`created_at > $${p++}`); params.push(createdAt.slice(3))
      } else if (createdAt.startsWith('lte.')) {
        where.push(`created_at <= $${p++}`); params.push(createdAt.slice(4))
      } else if (createdAt.startsWith('lt.')) {
        where.push(`created_at < $${p++}`); params.push(createdAt.slice(3))
      }
    }

    // id=eq.UUID
    const idParam = req.query.id
    if (idParam?.startsWith('eq.')) {
      where.push(`id = $${p++}`)
      params.push(idParam.slice(3))
    }

    // order=created_at.desc
    let order = 'created_at DESC'
    if (req.query.order) {
      const parts  = req.query.order.split('.')
      const col    = (parts[0] || 'created_at').replace(/[^a-z_]/gi, '')
      const dir    = (parts[1] || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC'
      order = `${col} ${dir}`
    }

    const limit = Math.min(parseInt(req.query.limit || '100', 10), 200)
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''

    // Excludes: annotated_image_url (base64 ~200KB each), detections_json (YOLO),
    //           result (legacy JSONB, unused by frontend)
    const { rows } = await db.query(
      `SELECT id, store_id, score, status, summary, observations,
              ai_reasoning, confidence_score, client_environment, created_at
       FROM public.analytics_logs ${whereClause} ORDER BY ${order} LIMIT ${limit}`,
      params
    )

    res.json(rows)
  } catch (err) {
    console.error('/rest/v1/analytics_logs error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.all('/rest/v1*', (req, res) => {
  const svcKey = process.env.GOTRUE_SERVICE_KEY
  if (svcKey) {
    const authHeader = req.headers.authorization || ''
    if (authHeader.startsWith('Bearer ')) {
      const payload = parseJwtPayload(authHeader.slice(7))
      // Validate: must have a subject AND not be expired
      const nowSec = Math.floor(Date.now() / 1000)
      if (payload?.sub && payload?.exp && payload.exp > nowSec) {
        req.headers['authorization'] = `Bearer ${svcKey}`
        req.headers['apikey'] = svcKey
      }
    }
  }
  proxyTo(POSTGREST_URL, '/rest/v1', req, res)
})

// GET /v1/my-role — bypasses PostgREST, direct DB query
app.get('/v1/my-role', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })
    const db = getPool()
    const { rows: roleRows } = await db.query(
      `SELECT role FROM public.user_roles WHERE user_id = $1 LIMIT 1`,
      [user.id]
    )
    const { rows: profileRows } = await db.query(
      `SELECT * FROM public.profiles WHERE id = $1 LIMIT 1`,
      [user.id]
    )
    res.json({
      role: roleRows[0]?.role || 'merchant',
      profile: profileRows[0] || null,
    })
  } catch (err) {
    console.error('my-role error:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /v1/my-store — bypasses PostgREST, direct DB query
app.get('/v1/my-store', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })
    const db = getPool()
    const { rows } = await db.query(
      `SELECT * FROM public.stores WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [user.id]
    )
    res.json({ store: rows[0] || null })
  } catch (err) {
    console.error('my-store error:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── Multi-Branch Endpoints ────────────────────────────────────────────────────

// GET /v1/my-stores — returns ALL stores for the user (multi-branch)
app.get('/v1/my-stores', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })
    const db = getPool()
    const { rows } = await db.query(
      `SELECT s.*, bg.name AS branch_group_name
       FROM public.stores s
       LEFT JOIN public.branch_groups bg ON bg.id = s.branch_group_id
       WHERE s.user_id = $1
       ORDER BY s.branch_order ASC, s.created_at ASC`,
      [user.id]
    )
    res.json({ stores: rows })
  } catch (err) {
    console.error('my-stores error:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /v1/branch-groups — returns all branch groups for the user
app.get('/v1/branch-groups', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })
    const db = getPool()
    const { rows } = await db.query(
      `SELECT bg.*, COUNT(s.id)::int AS branch_count
       FROM public.branch_groups bg
       LEFT JOIN public.stores s ON s.branch_group_id = bg.id
       WHERE bg.user_id = $1
       GROUP BY bg.id
       ORDER BY bg.created_at ASC`,
      [user.id]
    )
    res.json({ groups: rows })
  } catch (err) {
    console.error('branch-groups error:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /v1/branch-groups — create a new branch group
app.post('/v1/branch-groups', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })
    const { name, description } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' })
    const db = getPool()
    // Check subscription tier — only Pro+ can have groups
    const { rows: subRows } = await db.query(
      `SELECT tier FROM public.subscriptions
       WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [user.id]
    )
    const tier = subRows[0]?.tier || 'basic'
    if (tier === 'basic') {
      return res.status(403).json({ error: 'branch_groups_require_pro', tier })
    }
    const { rows } = await db.query(
      `INSERT INTO public.branch_groups (user_id, name, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [user.id, name.trim(), description?.trim() || null]
    )
    res.status(201).json({ group: rows[0] })
  } catch (err) {
    console.error('create branch-group error:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// PATCH /v1/branches/:storeId — update branch metadata (name, order, city, group)
app.patch('/v1/branches/:storeId', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })
    const { storeId } = req.params
    const { branch_name, branch_order, city, branch_group_id } = req.body
    const db = getPool()
    // Verify ownership
    const { rows: own } = await db.query(
      `SELECT id FROM public.stores WHERE id = $1 AND user_id = $2`,
      [storeId, user.id]
    )
    if (!own.length) return res.status(404).json({ error: 'Store not found' })
    const { rows } = await db.query(
      `UPDATE public.stores
       SET branch_name  = COALESCE($1, branch_name),
           branch_order = COALESCE($2, branch_order),
           city         = COALESCE($3, city),
           branch_group_id = COALESCE($4, branch_group_id)
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [branch_name ?? null, branch_order ?? null, city ?? null, branch_group_id ?? null, storeId, user.id]
    )
    res.json({ store: rows[0] })
  } catch (err) {
    console.error('patch branch error:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /v1/branch-comparison — score + status comparison across all branches
app.get('/v1/branch-comparison', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })
    const db = getPool()
    // Fetch all stores for the user
    const { rows: stores } = await db.query(
      `SELECT s.id, s.name AS store_name, s.branch_name, s.city, s.branch_order,
              s.store_status AS status, s.branch_group_id,
              bg.name AS group_name
       FROM public.stores s
       LEFT JOIN public.branch_groups bg ON bg.id = s.branch_group_id
       WHERE s.user_id = $1
       ORDER BY s.branch_order ASC, s.created_at ASC`,
      [user.id]
    )
    if (!stores.length) return res.json({ branches: [] })

    const storeIds = stores.map(s => s.id)

    // Latest audit score per store
    const { rows: audits } = await db.query(
      `SELECT DISTINCT ON (store_id)
              store_id, score, status AS audit_status, created_at AS last_audit_at
       FROM public.analytics_logs
       WHERE store_id = ANY($1)
       ORDER BY store_id, created_at DESC`,
      [storeIds]
    )

    // 7-day audit count per store
    const { rows: counts } = await db.query(
      `SELECT store_id, COUNT(*)::int AS audits_7d
       FROM public.analytics_logs
       WHERE store_id = ANY($1) AND created_at >= NOW() - INTERVAL '7 days'
       GROUP BY store_id`,
      [storeIds]
    )

    const auditMap = Object.fromEntries(audits.map(a => [a.store_id, a]))
    const countMap = Object.fromEntries(counts.map(c => [c.store_id, c.audits_7d]))

    const branches = stores.map(s => {
      const audit = auditMap[s.id] || {}
      return {
        id: s.id,
        store_name: s.store_name,  // already aliased to s.name above
        branch_name: s.branch_name || s.store_name,
        city: s.city,
        branch_order: s.branch_order,
        status: s.status,
        group_name: s.group_name,
        score: audit.score ?? null,
        audit_status: audit.audit_status ?? null,
        last_audit_at: audit.last_audit_at ?? null,
        audits_7d: countMap[s.id] ?? 0,
      }
    })

    // Sort by score descending (nulls last)
    branches.sort((a, b) => {
      if (a.score === null && b.score === null) return 0
      if (a.score === null) return 1
      if (b.score === null) return -1
      return b.score - a.score
    })

    res.json({ branches })
  } catch (err) {
    console.error('branch-comparison error:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /v1/analytics/summary — merchant analytics: trend + breakdown + heatmap
// Query: ?period=7d|30d|90d&store_id=<uuid>  (store_id optional, defaults to first store)
app.get('/v1/analytics/summary', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })

    const period  = ['7d', '30d', '90d'].includes(req.query.period) ? req.query.period : '30d'
    const days    = period === '7d' ? 7 : period === '30d' ? 30 : 90
    const db      = getPool()

    // Resolve store_id
    let storeId = req.query.store_id || null
    if (!storeId) {
      const { rows: sr } = await db.query(
        `SELECT id FROM public.stores WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1`,
        [user.id]
      )
      storeId = sr[0]?.id
    }
    if (!storeId) return res.json({ daily: [], totals: {}, heatmap: [] })

    // Verify ownership
    const { rows: own } = await db.query(
      `SELECT id FROM public.stores WHERE id = $1 AND user_id = $2`, [storeId, user.id]
    )
    if (!own.length) return res.status(403).json({ error: 'Forbidden' })

    const since = new Date(Date.now() - days * 86_400_000).toISOString()

    // Daily aggregation
    const { rows: daily } = await db.query(
      `SELECT
         date_trunc('day', created_at AT TIME ZONE 'Asia/Riyadh')::date AS day,
         COUNT(*)::int                                                    AS total,
         ROUND(AVG(score))::int                                           AS avg_score,
         COUNT(*) FILTER (WHERE status = 'pass')::int                    AS pass,
         COUNT(*) FILTER (WHERE status IN ('warning','warn'))::int       AS warn,
         COUNT(*) FILTER (WHERE status = 'fail')::int                    AS fail
       FROM public.analytics_logs
       WHERE store_id = $1 AND created_at >= $2
       GROUP BY 1
       ORDER BY 1 ASC`,
      [storeId, since]
    )

    // Overall totals for the period
    const { rows: totalsRows } = await db.query(
      `SELECT
         COUNT(*)::int                                                AS total,
         ROUND(AVG(score))::int                                       AS avg_score,
         MAX(score)::int                                              AS best_score,
         MIN(score)::int                                              AS worst_score,
         COUNT(*) FILTER (WHERE status = 'pass')::int                AS pass,
         COUNT(*) FILTER (WHERE status IN ('warning','warn'))::int   AS warn,
         COUNT(*) FILTER (WHERE status = 'fail')::int                AS fail
       FROM public.analytics_logs
       WHERE store_id = $1 AND created_at >= $2`,
      [storeId, since]
    )

    // Hourly heatmap (hour 0-23 × day-of-week 0-6)
    const { rows: heatmap } = await db.query(
      `SELECT
         EXTRACT(DOW  FROM created_at AT TIME ZONE 'Asia/Riyadh')::int AS dow,
         EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Riyadh')::int AS hour,
         COUNT(*)::int                                                   AS count,
         ROUND(AVG(score))::int                                          AS avg_score
       FROM public.analytics_logs
       WHERE store_id = $1 AND created_at >= $2
       GROUP BY 1, 2
       ORDER BY 1, 2`,
      [storeId, since]
    )

    // Recent 5 audits (for "latest" panel)
    const { rows: recent } = await db.query(
      `SELECT id, score, status, created_at, observations
       FROM public.analytics_logs
       WHERE store_id = $1
       ORDER BY created_at DESC LIMIT 5`,
      [storeId]
    )

    res.json({
      daily,
      totals: totalsRows[0] || {},
      heatmap,
      recent,
      period,
      store_id: storeId,
    })
  } catch (err) {
    console.error('analytics/summary error:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /v1/my-subscription — returns latest subscription (backwards compat)
app.get('/v1/my-subscription', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })
    const db = getPool()
    const hasServiceColumn = await hasSubscriptionsServiceColumn(db)
    // Return most recent active subscription, or latest overall
    const { rows } = await db.query(
      `SELECT * FROM public.subscriptions
       WHERE user_id = $1
       ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, created_at DESC
       LIMIT 1`,
      [user.id]
    )
    if (rows[0] && hasServiceColumn) {
      rows[0].service = rows[0].service || inferSubscriptionServiceFromTier(rows[0].tier)
    }
    res.json({ subscription: rows[0] || null })
  } catch (err) {
    console.error('my-subscription error:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /v1/my-subscriptions — returns all user subscriptions keyed by service
// Response: { vision: Subscription|null, voice: Subscription|null }
app.get('/v1/my-subscriptions', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })
    const db = getPool()
    const hasServiceColumn = await hasSubscriptionsServiceColumn(db)
    const { rows } = await db.query(
      `SELECT * FROM public.subscriptions
       WHERE user_id = $1
       ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, created_at DESC`,
      [user.id]
    )
    rows.forEach(r => {
      r.service = r.service || inferSubscriptionServiceFromTier(r.tier)
    })
    const vision = rows.find(r => r.service === 'vision') || null
    const voice  = rows.find(r => r.service === 'voice')  || null
    res.json({ vision, voice, all: rows })
  } catch (err) {
    console.error('my-subscriptions error:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /v1/cron/expire-subscriptions — mark expired subscriptions + send reminder emails
// Called by Cloud Scheduler daily. Secured by a shared cron secret.
app.post('/v1/cron/expire-subscriptions', async (req, res) => {
  const cronSecret = process.env.CRON_SECRET
  const incoming   = req.headers['x-cron-secret'] || req.body?.cron_secret
  if (cronSecret && incoming !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  try {
    const db = getPool()
    // 1. Mark overdue active subscriptions as expired
    const { rows: expired } = await db.query(
      `UPDATE public.subscriptions
          SET status = 'expired', updated_at = NOW()
        WHERE status = 'active'
          AND end_date IS NOT NULL
          AND end_date < CURRENT_DATE
        RETURNING id, user_id, tier, service`
    )
    // Deactivate their API keys
    if (expired.length > 0) {
      const ids = expired.map(r => r.id)
      await db.query(
        `UPDATE public.store_api_keys sak
            SET is_active = FALSE, updated_at = NOW()
           FROM public.stores st
          WHERE st.id = sak.store_id
            AND st.subscription_id = ANY($1::uuid[])`,
        [ids]
      )
      // Send expiry notification emails
      for (const sub of expired) {
        try {
          const { rows: uRows } = await db.query(
            `SELECT u.email, p.full_name FROM auth.users u
             LEFT JOIN public.profiles p ON p.id = u.id
             WHERE u.id = $1`, [sub.user_id]
          )
          if (!uRows[0]?.email) continue
          const svcLabel = (sub.service || inferSubscriptionServiceFromTier(sub.tier)) === 'voice' ? 'Voice' : 'Vision'
          await sendMail(
            uRows[0].email,
            'انتهى اشتراكك في ذكاء سبلت',
            emailLayout(
              'انتهى اشتراكك',
              `<h2 style="color:#1F2937;font-size:20px;font-weight:700;margin:0 0 8px;">انتهت صلاحية اشتراكك</h2>
               <p style="color:#6B7280;font-size:14px;margin:0 0 20px;">عزيزي ${uRows[0].full_name || ''}، انتهى اشتراكك في SPLIT ${svcLabel}.</p>
               <a href="${process.env.APP_URL || 'https://splittech.sa'}/dashboard/billing"
                  style="display:inline-block;background:#84A90E;color:#fff;padding:12px 28px;border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;">
                 جدد اشتراكك الآن
               </a>`
            )
          )
        } catch (_) {}
      }
    }

    // 2. Send 7-day reminder to subscriptions expiring in exactly 7 days
    const { rows: in7 } = await db.query(
      `SELECT s.id, s.user_id, s.tier, s.service, s.end_date
         FROM public.subscriptions s
        WHERE s.status = 'active'
          AND s.end_date::date = (CURRENT_DATE + interval '7 days')::date`
    )
    for (const sub of in7) {
      try {
        const { rows: uRows } = await db.query(
          `SELECT u.email, p.full_name FROM auth.users u
           LEFT JOIN public.profiles p ON p.id = u.id
           WHERE u.id = $1`, [sub.user_id]
        )
        if (!uRows[0]?.email) continue
        const svcLabel = (sub.service || inferSubscriptionServiceFromTier(sub.tier)) === 'voice' ? 'Voice' : 'Vision'
        const endDate  = new Date(sub.end_date).toLocaleDateString('ar-SA')
        await sendMail(
          uRows[0].email,
          'تذكير: اشتراكك ينتهي خلال 7 أيام',
          emailLayout(
            'اشتراكك ينتهي قريباً',
            `<h2 style="color:#1F2937;font-size:20px;font-weight:700;margin:0 0 8px;">اشتراكك ينتهي خلال 7 أيام</h2>
             <p style="color:#6B7280;font-size:14px;margin:0 0 8px;">عزيزي ${uRows[0].full_name || ''}، اشتراكك في SPLIT ${svcLabel} ينتهي في <strong>${endDate}</strong>.</p>
             <p style="color:#6B7280;font-size:14px;margin:0 0 20px;">جدد الآن لضمان استمرارية الخدمة.</p>
             <a href="${process.env.APP_URL || 'https://splittech.sa'}/dashboard/billing"
                style="display:inline-block;background:#84A90E;color:#fff;padding:12px 28px;border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;">
               جدد اشتراكك
             </a>`
          )
        )
      } catch (_) {}
    }

    // 3. Send 1-day reminder
    const { rows: in1 } = await db.query(
      `SELECT s.id, s.user_id, s.tier, s.service, s.end_date
         FROM public.subscriptions s
        WHERE s.status = 'active'
          AND s.end_date::date = (CURRENT_DATE + interval '1 day')::date`
    )
    for (const sub of in1) {
      try {
        const { rows: uRows } = await db.query(
          `SELECT u.email, p.full_name FROM auth.users u
           LEFT JOIN public.profiles p ON p.id = u.id
           WHERE u.id = $1`, [sub.user_id]
        )
        if (!uRows[0]?.email) continue
        const svcLabel = (sub.service || inferSubscriptionServiceFromTier(sub.tier)) === 'voice' ? 'Voice' : 'Vision'
        await sendMail(
          uRows[0].email,
          '⚠️ اشتراكك ينتهي غداً!',
          emailLayout(
            'اشتراكك ينتهي غداً',
            `<h2 style="color:#DC2626;font-size:20px;font-weight:700;margin:0 0 8px;">تنبيه: اشتراكك ينتهي غداً</h2>
             <p style="color:#6B7280;font-size:14px;margin:0 0 20px;">عزيزي ${uRows[0].full_name || ''}، اشتراكك في SPLIT ${svcLabel} سينتهي خلال 24 ساعة. جدد الآن لتجنب انقطاع الخدمة.</p>
             <a href="${process.env.APP_URL || 'https://splittech.sa'}/dashboard/billing"
                style="display:inline-block;background:#DC2626;color:#fff;padding:12px 28px;border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;">
               جدد الآن
             </a>`
          )
        )
      } catch (_) {}
    }

    res.json({
      expired: expired.length,
      reminded_7d: in7.length,
      reminded_1d: in1.length,
    })
  } catch (err) {
    console.error('cron/expire-subscriptions error:', err)
    res.status(500).json({ error: err.message })
  }
})

// /verify → GoTrue password-reset / email-confirm links land here
app.get('/verify', async (req, res) => {
  try {
    const qs = new URLSearchParams(req.query).toString()
    const upstream = await fetch(`${GOTRUE_URL}/verify?${qs}`, { redirect: 'manual' })
    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get('location')
      if (location) return res.redirect(upstream.status, location)
    }
    res.status(upstream.status).send(await upstream.text())
  } catch (err) {
    console.error('verify proxy error:', err.message)
    res.status(502).json({ error: 'upstream unavailable' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/engine-heartbeat
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/engine-heartbeat', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.headers['apikey']
    if (!apiKey) return res.status(401).json({ error: 'مفتاح API مطلوب' })

    const rl = checkRateLimit(`hb:${apiKey}`, 60_000, 60)
    if (!rl.allowed) return res.status(429).json({ error: 'Rate limit exceeded' })

    const keyRecord = await validateApiKey(apiKey)
    if (!keyRecord?.is_active) return res.status(401).json({ error: 'مفتاح API غير صحيح أو غير نشط' })
    if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date())
      return res.status(403).json({ error: 'الترخيص منتهي الصلاحية' })

    const { store_id, current_status = 'active', cpu_usage, memory_usage, engine_version, os_info, last_audit_id } = req.body
    if (store_id && store_id !== keyRecord.store_id)
      return res.status(403).json({ error: 'store_id غير متطابق مع مفتاح API' })

    const storeId = keyRecord.store_id
    const db = getPool()

    await Promise.allSettled([
      db.query(
        `INSERT INTO public.engine_heartbeats (store_id, status, cpu_usage, memory_usage, engine_version, os_info, last_audit_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [storeId, current_status,
         cpu_usage != null ? parseFloat(cpu_usage) : null,
         memory_usage != null ? parseFloat(memory_usage) : null,
         engine_version || null, os_info || null, last_audit_id || null]
      ),
      db.query(`UPDATE public.stores SET last_heartbeat = NOW() WHERE id = $1`, [storeId]),
      db.query(
        `DELETE FROM public.engine_heartbeats WHERE id IN (
           SELECT id FROM public.engine_heartbeats WHERE store_id = $1
           ORDER BY created_at DESC OFFSET 100
         )`, [storeId]
      ),
    ])

    res.json({ success: true, timestamp: new Date().toISOString() })
  } catch (err) {
    console.error('engine-heartbeat error:', err)
    res.status(500).json({ error: 'خطأ داخلي' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/activate
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/activate', async (req, res) => {
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown'

  const ipLimit = checkActivationLimit(clientIp)
  if (!ipLimit.allowed) {
    const waitMin = Math.ceil(((ipLimit.lockedUntil ?? 0) - Date.now()) / 60_000)
    return res.status(429).json({ error: `تم إيقاف المحاولات مؤقتاً. حاول مجدداً بعد ${waitMin} دقيقة.` })
  }

  try {
    const { license_key, machine_fingerprint, platform = 'electron' } = req.body
    if (!license_key) return res.status(400).json({ error: 'license_key مطلوب' })

    const cleanKey = String(license_key).toUpperCase().trim()
    const keyLimit = checkActivationLimit(`key:${cleanKey}`)
    if (!keyLimit.allowed) return res.status(429).json({ error: 'عدد كبير من محاولات التفعيل. حاول لاحقاً.' })

    const db = getPool()
    const { rows } = await db.query(`
      SELECT sak.id, sak.store_id, sak.api_key, sak.is_active, sak.expires_at,
             sak.activated_at, sak.machine_fingerprint,
             s.name AS s_name, s.store_status,
             s.rtsp_url, s.camera_ip, s.camera_username,
             s.working_hours, s.custom_questions, s.interval_minutes,
             sub.id AS sub_id, sub.status AS sub_status, sub.tier, sub.end_date
      FROM public.store_api_keys sak
      JOIN public.stores s ON s.id = sak.store_id
      LEFT JOIN public.subscriptions sub ON sub.id = s.subscription_id
      WHERE sak.license_key = $1
    `, [cleanKey])

    const r = rows[0]
    if (!r) return res.status(404).json({ error: 'رمز الترخيص غير صحيح أو غير موجود' })
    if (!r.is_active) return res.status(403).json({ error: 'رمز الترخيص موقوف. تواصل مع الدعم الفني.' })
    if (r.expires_at && new Date(r.expires_at) < new Date())
      return res.status(403).json({ error: 'رمز الترخيص منتهي الصلاحية.' })
    if (r.store_status !== 'active')
      return res.status(403).json({ error: 'المتجر غير نشط. تواصل مع الإدارة.' })
    if (!r.sub_id || r.sub_status !== 'active')
      return res.status(403).json({ error: 'الاشتراك غير نشط أو منتهي الصلاحية.' })

    const storedFp = r.machine_fingerprint
    const incomingFp = machine_fingerprint || null

    if (storedFp && incomingFp && storedFp !== incomingFp) {
      db.query(
        `INSERT INTO public.system_logs (store_id, log_level, source, message, metadata)
         VALUES ($1, 'warning', 'v1-activate', $2, $3)`,
        [r.store_id, `تم رفض التفعيل: fingerprint مختلف للمتجر ${r.s_name}`,
         JSON.stringify({ platform, ip: clientIp })]
      ).catch(() => {})
      return res.status(403).json({ error: 'تم ربط هذا الترخيص بجهاز مختلف. أنشئ تذكرة دعم لنقل الترخيص.', code: 'FINGERPRINT_MISMATCH' })
    }

    await db.query(
      `UPDATE public.store_api_keys SET activated_at = NOW(), machine_fingerprint = COALESCE($1, machine_fingerprint) WHERE id = $2`,
      [incomingFp, r.id]
    )

    db.query(
      `INSERT INTO public.system_logs (store_id, log_level, source, message, metadata)
       VALUES ($1, 'info', 'v1-activate', $2, $3)`,
      [r.store_id, `تم تفعيل الترخيص للمتجر: ${r.s_name} (${platform})`,
       JSON.stringify({ platform, ip: clientIp, first_activation: !storedFp })]
    ).catch(() => {})

    resetActivationLimit(clientIp)
    resetActivationLimit(`key:${cleanKey}`)

    res.json({
      success: true,
      api_key: r.api_key,
      store_id: r.store_id,
      store_name: r.s_name,
      expiry_date: r.end_date,
      tier: r.tier,
      // Camera settings — locked after admin approval, written locally by Electron
      rtsp_url: r.rtsp_url || null,
      camera_ip: r.camera_ip || null,
      camera_username: r.camera_username || null,
      // Operational config
      working_hours: r.working_hours || { start: 17, end: 5 },
      custom_questions: r.custom_questions || [],
      message: `مرحباً! تم تفعيل ${r.s_name} بنجاح.`,
    })
  } catch (err) {
    console.error('activate error:', err)
    res.status(500).json({ error: 'خطأ داخلي في الخادم', code: 'ACTIVATE_INTERNAL' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/ingest-audit
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/ingest-audit', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.headers['apikey']
    if (!apiKey) return res.status(401).json({ error: 'مفتاح API مطلوب' })

    const keyRecord = await validateApiKey(apiKey)
    if (!keyRecord?.is_active) return res.status(401).json({ error: 'مفتاح API غير صحيح أو غير نشط' })
    if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date())
      return res.status(403).json({ error: 'الترخيص منتهي الصلاحية. جدد اشتراكك.' })

    const storeId = keyRecord.store_id
    const rl = checkRateLimit(`ingest:${storeId}`, 60_000, 20)
    if (!rl.allowed) return res.status(429).json({ error: 'تجاوزت الحد المسموح (20 طلب/دقيقة)' })

    const body = req.body
    const db = getPool()

    if (body.type === 'reset_command') {
      await db.query(`UPDATE public.stores SET remote_command = 'run' WHERE id = $1`, [storeId])
      return res.json({ success: true, message: 'تم إعادة ضبط الأمر' })
    }

    if (body.type === 'camera_failure') {
      await db.query(
        `INSERT INTO public.security_alerts (store_id, alert_type, severity, message, metadata)
         VALUES ($1, 'camera_failure', 'high', $2, $3)`,
        [storeId, body.message || 'عطل في الكاميرا', JSON.stringify(body.metadata || {})]
      )
      return res.json({ success: true })
    }

    const audits = Array.isArray(body) ? body : [body]
    if (audits.length === 0) return res.status(400).json({ error: 'لا توجد بيانات' })
    if (audits.length > 50) return res.status(400).json({ error: 'الحد الأقصى 50 سجل لكل طلب' })

    const inserted = []
    for (const audit of audits) {
      // score: INTEGER 0-100
      const score = audit.score != null
        ? Math.min(100, Math.max(0, Math.round(Number(audit.score) || 0)))
        : null
      // confidence_score: DECIMAL(3,2) — DB expects 0.00→1.00
      // AI returns 0-100 scale, so divide by 100
      const rawConf = Number(audit.confidence_score)
      const confidenceScore = !isNaN(rawConf) && audit.confidence_score != null
        ? Math.min(1.0, Math.max(0, Math.round(rawConf) / 100))
        : null
      // Normalise status — Gemini may return 'review' but DB constraint only allows 'pass','warning','fail'
      const rawStatus = audit.status || (score >= 70 ? 'pass' : score >= 50 ? 'warning' : 'fail')
      const STATUS_MAP = { review: 'warning', caution: 'warning', moderate: 'warning' }
      const status = STATUS_MAP[rawStatus] || (['pass','warning','fail'].includes(rawStatus) ? rawStatus : (score >= 70 ? 'pass' : score >= 50 ? 'warning' : 'fail'))
      // ── صورة YOLO المُعلَّمة — تُخزَّن كـ data URL مباشرة في DB ──────────────
      const annotatedImageUrl = buildAnnotatedImageDataUrl(audit.annotated_image_b64 || null)

      // V11: store tracking_data + question_answers in the `result` JSONB column
      const resultPayload = audit.tracking_data
        ? { tracking_data: audit.tracking_data, question_answers: audit.question_answers || [] }
        : (audit.result || {})

      const { rows } = await db.query(
        `INSERT INTO public.analytics_logs
           (store_id, score, status, summary, result, observations, ai_reasoning,
            confidence_score, client_environment, annotated_image_url, detections_json)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id, score, status`,
        [storeId, score, status, audit.summary || null,
         JSON.stringify(resultPayload), JSON.stringify(audit.observations || []),
         audit.ai_reasoning || null, confidenceScore,
         JSON.stringify(audit.client_environment || {}),
         annotatedImageUrl,
         audit.detections_json ? JSON.stringify(audit.detections_json) : null]
      )
      inserted.push(rows[0])

      // Fire webhook (fire-and-forget, non-blocking)
      const auditEvent = rows[0].status === 'fail' ? 'audit_fail'
                       : rows[0].status === 'warning' ? 'audit_warning'
                       : 'audit_complete'
      fireWebhook(storeId, auditEvent, {
        audit_id: rows[0].id,
        score:    rows[0].score,
        status:   rows[0].status,
      }).catch(() => {})
      // Always fire audit_complete regardless of status
      if (auditEvent !== 'audit_complete') {
        fireWebhook(storeId, 'audit_complete', {
          audit_id: rows[0].id,
          score:    rows[0].score,
          status:   rows[0].status,
        }).catch(() => {})
      }
    }

    const scored = audits.filter(a => a.score != null)
    if (scored.length > 0) {
      const avg = scored.reduce((s, a) => s + a.score, 0) / scored.length
      if (avg < 50) {
        db.query(
          `INSERT INTO public.security_alerts (store_id, alert_type, severity, message, metadata)
           VALUES ($1, 'low_audit_score', $2, $3, $4)`,
          [storeId, avg < 30 ? 'critical' : 'high',
           `متوسط نتيجة التدقيق منخفض: ${Math.round(avg)}%`,
           JSON.stringify({ avg_score: avg, records: audits.length })]
        ).catch(() => {})
      }
    }

    res.status(201).json({ success: true, inserted: inserted.length, ids: inserted.map(r => r.id) })
  } catch (err) {
    console.error('ingest-audit error:', err)
    res.status(500).json({ error: 'خطأ داخلي في الخادم' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// ── Multi-camera tier limits ──────────────────────────────────────────────────
const TIER_MAX_CAMERAS = { basic: 1, pro: 3, enterprise: 6 }

// ── Auto-migration: add multi-camera columns if missing ───────────────────────
async function ensureMultiCameraColumns(db) {
  try {
    await db.query(`
      ALTER TABLE public.stores
        ADD COLUMN IF NOT EXISTS cameras      JSONB    DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS zone_configs JSONB    DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS staff_count  INTEGER  DEFAULT 0,
        ADD COLUMN IF NOT EXISTS store_type   TEXT     DEFAULT 'retail'
    `)
  } catch (e) {
    // Non-fatal — columns may already exist or insufficient privilege
    console.warn('multi-camera migration skipped:', e.message)
  }
}

async function ensureBusinessProfileTables(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS public.store_business_profiles (
      store_id UUID PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
      business_type VARCHAR(50) NOT NULL DEFAULT 'retail',
      target_classes INT[] NOT NULL DEFAULT ARRAY[0],
      features JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await db.query(`
    CREATE TABLE IF NOT EXISTS public.store_cameras (
      id SERIAL PRIMARY KEY,
      store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
      camera_id VARCHAR(50) NOT NULL,
      name VARCHAR(100),
      rtsp_url TEXT,
      is_door BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(store_id, camera_id)
    )
  `)
  await db.query(`
    CREATE TABLE IF NOT EXISTS public.store_zones (
      id SERIAL PRIMARY KEY,
      store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
      camera_id VARCHAR(50) NOT NULL,
      config_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(store_id, camera_id)
    )
  `)
  await db.query(`
    CREATE TABLE IF NOT EXISTS public.store_snapshots (
      id          SERIAL PRIMARY KEY,
      store_id    UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
      camera_id   VARCHAR(100) NOT NULL DEFAULT 'camera_01',
      snapshot_b64 TEXT NOT NULL,
      captured_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS store_snapshots_store_camera_idx
    ON public.store_snapshots(store_id, camera_id)
  `)
  console.log('[migration] business profile tables ensured')
}

// POST /v1/store/snapshot — engine pushes a camera frame (x-api-key auth)
app.post('/v1/store/snapshot', async (req, res) => {
  try {
    const { store_id, camera_id = 'camera_01', snapshot_b64 } = req.body
    if (!store_id || !snapshot_b64) {
      return res.status(400).json({ error: 'store_id and snapshot_b64 required' })
    }
    // Verify store exists via api_key header
    const apiKey = req.headers['x-api-key']
    if (!apiKey) return res.status(401).json({ error: 'x-api-key required' })

    const db = getPool()
    const storeRes = await db.query(
      `SELECT id FROM public.stores WHERE id = $1`,
      [store_id]
    )
    if (storeRes.rows.length === 0) return res.status(403).json({ error: 'store not found' })

    // Verify api_key belongs to this store
    const keyRes = await db.query(
      `SELECT id FROM public.store_api_keys WHERE store_id = $1 AND api_key = $2 AND is_active = true`,
      [store_id, apiKey]
    )
    if (keyRes.rows.length === 0) return res.status(403).json({ error: 'forbidden' })

    await db.query(`
      INSERT INTO public.store_snapshots (store_id, camera_id, snapshot_b64, captured_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (store_id, camera_id) DO UPDATE
        SET snapshot_b64 = EXCLUDED.snapshot_b64,
            captured_at  = NOW()
    `, [store_id, camera_id, snapshot_b64])

    res.json({ ok: true })
  } catch (err) {
    console.error('[snapshot] push error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// GET /v1/camera-snapshot/:store_id — frontend fetches latest frame for zone config
app.get('/v1/camera-snapshot/:store_id', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
    const user  = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })

    const { store_id } = req.params
    const camera_id = req.query.camera_id || 'camera_01'

    const db = getPool()

    // Verify user owns this store
    const storeCheck = await db.query(
      `SELECT id FROM public.stores WHERE id = $1 AND user_id = $2`,
      [store_id, user.id]
    )
    if (storeCheck.rows.length === 0) {
      return res.status(403).json({ error: 'forbidden' })
    }

    const result = await db.query(
      `SELECT snapshot_b64, captured_at FROM public.store_snapshots
       WHERE store_id = $1 AND camera_id = $2
       ORDER BY captured_at DESC LIMIT 1`,
      [store_id, camera_id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'no snapshot available yet' })
    }

    const { snapshot_b64, captured_at } = result.rows[0]
    const buf = Buffer.from(snapshot_b64, 'base64')
    res.set({
      'Content-Type': 'image/jpeg',
      'Content-Length': buf.length,
      'X-Snapshot-Age': Math.round((Date.now() - new Date(captured_at).getTime()) / 1000) + 's',
      'Cache-Control': 'no-cache',
    })
    res.send(buf)
  } catch (err) {
    console.error('[snapshot] fetch error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /v1/pre-onboarding/calculate-tier
app.post('/v1/pre-onboarding/calculate-tier', async (req, res) => {
  try {
    const { business_type, selected_objectives = [] } = req.body
    if (!business_type) return res.status(400).json({ error: 'business_type required' })

    let requiredCameras = 1
    let targetClasses = [0]   // default: persons
    let features = {
      track_persons: true,
      track_vehicles: false,
      revenue_audit_match: false,
      track_waiting_bottlenecks: false,
      dynamic_perspective_warp: false,
      reid_enabled: true,
    }

    // Vehicle-only business types
    if (['drive_thru', 'car_wash'].includes(business_type)) {
      targetClasses = [2, 3, 5, 7]   // car, motorcycle, bus, truck
      features.track_vehicles = true
      features.track_persons  = false
      features.reid_enabled   = false   // ReID irrelevant for vehicles → saves CPU
    }

    // Objective → camera allocation rules
    if (selected_objectives.includes('track_revenue_leakage')) {
      requiredCameras += 1
      features.revenue_audit_match = true
    }
    if (selected_objectives.includes('track_waiting_bottlenecks')) {
      requiredCameras += 1
      features.track_waiting_bottlenecks = true
    }
    if (selected_objectives.includes('track_staff_compliance')) {
      features.reid_enabled = true
    }
    if (selected_objectives.includes('perspective_warp')) {
      features.dynamic_perspective_warp = true
    }

    // Tier selection
    let recommendedTier = 'basic'
    if (requiredCameras > 1 && requiredCameras <= 3) recommendedTier = 'pro'
    if (requiredCameras > 3)                         recommendedTier = 'enterprise'

    return res.status(200).json({
      recommended_tier:   recommendedTier,
      calculated_cameras: requiredCameras,
      target_classes:     targetClasses,
      features,
    })
  } catch (err) {
    console.error('[pre-onboarding]', err)
    res.status(500).json({ error: 'Onboarding calculation engine failure.' })
  }
})

// POST /v1/store/business-profile  — save onboarding profile after payment
app.post('/v1/store/business-profile', async (req, res) => {
  try {
    const db = getPool()
    // Auth: Bearer token required
    const authHeader = req.headers['authorization'] || ''
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!bearerToken) return res.status(401).json({ error: 'Authorization required' })

    // Resolve store from bearer token
    const { rows: userRows } = await db.query(`
      SELECT s.id FROM public.stores s
      JOIN auth.users u ON u.id = s.user_id
      WHERE EXISTS (SELECT 1 FROM auth.sessions sess WHERE sess.user_id = u.id)
      LIMIT 1
    `)
    const storeId = userRows[0]?.id
    if (!storeId) return res.status(403).json({ error: 'غير مصرح' })

    const { business_type, target_classes, features } = req.body
    if (!business_type) return res.status(400).json({ error: 'business_type required' })

    await db.query(
      `INSERT INTO public.store_business_profiles (store_id, business_type, target_classes, features, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (store_id) DO UPDATE
         SET business_type = EXCLUDED.business_type,
             target_classes = EXCLUDED.target_classes,
             features = EXCLUDED.features,
             updated_at = NOW()`,
      [storeId, business_type, target_classes || [0], JSON.stringify(features || {})]
    )
    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('[business-profile]', err)
    res.status(500).json({ error: err.message })
  }
})

// GET|POST /v1/engine-config
// ══════════════════════════════════════════════════════════════════════════════
app.all('/v1/engine-config', async (req, res) => {
  try {
    // ── Auth: API key OR Bearer token (dashboard POST) ────────────────────
    const apiKey    = req.headers['x-api-key'] || req.headers['apikey'] || req.query.api_key
    const authHeader = req.headers['authorization'] || ''
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

    if (!apiKey && !bearerToken) {
      return res.status(401).json({ error: 'مفتاح API مطلوب', kill_signal: false })
    }

    const rl = checkRateLimit(`config:${apiKey || bearerToken}`, 60_000, 120)
    if (!rl.allowed) return res.status(429).json({ error: 'تجاوزت الحد المسموح', kill_signal: false })

    const db = getPool()
    await ensureMultiCameraColumns(db)
    await ensureBusinessProfileTables(db)

    // ── POST: save zone_config or cameras list (from dashboard) ──────────
    if (req.method === 'POST') {
      const body = req.body || {}
      const storeId = body.store_id

      if (!storeId) return res.status(400).json({ error: 'store_id مطلوب' })

      // Verify store ownership via bearer token (JWT) or API key
      let authorizedStoreId = null
      if (bearerToken) {
        // Decode JWT to get user ID — no GoTrue round-trip needed
        const payload = parseJwtPayload(bearerToken)
        const userId = payload?.sub
        console.log(`[engine-config POST] bearer auth — userId=${userId} storeId=${storeId}`)
        if (userId) {
          const { rows: storeRows } = await db.query(
            `SELECT id FROM public.stores WHERE id = $1 AND user_id = $2 LIMIT 1`,
            [storeId, userId]
          )
          if (storeRows.length > 0) authorizedStoreId = storeRows[0].id
          else console.error(`[engine-config POST] store not found for userId=${userId} storeId=${storeId}`)
        } else {
          console.error(`[engine-config POST] could not parse JWT sub — token starts: ${bearerToken?.slice(0,20)}`)
        }
      } else if (apiKey) {
        const { rows: akRows } = await db.query(`
          SELECT store_id FROM public.store_api_keys WHERE api_key = $1 AND is_active = true
        `, [apiKey])
        if (akRows.length > 0) authorizedStoreId = akRows[0].store_id
      }

      if (!authorizedStoreId) {
        console.error(`[engine-config POST] auth failed — store_id=${storeId} bearer=${!!bearerToken} apiKey=${!!apiKey}`)
        return res.status(403).json({ error: 'غير مصرح' })
      }
      console.log(`[engine-config POST] authorized storeId=${authorizedStoreId}`)

      // Save zone_config (single or per-camera)
      if (body.zone_config) {
        const cameraId = body.camera_id

        if (cameraId) {
          // Per-camera zone config: merge into zone_configs JSONB (dashboard read)
          await db.query(`
            UPDATE public.stores
            SET zone_configs = COALESCE(zone_configs, '{}'::jsonb) || jsonb_build_object($1::text, $2::jsonb),
                updated_at   = NOW()
            WHERE id = $3
          `, [cameraId, JSON.stringify(body.zone_config), authorizedStoreId])

          // Also write to store_zones table (engine reads from here)
          await db.query(`
            INSERT INTO public.store_zones (store_id, camera_id, config_data, updated_at)
            VALUES ($1, $2, $3::jsonb, NOW())
            ON CONFLICT (store_id, camera_id)
            DO UPDATE SET config_data = EXCLUDED.config_data, updated_at = NOW()
          `, [authorizedStoreId, cameraId, JSON.stringify(body.zone_config)])
          console.log(`[engine-config POST] zone saved — store=${authorizedStoreId} camera=${cameraId}`)

          // Update is_door flag in cameras array for this camera_id
          if (body.is_door !== undefined) {
            await db.query(`
              UPDATE public.stores
              SET cameras = (
                SELECT jsonb_agg(
                  CASE WHEN cam->>'camera_id' = $1
                    THEN cam || jsonb_build_object('is_door', $2::boolean)
                    ELSE cam
                  END
                )
                FROM jsonb_array_elements(COALESCE(cameras, '[]'::jsonb)) AS cam
              ),
              updated_at = NOW()
              WHERE id = $3
            `, [cameraId, body.is_door === true, authorizedStoreId])
          }
        } else {
          // Legacy single-camera zone config
          await db.query(`
            UPDATE public.stores
            SET zone_configs = jsonb_build_object('camera_01', $1::jsonb),
                updated_at   = NOW()
            WHERE id = $2
          `, [JSON.stringify(body.zone_config), authorizedStoreId])

          // Also write to store_zones (engine reads from here)
          await db.query(`
            INSERT INTO public.store_zones (store_id, camera_id, config_data, updated_at)
            VALUES ($1, 'camera_01', $2::jsonb, NOW())
            ON CONFLICT (store_id, camera_id)
            DO UPDATE SET config_data = EXCLUDED.config_data, updated_at = NOW()
          `, [authorizedStoreId, JSON.stringify(body.zone_config)])
        }
      }

      // Save cameras list (from store setup)
      if (body.cameras && Array.isArray(body.cameras)) {
        const tier = body.subscription_tier || 'basic'
        const maxCams = TIER_MAX_CAMERAS[tier] || 1
        const limitedCameras = body.cameras.slice(0, maxCams)
        await db.query(`
          UPDATE public.stores SET cameras = $1::jsonb, updated_at = NOW() WHERE id = $2
        `, [JSON.stringify(limitedCameras), authorizedStoreId])
      }

      // Save staff_count
      if (body.staff_count != null) {
        await db.query(`
          UPDATE public.stores SET staff_count = $1, updated_at = NOW() WHERE id = $2
        `, [parseInt(body.staff_count) || 0, authorizedStoreId])
      }

      return res.json({ ok: true })
    }

    // ── GET (dashboard / bearer token): lightweight zone+camera read ─────
    if (!apiKey && bearerToken) {
      const storeId = req.query.store_id
      if (!storeId) return res.status(400).json({ error: 'store_id مطلوب' })

      // Verify bearer token owns this store — decode JWT directly (no GoTrue round-trip)
      const payload = parseJwtPayload(bearerToken)
      const userId = payload?.sub
      if (!userId) return res.status(401).json({ error: 'Unauthorized' })

      const { rows: storeRows } = await db.query(
        `SELECT id, cameras, zone_configs FROM public.stores WHERE id = $1 AND user_id = $2 LIMIT 1`,
        [storeId, userId]
      )
      if (!storeRows.length) return res.status(403).json({ error: 'غير مصرح' })
      const storeRow = storeRows[0]

      // Build cameras list (prefer store_cameras table, fall back to JSONB column)
      const camRes = await db.query(
        `SELECT camera_id, name, rtsp_url, is_door FROM public.store_cameras WHERE store_id = $1 ORDER BY id`,
        [storeId]
      )
      let cameras = camRes.rows
      if (cameras.length === 0 && Array.isArray(storeRow.cameras)) {
        cameras = storeRow.cameras
      }

      // Build zone_configs: merge store_zones table + stores.zone_configs JSONB
      const zonesRes = await db.query(
        `SELECT camera_id, config_data FROM public.store_zones WHERE store_id = $1`,
        [storeId]
      )
      const zoneConfigs = {}
      // First from store_zones (engine-written)
      zonesRes.rows.forEach(z => { zoneConfigs[z.camera_id] = z.config_data })
      // Then overlay with dashboard-saved (stores.zone_configs) — takes priority
      if (storeRow.zone_configs && typeof storeRow.zone_configs === 'object') {
        Object.assign(zoneConfigs, storeRow.zone_configs)
      }

      const zoneKeys = Object.keys(zoneConfigs)
      console.log(`[engine-config GET dashboard] store=${storeId} cameras=${cameras.length} zone_keys=[${zoneKeys}] has_zones=${zoneKeys.length > 0}`)
      // CRITICAL: never cache — browser must always get fresh zone data after save
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')
      return res.json({ cameras, zone_configs: zoneConfigs, zone_config: null })
    }

    // ── GET: return full engine config ────────────────────────────────────
    if (!apiKey) return res.status(401).json({ error: 'مفتاح API مطلوب للقراءة', kill_signal: false })

    const { rows } = await db.query(`
      SELECT sak.id, sak.store_id, sak.is_active, sak.expires_at,
             s.id AS s_id, s.name, s.store_status, s.custom_questions, s.working_hours,
             s.hardware_choice, s.interval_minutes, s.debug_mode, s.remote_command,
             s.admin_override_signal, s.rtsp_url, s.camera_ip, s.camera_username,
             s.verification_status, s.network_mode,
             s.cameras, s.zone_configs, s.staff_count, s.store_type,
             sub.status AS sub_status, sub.tier, sub.end_date
      FROM public.store_api_keys sak
      JOIN public.stores s ON s.id = sak.store_id
      LEFT JOIN public.subscriptions sub ON sub.id = s.subscription_id
      WHERE sak.api_key = $1
    `, [apiKey])

    const r = rows[0]
    if (!r) return res.status(401).json({ error: 'مفتاح API غير صحيح', kill_signal: false })

    const isLicenseActive = r.is_active && (!r.expires_at || new Date(r.expires_at) > new Date())
    const isSubActive = r.sub_status === 'active' && (!r.end_date || new Date(r.end_date) >= new Date())
    const isStoreActive = r.store_status === 'active'

    if (!isLicenseActive || !isSubActive || !isStoreActive) {
      let reason, code
      if (!isLicenseActive) { reason = 'الترخيص ملغي أو منتهي'; code = 'LICENSE_REVOKED' }
      else if (!isSubActive) { reason = 'الاشتراك منتهي الصلاحية'; code = 'SUBSCRIPTION_EXPIRED' }
      else { reason = 'المتجر موقوف'; code = 'STORE_SUSPENDED' }
      return res.json({ kill_signal: true, reason: code, message: `${reason}. تواصل مع سبلت تيك لتجديد الاشتراك.` })
    }

    const tierConfig = {
      basic:      { hours: 12, maxInterval: 30 },
      pro:        { hours: 18, maxInterval: 10 },
      enterprise: { hours: 24, maxInterval:  5 },
    }
    const tier = r.tier || 'basic'
    const limits = tierConfig[tier] || tierConfig.basic
    const maxCameras = TIER_MAX_CAMERAS[tier] || 1

    const sideEffects = [
      db.query(`UPDATE public.stores SET last_heartbeat = NOW() WHERE id = $1`, [r.s_id]),
    ]
    if (r.admin_override_signal) {
      sideEffects.push(db.query(`UPDATE public.stores SET admin_override_signal = NULL WHERE id = $1`, [r.s_id]))
    }
    await Promise.allSettled(sideEffects)

    const wh = r.working_hours || { start: 17, end: 5 }
    const saudiHour = (new Date().getUTCHours() + 3) % 24
    const isWorkingHours = wh.start < wh.end
      ? (saudiHour >= wh.start && saudiHour < wh.end)
      : (saudiHour >= wh.start || saudiHour < wh.end)

    const authorizedStoreId = r.s_id

    // 1. Business profile (falls back to defaults if not configured yet)
    const profileRes = await db.query(
      `SELECT business_type, target_classes, features
       FROM public.store_business_profiles
       WHERE store_id = $1`,
      [authorizedStoreId]
    )
    const profile = profileRes.rows[0] || {
      business_type: 'retail',
      target_classes: [0],
      features: { track_persons: true, track_vehicles: false, reid_enabled: true },
    }

    // 2. Cameras — prefer store_cameras table, fall back to JSONB cameras column
    const camRes = await db.query(
      `SELECT camera_id, name, rtsp_url, is_door
       FROM public.store_cameras
       WHERE store_id = $1
       ORDER BY id`,
      [authorizedStoreId]
    )
    let cameras = camRes.rows
    if (cameras.length === 0) {
      // Legacy fallback: read from stores.cameras JSONB column
      const legacyRes = await db.query(
        `SELECT cameras, rtsp_url FROM public.stores WHERE id = $1`,
        [authorizedStoreId]
      )
      const legacyStore = legacyRes.rows[0] || {}
      if (Array.isArray(legacyStore.cameras) && legacyStore.cameras.length > 0) {
        cameras = legacyStore.cameras
      } else if (legacyStore.rtsp_url) {
        cameras = [{ camera_id: 'camera_01', name: 'الكاميرا الرئيسية', rtsp_url: legacyStore.rtsp_url, is_door: false }]
      }
    }
    // Enforce tier limit
    cameras = cameras.slice(0, maxCameras)

    // 3. Zone configs
    const zonesRes = await db.query(
      `SELECT camera_id, config_data FROM public.store_zones WHERE store_id = $1`,
      [authorizedStoreId]
    )
    const zoneConfigs = {}
    zonesRes.rows.forEach(z => { zoneConfigs[z.camera_id] = z.config_data })

    // 4. Existing store fields for Electron app compatibility
    const store = r

    return res.status(200).json({
      // V11.2 polymorphic profile
      business_type:   profile.business_type,
      target_classes:  profile.target_classes,
      features:        profile.features,
      cameras,
      zone_configs:    zoneConfigs,
      // Legacy fields (Electron app compatibility)
      store_id:             authorizedStoreId,
      rtsp_url:             store.rtsp_url || cameras[0]?.rtsp_url || '',
      camera_ip:            store.camera_ip            || '',
      camera_username:      store.camera_username      || '',
      network_mode:         store.network_mode         || 'single_network',
      verification_status:  store.verification_status  || 'pending',
      subscription_tier:    tier,
      expiry_date:          store.end_date             || '',
      staff_count:          store.staff_count          || 0,
      store_type:           store.store_type           || profile.business_type,
      working_hours:        wh,
      custom_questions:     store.custom_questions     || [],
      kill_signal:          false,
      remote_command:       store.remote_command       || 'run',
      admin_override_signal: store.admin_override_signal || null,
      // Additional fields for dashboard/engine compatibility
      store_name:         store.name,
      is_working_hours:   isWorkingHours,
      hardware_choice:    store.hardware_choice || 'software',
      interval_minutes:   10,
      debug_mode:         store.debug_mode || false,
      max_cameras:        maxCameras,
      allowed_hours:      limits.hours,
      is_active:          true,
      reason: isWorkingHours ? null : 'OUTSIDE_WORKING_HOURS',
    })
  } catch (err) {
    console.error('engine-config error:', err)
    res.status(500).json({ error: 'خطأ داخلي', kill_signal: false })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET|POST /v1/remote-config  (legacy Python engine endpoint)
// ══════════════════════════════════════════════════════════════════════════════
app.all('/v1/remote-config', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.headers['apikey'] || req.query.api_key
    const storeId = req.query.store_id

    if (!apiKey) return res.status(401).json({ error: 'مفتاح API مطلوب', is_active: false })

    const db = getPool()
    const { rows: keyRows } = await db.query(
      `SELECT store_id, is_active, expires_at FROM public.store_api_keys WHERE api_key = $1`,
      [apiKey]
    )
    const keyRecord = keyRows[0]
    if (!keyRecord?.is_active) return res.status(401).json({ error: 'مفتاح API غير صحيح', is_active: false })
    if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date())
      return res.json({ is_active: false, remote_command: 'stop', message: 'الاشتراك منتهي الصلاحية' })

    const resolvedId = storeId || keyRecord.store_id
    const { rows } = await db.query(`
      SELECT s.*, sub.status AS sub_status, sub.tier, sub.end_date
      FROM public.stores s
      LEFT JOIN public.subscriptions sub ON sub.id = s.subscription_id
      WHERE s.id = $1
    `, [resolvedId])

    const store = rows[0]
    if (!store) return res.status(404).json({ error: 'المتجر غير موجود', is_active: false })
    if (store.store_status !== 'active' || store.sub_status !== 'active')
      return res.json({ is_active: false, remote_command: 'stop' })

    const tierHours = { basic: 12, pro: 18, enterprise: 24 }
    const wh = store.working_hours || { start: 17, end: 5 }
    const saudiHour = (new Date().getUTCHours() + 3) % 24
    // Supports both daytime (start < end) and overnight (start > end) ranges.
    const isWorkingNow = wh.start < wh.end
      ? (saudiHour >= wh.start && saudiHour < wh.end)
      : (saudiHour >= wh.start || saudiHour < wh.end)

    db.query(`UPDATE public.stores SET last_heartbeat = NOW() WHERE id = $1`, [resolvedId]).catch(() => {})

    res.json({
      store_name: store.name,
      custom_questions: store.custom_questions || [],
      working_hours: wh,
      is_working_hours: isWorkingNow,
      hardware_choice: store.hardware_choice || 'software',
      interval_minutes: store.interval_minutes || 10,
      debug_mode: store.debug_mode || false,
      remote_command: store.remote_command || 'run',
      is_active: true,
      subscription_tier: store.tier || 'basic',
      allowed_hours: tierHours[store.tier] || 12,
      rtsp_url: store.rtsp_url || null,
      camera_ip: store.camera_ip || null,
      camera_username: store.camera_username || null,
      verification_status: store.verification_status || 'verified',
      network_mode: store.network_mode || 'single_network',
    })
  } catch (err) {
    console.error('remote-config error:', err)
    res.status(500).json({ error: 'خطأ داخلي', is_active: false })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/license-request
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/license-request', async (req, res) => {
  try {
    const authHeader = req.headers['authorization']
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' })

    const token = authHeader.replace('Bearer ', '')
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown'
    if (!checkRateLimit(`lr:u:${user.id}`, 60_000, 5).allowed ||
        !checkRateLimit(`lr:ip:${ip}`, 60_000, 20).allowed)
      return res.status(429).json({ error: 'Too many requests. Please wait and retry.' })

    const { store_id, rtsp_url, camera_ip, camera_username, camera_password } = req.body
    if (!store_id || !rtsp_url || !camera_ip || !camera_username || !camera_password)
      return res.status(400).json({ error: 'store_id and camera fields are required' })

    const db = getPool()
    const { rows } = await db.query(
      `SELECT s.id, s.user_id, s.name, s.store_status, s.verification_status,
              s.subscription_id, sub.status AS sub_status, sub.tier, sub.monthly_amount
         FROM public.stores s
         LEFT JOIN public.subscriptions sub ON sub.id = s.subscription_id
        WHERE s.id = $1`,
      [store_id]
    )
    const store = rows[0]
    if (!store) return res.status(404).json({ error: 'Store not found' })
    if (store.user_id !== user.id) return res.status(403).json({ error: 'Forbidden' })
    if (store.store_status === 'active' && store.verification_status === 'verified')
      return res.status(409).json({ error: 'Store already activated.', code: 'ALREADY_ACTIVATED' })
    if (['pending', 'under_review'].includes(store.verification_status || 'pending'))
      return res.status(409).json({ error: 'Activation request already pending approval.', code: 'PENDING_APPROVAL' })

    // ── Payment gate ────────────────────────────────────────────────────
    // Admin must never receive an activation request before payment is settled.
    if (store.sub_status !== 'active')
      return res.status(402).json({
        error: 'Subscription must be paid before submitting an activation request.',
        code: 'PAYMENT_REQUIRED',
      })

    await db.query(`
      UPDATE public.stores SET
        rtsp_url = $1, rtsp_password_encrypted = $2, camera_ip = $3, camera_username = $4,
        store_status = 'pending', verification_status = 'under_review',
        verification_requested_at = NOW(),
        verification_notes = 'Activation request submitted. Awaiting IT verification (1-24h).',
        reviewed_at = NULL, reviewed_by = NULL, rejection_reason = NULL, updated_at = NOW()
      WHERE id = $5 AND user_id = $6
    `, [rtsp_url.trim(), encryptPassword(camera_password.trim()), camera_ip.trim(), camera_username.trim(), store_id, user.id])

    // ── Notify admins — fire-and-forget, never block the response ────────
    // This is the ONLY place where admins get notified about a new activation
    // request. By the time we hit this line we know: payment is settled AND
    // camera details are provided.
    const APP_URL = process.env.APP_URL || 'https://app.splittech.sa'
    const storeName = store.name || 'متجر بدون اسم'
    const tierLine = store.tier
      ? `${store.tier}${store.monthly_amount ? ` — ${store.monthly_amount} ريال/شهر` : ''}`
      : '—'
    sendMail(
      ['ceo@splittech.sa', 'cto@splittech.sa'],
      `طلب تفعيل متجر — ${storeName}`,
      emailLayout(
        `طلب تفعيل متجر — ${storeName}`,
        `<h2 style="color:#1F2937;font-size:22px;font-weight:700;margin:0 0 6px;">طلب تفعيل متجر (تم الدفع)</h2>
        <p style="color:#6B7280;font-size:14px;margin:0 0 24px;">العميل أتم الدفع وأرسل بيانات الكاميرا — جاهز لمراجعة فريق الـ IT</p>

        <table width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:#F8FAFC;border-radius:12px;margin:0 0 28px;">
          <tr><td style="padding:20px 24px;">
            <p style="color:#374151;font-size:13px;font-weight:600;margin:0 0 14px;border-bottom:1px solid #E5E7EB;padding-bottom:10px;">تفاصيل الطلب</p>
            <table cellpadding="0" cellspacing="4" border="0" width="100%">
              <tr>
                <td style="color:#6B7280;font-size:13px;padding-left:16px;white-space:nowrap;padding-bottom:8px;">اسم المتجر:</td>
                <td style="color:#1F2937;font-size:13px;font-weight:600;padding-bottom:8px;">${storeName}</td>
              </tr>
              <tr>
                <td style="color:#6B7280;font-size:13px;padding-left:16px;white-space:nowrap;padding-bottom:8px;">الباقة:</td>
                <td style="color:#1F2937;font-size:13px;padding-bottom:8px;">${tierLine}</td>
              </tr>
              <tr>
                <td style="color:#6B7280;font-size:13px;padding-left:16px;white-space:nowrap;padding-bottom:8px;">IP الكاميرا:</td>
                <td style="color:#1F2937;font-size:13px;font-family:monospace;padding-bottom:8px;">${camera_ip.trim()}</td>
              </tr>
              <tr>
                <td style="color:#6B7280;font-size:13px;padding-left:16px;white-space:nowrap;">معرف المتجر:</td>
                <td style="color:#1F2937;font-size:12px;font-family:monospace;">${store.id}</td>
              </tr>
            </table>
          </td></tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="padding:0 0 12px;">
            <a href="${APP_URL}/admin/stores"
               style="display:inline-block;background:#005F2D;color:#ffffff;font-size:15px;font-weight:700;
                      padding:14px 44px;border-radius:10px;text-decoration:none;">
              مراجعة الطلب الآن
            </a>
          </td></tr>
        </table>`
      )
    ).catch(e => console.error('admin-notify error:', e))

    res.json({ success: true, status: 'under_review', message: 'Activation request submitted successfully. Review takes 1-24 hours.' })
  } catch (err) {
    console.error('license-request error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/revoke-license
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/revoke-license', async (req, res) => {
  try {
    const authHeader = req.headers['authorization']
    if (!authHeader) return res.status(401).json({ error: 'Authorization required' })

    const token = authHeader.replace('Bearer ', '')
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })

    const role = await getUserRole(user.id)
    if (!['super_owner', 'it_support'].includes(role))
      return res.status(403).json({ error: 'صلاحيات غير كافية' })

    if (!checkRateLimit(`admin:${user.id}`, 60_000, 60).allowed)
      return res.status(429).json({ error: 'Rate limit exceeded' })

    const { action, api_key_id, target_user_id, new_fingerprint, store_id, reason = 'Administrative action' } = req.body
    if (!action) return res.status(400).json({ error: 'action مطلوب' })

    const db = getPool()

    if (action === 'revoke_license') {
      if (!api_key_id) return res.status(400).json({ error: 'api_key_id مطلوب' })
      await db.query(
        `UPDATE public.store_api_keys SET is_active = FALSE, revoked_at = NOW(), revoked_by = $1 WHERE id = $2`,
        [user.id, api_key_id]
      )
      return res.json({ success: true, message: 'تم إلغاء الترخيص بنجاح' })
    }

    if (action === 'revoke_sessions') {
      if (!target_user_id) return res.status(400).json({ error: 'target_user_id مطلوب' })
      fetch(`${GOTRUE_URL}/auth/v1/admin/users/${target_user_id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${process.env.GOTRUE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ban_duration: '876000h' }),
      }).catch((e) => console.error('GoTrue ban failed:', e))
      return res.json({ success: true, message: 'تم إنهاء جلسات المستخدم' })
    }

    if (action === 'override_fingerprint') {
      if (!api_key_id) return res.status(400).json({ error: 'api_key_id مطلوب' })
      if (role !== 'super_owner') return res.status(403).json({ error: 'هذا الإجراء يتطلب صلاحية super_owner' })
      await db.query(`UPDATE public.store_api_keys SET machine_fingerprint = $1 WHERE id = $2`, [new_fingerprint || null, api_key_id])
      return res.json({ success: true, message: 'تم تحديث بصمة الجهاز بنجاح' })
    }

    if (action === 'clear_fingerprint') {
      if (!store_id) return res.status(400).json({ error: 'store_id مطلوب' })
      if (!['super_owner', 'it_support'].includes(role)) return res.status(403).json({ error: 'غير مصرح' })
      await db.query(`UPDATE public.store_api_keys SET machine_fingerprint = NULL WHERE store_id = $1`, [store_id])
      return res.json({ success: true, message: 'تم مسح بصمة الجهاز — يمكن التفعيل من أي جهاز الآن' })
    }

    if (action === 'suspend_store') {
      if (!store_id) return res.status(400).json({ error: 'store_id مطلوب' })
      await db.query(`UPDATE public.stores SET store_status = 'suspended', remote_command = 'stop' WHERE id = $1`, [store_id])
      await db.query(`UPDATE public.store_api_keys SET is_active = FALSE WHERE store_id = $1`, [store_id])
      return res.json({ success: true, message: 'تم تعليق المتجر وإيقاف الترخيص' })
    }

    res.status(400).json({ error: `action غير معروف: ${action}` })
  } catch (err) {
    console.error('revoke-license error:', err)
    res.status(500).json({ error: 'خطأ داخلي في الخادم' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/signup  — creates account via GoTrue + sends welcome email
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/signup', async (req, res) => {
  try {
    const { email, password, full_name, company_name, phone, captchaToken, referral_code } = req.body
    if (!email || !password) return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبان' })
    if (password.length < 8) return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' })

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown'
    if (!checkRateLimit(`signup:${ip}`, 60_000, 5).allowed)
      return res.status(429).json({ error: 'طلبات كثيرة، حاول لاحقاً' })

    // Server-side Turnstile validation
    const turnstileOk = await validateTurnstile(captchaToken, ip)
    if (!turnstileOk) return res.status(400).json({ error: 'فشل التحقق من البوت. حاول مرة أخرى.' })

    const body = {
      email: email.trim().toLowerCase(),
      password,
      data: {
        full_name: full_name?.trim() || '',
        company_name: company_name?.trim() || '',
        role: 'merchant',
      },
    }
    if (captchaToken) body.gotrue_meta_security = { captcha_token: captchaToken }

    if (!GOTRUE_URL) {
      console.error('signup: GOTRUE_URL env var is not set')
      return res.status(500).json({ error: 'خطأ في إعداد الخادم — تواصل مع الدعم' })
    }

    const gotrueRes = await fetch(`${GOTRUE_URL}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!gotrueRes.ok) {
      const err = await gotrueRes.json().catch(() => ({}))
      const msg = err.msg || err.error_description || err.message || 'خطأ في إنشاء الحساب'
      if (/already registered/i.test(msg))
        return res.status(409).json({ error: 'هذا البريد الإلكتروني مسجل مسبقاً.' })
      return res.status(gotrueRes.status).json({ error: msg })
    }

    const gotrueData = await gotrueRes.json().catch(() => ({}))
    const APP_URL = process.env.APP_URL || 'https://splittech.sa'
    const name = full_name?.trim() || email.trim()

    // Welcome email — fire and forget
    sendMail(
      email.trim(),
      'مرحباً بك في SPLIT Intelligence',
      emailLayout(
        `أهلاً ${name}، حسابك جاهز!`,
        `<h2 style="color:#1F2937;font-size:22px;font-weight:700;margin:0 0 6px;">مرحباً ${name}</h2>
        <p style="color:#6B7280;font-size:14px;margin:0 0 24px;">تم إنشاء حسابك بنجاح في منصة SPLIT Intelligence</p>

        <p style="color:#374151;font-size:15px;line-height:1.8;margin:0 0 24px;">
          يسعدنا انضمامك. أنت الآن على بُعد خطوات من تفعيل مراقبة متجرك بالذكاء الاصطناعي.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:#F0FDF4;border-radius:12px;margin:0 0 28px;">
          <tr><td style="padding:20px 24px;">
            <p style="color:#166534;font-size:14px;font-weight:700;margin:0 0 12px;">خطواتك القادمة:</p>
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="color:#005F2D;font-size:18px;padding-left:12px;vertical-align:top;">١</td>
                <td style="color:#374151;font-size:14px;line-height:1.8;padding-bottom:8px;">سجّل الدخول وأكمل بيانات متجرك وكاميراتك</td>
              </tr>
              <tr>
                <td style="color:#005F2D;font-size:18px;padding-left:12px;vertical-align:top;">٢</td>
                <td style="color:#374151;font-size:14px;line-height:1.8;padding-bottom:8px;">يراجع فريق الـ IT طلبك خلال 24 ساعة</td>
              </tr>
              <tr>
                <td style="color:#005F2D;font-size:18px;padding-left:12px;vertical-align:top;">٣</td>
                <td style="color:#374151;font-size:14px;line-height:1.8;">ابدأ في استقبال تقارير التدقيق التشغيلي</td>
              </tr>
            </table>
          </td></tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="padding:4px 0 28px;">
            <a href="${APP_URL}/login"
               style="display:inline-block;background:#005F2D;color:#ffffff;font-size:15px;font-weight:700;
                      padding:14px 44px;border-radius:10px;text-decoration:none;">
              تسجيل الدخول الآن
            </a>
          </td></tr>
        </table>

        <p style="color:#9CA3AF;font-size:13px;line-height:1.7;margin:0;border-top:1px solid #F3F4F6;padding-top:20px;">
          إذا لم تقم بإنشاء هذا الحساب، تواصل معنا على
          <a href="mailto:support@splittech.sa" style="color:#005F2D;">support@splittech.sa</a>
        </p>`
      )
    ).catch(e => console.error('welcome-email error:', e))

    // Save phone to profile if provided (fire and forget — profile row created by DB trigger)
    if (gotrueData.user?.id && phone?.trim()) {
      setTimeout(() => {
        getPool().query(
          `UPDATE public.profiles SET phone = $1 WHERE id = $2`,
          [phone.trim(), gotrueData.user.id]
        ).catch(e => console.error('[signup] phone save failed:', e?.message))
      }, 1500) // small delay to let the GoTrue trigger create the profile row first
    }

    // Save referral code to profile — commission fires ONLY on first payment (not signup)
    if (gotrueData.user?.id && referral_code?.trim()) {
      const code = referral_code.trim().toUpperCase()
      setTimeout(async () => {
        try {
          const pool = getPool()
          // Validate code belongs to an active associate
          const { rows } = await pool.query(
            `SELECT id FROM public.marketing_associate_profile
             WHERE UPPER(referral_code) = $1 AND is_active = TRUE LIMIT 1`,
            [code]
          )
          if (!rows.length) return // invalid or inactive code — ignore silently
          // Persist code on profile; commission will be created when subscription is paid
          await pool.query(
            `UPDATE public.profiles SET referral_code_used = $1 WHERE id = $2`,
            [code, gotrueData.user.id]
          )
          console.log(`[signup] referral code saved: code=${code} user=${gotrueData.user.id}`)
        } catch (refErr) {
          console.error('[signup] referral save failed (non-fatal):', refErr.message)
        }
      }, 2000)
    }

    // Auto-send email OTP immediately after signup (so user can verify in the next step)
    if (gotrueData.access_token && gotrueData.user?.id) {
      const userId    = gotrueData.user.id
      const emailKey  = `email:${email.trim().toLowerCase()}`
      generateOtpDB(userId, emailKey).then(async (code) => {
        const profile = { full_name: full_name?.trim() || name }
        await sendMail(
          email.trim(),
          `رمز التحقق من بريدك الإلكتروني — ${code}`,
          emailLayout(
            `رمز التحقق: ${code}`,
            `<h2 style="color:#1F2937;font-size:22px;font-weight:700;margin:0 0 6px;">تحقق من بريدك الإلكتروني</h2>
            <p style="color:#6B7280;font-size:14px;margin:0 0 24px;">أهلاً ${profile.full_name}، استخدم الرمز أدناه لتأكيد بريدك الإلكتروني في سبلت إنتلجنس.</p>
            <div style="background:#F0FDF4;border:2px solid #AECC1E;border-radius:16px;padding:28px;text-align:center;margin:0 0 24px;">
              <p style="color:#6B7280;font-size:13px;margin:0 0 8px;">رمز التحقق</p>
              <p style="color:#0A0A0A;font-size:40px;font-weight:900;letter-spacing:12px;margin:0;font-family:monospace;">${code}</p>
              <p style="color:#9CA3AF;font-size:12px;margin:12px 0 0;">صالح لمدة 10 دقائق — لا تشاركه مع أحد</p>
            </div>
            <p style="color:#6B7280;font-size:13px;margin:0;">إذا لم تنشئ حساباً في سبلت، تجاهل هذه الرسالة.</p>`
          )
        )
      }).catch(e => console.error('[signup] auto email-OTP failed:', e?.message))
    }

    res.json({
      success: true,
      access_token:  gotrueData.access_token  || null,
      refresh_token: gotrueData.refresh_token || null,
    })
  } catch (err) {
    console.error('signup error:', err)
    res.status(500).json({ error: `خطأ داخلي في الخادم: ${err.message || String(err)}` })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/associate/save-iban  — associate saves their bank IBAN
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/associate/save-iban', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Invalid token' })

    const { iban } = req.body
    if (!iban?.trim()) return res.status(400).json({ error: 'IBAN مطلوب' })

    // Basic Saudi IBAN format check: SA + 22 digits = 24 chars
    const cleaned = iban.trim().toUpperCase().replace(/\s/g, '')
    if (!/^SA\d{22}$/.test(cleaned))
      return res.status(400).json({ error: 'صيغة IBAN غير صحيحة — يجب أن يكون SA + 22 رقماً' })

    const pool = getPool()
    await pool.query(
      `UPDATE public.marketing_associate_profile SET iban = $1 WHERE id = $2`,
      [cleaned, user.id]
    )
    res.json({ success: true })
  } catch (err) {
    console.error('[save-iban] error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /v1/associate/profile  — ensure profile row exists, return it
// Creates the row (and auto-generates referral code via trigger) if missing
// ══════════════════════════════════════════════════════════════════════════════
app.get('/v1/associate/profile', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })

    const pool = getPool()
    // Create profile row if it doesn't exist — trigger fn_generate_referral_code fires on INSERT
    await pool.query(
      `INSERT INTO public.marketing_associate_profile (id, is_active)
       VALUES ($1, true)
       ON CONFLICT (id) DO NOTHING`,
      [user.id]
    )
    const { rows } = await pool.query(
      `SELECT referral_code, iban, employee_number,
              pending_commissions_sar, paid_commissions_sar, total_conversions
       FROM public.marketing_associate_profile WHERE id = $1`,
      [user.id]
    )
    res.json(rows[0] || null)
  } catch (err) {
    console.error('[associate/profile] error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/admin/commission/mark-paid  — super_owner records manual bank transfer
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/admin/commission/mark-paid', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Invalid token' })

    // Only super_owner or it_support can mark commissions as paid
    const pool = getPool()
    const { rows: caller } = await pool.query(
      `SELECT role FROM public.profiles WHERE id = $1`, [user.id]
    )
    const callerRole = caller[0]?.role
    if (!['super_owner', 'it_support'].includes(callerRole))
      return res.status(403).json({ error: 'غير مصرح' })

    const { conversion_id, notes } = req.body
    if (!conversion_id) return res.status(400).json({ error: 'conversion_id مطلوب' })

    // Fetch the conversion record
    const { rows: conv } = await pool.query(
      `SELECT id, associate_id, commission_amount, status
       FROM public.marketing_referral_conversions
       WHERE id = $1`,
      [conversion_id]
    )
    if (!conv.length) return res.status(404).json({ error: 'العملية غير موجودة' })
    if (conv[0].status === 'paid') return res.status(409).json({ error: 'تم تحويل هذه العمولة مسبقاً' })

    const amount = Number(conv[0].commission_amount) || 150
    const associateId = conv[0].associate_id

    // Mark conversion as paid
    await pool.query(
      `UPDATE public.marketing_referral_conversions
       SET status = 'paid', paid_at = NOW(), paid_by = $1, payment_notes = $2
       WHERE id = $3`,
      [user.id, notes || null, conversion_id]
    )

    // Update associate totals: deduct from pending, add to paid
    await pool.query(
      `UPDATE public.marketing_associate_profile
       SET pending_commissions_sar = GREATEST(0, COALESCE(pending_commissions_sar,0) - $1),
           paid_commissions_sar    = COALESCE(paid_commissions_sar,0) + $1
       WHERE id = $2`,
      [amount, associateId]
    )

    console.log(`[mark-paid] conversion=${conversion_id} amount=${amount} by=${user.id}`)
    res.json({ success: true })
  } catch (err) {
    console.error('[mark-paid] error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── Email templates for send-email endpoint ───────────────────────────────────
function buildEmailFromEvent(eventType, vars = {}) {
  const name = vars.merchant_name || vars.to_name || 'العميل الكريم'
  const storeName = vars.store_name || ''
  const dashUrl = vars.dashboard_url || 'https://splittech.sa/dashboard'

  const templates = {
    welcome: {
      subject: 'مرحباً بك في منصة SPLIT Intelligence',
      body: `<h2 style="margin:0 0 16px;color:#111827;font-size:22px;">أهلاً ${name}</h2>
<p style="color:#4B5563;line-height:1.8;margin:0 0 16px;">يسعدنا انضمامك إلى منصة SPLIT Intelligence لمراقبة وتحليل أداء المتاجر.</p>
<p style="color:#4B5563;line-height:1.8;margin:0 0 24px;">يمكنك الآن الدخول إلى لوحة التحكم وإعداد متجرك للبدء في استقبال تقارير التدقيق الذكي.</p>
<a href="${dashUrl}" style="display:inline-block;background:#005F2D;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;">الدخول إلى لوحة التحكم</a>`,
    },
    store_approved: {
      subject: `تم اعتماد متجرك — ${storeName || 'SPLIT Intelligence'}`,
      body: `<h2 style="margin:0 0 16px;color:#111827;font-size:22px;">تهانينا ${name}</h2>
<p style="color:#4B5563;line-height:1.8;margin:0 0 16px;">تم مراجعة طلبك واعتماد متجر <strong>${storeName}</strong> بنجاح على منصة SPLIT Intelligence.</p>
<p style="color:#4B5563;line-height:1.8;margin:0 0 24px;">يمكنك الآن البدء في إعداد الكاميرا وتفعيل نظام المراقبة الذكي.</p>
<a href="${dashUrl}" style="display:inline-block;background:#005F2D;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;">الدخول إلى لوحة التحكم</a>`,
    },
    store_rejected: {
      subject: `تحديث بشأن طلب متجرك — SPLIT Intelligence`,
      body: `<h2 style="margin:0 0 16px;color:#111827;font-size:22px;">عزيزي ${name}</h2>
<p style="color:#4B5563;line-height:1.8;margin:0 0 16px;">بعد مراجعة طلب تسجيل متجر <strong>${storeName}</strong>، تعذّر علينا قبوله في الوقت الحالي.</p>
<p style="color:#4B5563;line-height:1.8;margin:0 0 24px;">للاستفسار عن الأسباب أو تقديم معلومات إضافية، يُرجى التواصل مع فريق الدعم.</p>
<a href="mailto:support@splittech.sa" style="display:inline-block;background:#005F2D;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;">تواصل مع الدعم</a>`,
    },
    subscription_expired: {
      subject: 'انتهاء صلاحية الاشتراك — SPLIT Intelligence',
      body: `<h2 style="margin:0 0 16px;color:#111827;font-size:22px;">عزيزي ${name}</h2>
<p style="color:#4B5563;line-height:1.8;margin:0 0 16px;">انتهت صلاحية اشتراكك في منصة SPLIT Intelligence.</p>
<p style="color:#4B5563;line-height:1.8;margin:0 0 24px;">لتجنب انقطاع الخدمة وفقدان البيانات، يُرجى تجديد اشتراكك في أقرب وقت.</p>
<a href="${dashUrl}" style="display:inline-block;background:#005F2D;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;">تجديد الاشتراك</a>`,
    },
    license_activated: {
      subject: 'تم تفعيل الترخيص — SPLIT Intelligence',
      body: `<h2 style="margin:0 0 16px;color:#111827;font-size:22px;">عزيزي ${name}</h2>
<p style="color:#4B5563;line-height:1.8;margin:0 0 16px;">تم تفعيل ترخيص متجرك <strong>${storeName}</strong> بنجاح على منصة SPLIT Intelligence.</p>
<p style="color:#4B5563;line-height:1.8;margin:0 0 24px;">النظام الآن جاهز لبدء جولات التدقيق الذكي.</p>
<a href="${dashUrl}" style="display:inline-block;background:#005F2D;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;">الدخول إلى لوحة التحكم</a>`,
    },
    security_alert: {
      subject: 'تنبيه أمني — SPLIT Intelligence',
      body: `<h2 style="margin:0 0 16px;color:#B91C1C;font-size:22px;">تنبيه أمني</h2>
<p style="color:#4B5563;line-height:1.8;margin:0 0 16px;">عزيزي ${name}، تم رصد نشاط يستدعي مراجعتك الفورية في متجر <strong>${storeName}</strong>.</p>
<p style="color:#4B5563;line-height:1.8;margin:0 0 24px;">يُرجى الدخول إلى لوحة التحكم لمراجعة التفاصيل واتخاذ الإجراء المناسب.</p>
<a href="${dashUrl}" style="display:inline-block;background:#B91C1C;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;">مراجعة التنبيه</a>`,
    },
  }

  return templates[eventType] || null
}

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/send-email
// Accepts both formats:
//   1. Direct: { to, subject, html }
//   2. Event-based (from CommunicationsCenter): { event_type, to_email, to_name, custom_subject, custom_body, variables }
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/send-email', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const caller = await verifyToken(token)
    if (!caller) return res.status(401).json({ error: 'Invalid token' })
    const callerRole = await getUserRole(caller.id)
    if (!['super_owner', 'it_support', 'marketing_manager'].includes(callerRole))
      return res.status(403).json({ error: 'Forbidden' })

    let toAddr, subject, html

    // Format 1: direct fields
    if (req.body.to && req.body.subject && req.body.html) {
      toAddr = req.body.to
      subject = req.body.subject
      html = req.body.html
    }
    // Format 2: event-based from CommunicationsCenter
    else if (req.body.to_email) {
      const { to_email, to_name, event_type, custom_subject, custom_body, variables = {} } = req.body
      toAddr = to_email
      const vars = { ...variables, merchant_name: to_name, to_name }

      if (event_type === 'custom') {
        if (!custom_subject || !custom_body)
          return res.status(400).json({ error: 'الموضوع والنص مطلوبان للرسائل المخصصة' })
        subject = custom_subject
        html = emailLayout(custom_subject, `
          <h2 style="margin:0 0 16px;color:#111827;font-size:20px;">${custom_subject}</h2>
          <p style="color:#4B5563;line-height:1.8;white-space:pre-line;">${custom_body}</p>
        `)
      } else {
        const tpl = buildEmailFromEvent(event_type, vars)
        if (!tpl) return res.status(400).json({ error: `نوع الحدث غير معروف: ${event_type}` })
        subject = tpl.subject
        html = emailLayout(tpl.subject, tpl.body)
      }
    } else {
      return res.status(400).json({ error: 'يجب تحديد المستلم (to_email أو to)' })
    }

    const data = await sendMail(toAddr, subject, html)
    res.json({ success: true, id: data?.id })
  } catch (err) {
    console.error('send-email error:', err)
    res.status(500).json({ error: err.message || 'Internal server error' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/request-password-reset
// Uses GoTrue admin API to generate a recovery link, then sends it via Resend.
// This bypasses GoTrue's built-in SMTP (which is not configured on self-hosted).
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/request-password-reset', async (req, res) => {
  try {
    const { email } = req.body
    if (!email) return res.status(400).json({ error: 'البريد الإلكتروني مطلوب' })

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown'
    if (!checkRateLimit(`pwreset:${ip}`, 60_000, 5).allowed)
      return res.status(429).json({ error: 'طلبات كثيرة، حاول لاحقاً' })

    const GOTRUE_SERVICE_KEY = process.env.GOTRUE_SERVICE_KEY
    const APP_URL = process.env.APP_URL || 'https://splittech.sa'

    if (!GOTRUE_SERVICE_KEY) return res.status(500).json({ error: 'Service key not configured' })
    if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'Email service not configured' })

    // Generate recovery link via GoTrue admin API
    const linkRes = await fetch(`${GOTRUE_URL}/admin/generate_link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GOTRUE_SERVICE_KEY}`,
      },
      body: JSON.stringify({
        type: 'recovery',
        email: email.trim().toLowerCase(),
        redirect_to: `${APP_URL}/reset-password`,
      }),
    })

    if (!linkRes.ok) {
      const redacted = String(email || '').replace(/(^.).*(@.*$)/, '$1***$2')
      console.warn('GoTrue generate_link failed', { email: redacted, status: linkRes.status })
      if (linkRes.status === 404)
        return res.status(404).json({ error: 'البريد الإلكتروني غير مسجّل في النظام' })
      return res.status(500).json({ error: 'فشل إنشاء رابط إعادة التعيين' })
    }

    const { action_link } = await linkRes.json()
    if (!action_link) return res.json({ success: true })

    // GoTrue may ignore redirect_to if not in allow list — override it here
    const fixedLink = (() => {
      try {
        const u = new URL(action_link)
        u.searchParams.set('redirect_to', `${APP_URL}/reset-password`)
        return u.toString()
      } catch { return action_link }
    })()

    await sendMail(
      email.trim(),
      'إعادة تعيين كلمة المرور — SPLIT Intelligence',
      emailLayout(
        'طلب إعادة تعيين كلمة المرور الخاصة بك',
        `<h2 style="color:#1F2937;font-size:22px;font-weight:700;margin:0 0 6px;">إعادة تعيين كلمة المرور</h2>
        <p style="color:#6B7280;font-size:14px;margin:0 0 24px;">استلمنا طلب تغيير كلمة المرور لحسابك</p>

        <p style="color:#374151;font-size:15px;line-height:1.8;margin:0 0 28px;">
          تلقينا طلباً لإعادة تعيين كلمة المرور المرتبطة بهذا البريد الإلكتروني.
          اضغط على الزر أدناه لإنشاء كلمة مرور جديدة.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="padding:0 0 28px;">
            <a href="${fixedLink}"
               style="display:inline-block;background:#005F2D;color:#ffffff;font-size:15px;font-weight:700;
                      padding:14px 44px;border-radius:10px;text-decoration:none;">
              تعيين كلمة مرور جديدة
            </a>
          </td></tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:#FEF9C3;border-radius:10px;margin:0 0 20px;">
          <tr><td style="padding:14px 18px;">
            <p style="color:#854D0E;font-size:13px;margin:0;line-height:1.7;">
              الرابط صالح لمدة <strong>ساعة واحدة</strong> فقط.<br>
              إذا لم تطلب إعادة تعيين كلمة المرور، تجاهل هذه الرسالة — حسابك بأمان.
            </p>
          </td></tr>
        </table>

        <p style="color:#9CA3AF;font-size:13px;line-height:1.7;margin:0;border-top:1px solid #F3F4F6;padding-top:20px;">
          إذا لم يعمل الزر، انسخ هذا الرابط في متصفحك:<br>
          <span style="color:#005F2D;word-break:break-all;font-size:12px;">${fixedLink}</span>
        </p>`
      )
    )

    res.json({ success: true })
  } catch (err) {
    console.error('request-password-reset error:', err)
    // Don't leak internals — always return success
    res.json({ success: true })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/marketing-email
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/marketing-email', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' })
    const caller = await verifyToken(token)
    if (!caller) return res.status(401).json({ success: false, error: 'Invalid token' })
    const callerRole = await getUserRole(caller.id)
    if (!['super_owner', 'marketing_manager'].includes(callerRole))
      return res.status(403).json({ success: false, error: 'Forbidden' })

    const RESEND_API_KEY = process.env.RESEND_API_KEY
    const RESEND_FROM = process.env.RESEND_FROM || 'marketing@splittech.sa'
    if (!RESEND_API_KEY) return res.status(500).json({ success: false, error: 'خطأ في الخادم', code: 'ENV_MISSING' })

    const { campaign_id, recipient_emails, subject, html_body, send_from } = req.body
    if (!campaign_id || !recipient_emails?.length || !subject || !html_body)
      return res.status(400).json({ success: false, error: 'بيانات ناقصة', code: 'INVALID_REQUEST' })

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const validEmails = recipient_emails.filter(e => emailRegex.test(e))
    if (!validEmails.length)
      return res.status(400).json({ success: false, error: 'عناوين بريد غير صحيحة', code: 'INVALID_EMAIL' })

    const from = send_from || RESEND_FROM
    let totalSent = 0
    const failedEmails = []

    for (const email of validEmails) {
      try {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: email, subject, html: html_body }),
        })
        if (r.ok) totalSent++
        else failedEmails.push(email)
      } catch { failedEmails.push(email) }
    }

    getPool().query(
      `UPDATE public.marketing_email_campaigns SET sent_count = $1, sent_at = NOW() WHERE id = $2`,
      [totalSent, campaign_id]
    ).catch(() => {})

    res.status(failedEmails.length > 0 ? 207 : 200).json({
      success: totalSent > 0,
      message_id: campaign_id,
      detail: `Sent ${totalSent}/${validEmails.length} emails`,
      ...(failedEmails.length > 0 && { failed_recipients: failedEmails }),
    })
  } catch (err) {
    console.error('marketing-email error:', err)
    res.status(500).json({ success: false, error: 'خطأ داخلي في الخادم', code: 'MARKETING_EMAIL_ERROR' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/smart-bot
// ══════════════════════════════════════════════════════════════════════════════
// ── SPLIT Knowledge Base (embedded) ──────────────────────────────────────────
const SPLIT_KNOWLEDGE = `
# منصة SPLIT Intelligence — الدليل الشامل للمساعد الذكي

## ما هي منصة SPLIT؟
SPLIT Intelligence هي منصة سعودية متخصصة في التدقيق التشغيلي لمتاجر التجزئة. تعمل المنصة على تحليل كاميرات المراقبة (CCTV) بشكل تلقائي وتصدر تقارير موضوعية دقيقة عن الالتزام التشغيلي في المتجر — بدون تدخل بشري وبيانات تُخزن داخل المملكة العربية السعودية.

## ماذا تفعل المنصة؟
- تحلل كاميرات IP بروتوكول RTSP تلقائياً في أوقات محددة
- تجيب على أسئلة تدقيق مخصصة مثل: هل الموظفون يرتدون الزي الرسمي؟ هل المتجر نظيف؟ هل المنتجات مرتبة؟
- ترسل تقارير تشغيلية فورية للوحة التحكم
- تسجل حضور وانصراف الموظفين
- ترسل تنبيهات ومذكرات للفريق

## الباقات والأسعار
- الباقة الأساسية: 1 ريال/شهر — متجر واحد، 4 تدقيقات يومياً، 12 ساعة عمل/يوم، دعم فني بالتذاكر، تقارير أسبوعية
- الباقة الاحترافية: 499 ريال/شهر — حتى 3 متاجر، 12 تدقيقاً يومياً، 18 ساعة عمل/يوم، دعم أولوية، تقارير يومية، أسئلة مخصصة
- الباقة المؤسسية: 899 ريال/شهر — متاجر غير محدودة، تدقيق غير محدود، 24 ساعة/يوم، دعم مخصص، تقارير لحظية، API مخصص، SLA مضمون

## كيف أبدأ؟
1. أنشئ حساباً على المنصة من splittech.sa
2. انتظر موافقة فريق SPLIT خلال 24 ساعة
3. ثبّت برنامج SPLIT Engine على Raspberry Pi أو أي جهاز Linux
4. أضف كاميراتك ورابط RTSP
5. ابدأ في استلام تقارير التدقيق

## الكاميرات المدعومة
تدعم المنصة جميع كاميرات IP التي تعمل بروتوكول RTSP، وتشمل:
- Hikvision (أشهر الماركات)
- Dahua
- EZVIZ
- أي كاميرا IP تدعم RTSP

## رابط RTSP
الصيغة العامة: rtsp://USERNAME:PASSWORD@IP_ADDRESS:PORT/STREAM_PATH
مثال Hikvision: rtsp://admin:password@192.168.1.64:554/Streaming/Channels/101
مثال Dahua: rtsp://admin:password@192.168.1.108:554/cam/realmonitor?channel=1&subtype=0
للحصول على رابط RTSP لكاميرتك تحديداً، راجع دليل الكاميرا أو تواصل مع فريق الدعم.

## تثبيت SPLIT Engine
- يعمل على Raspberry Pi 4 (موصى به) أو أي جهاز Linux
- يحتاج اتصال إنترنت مستقر
- حمّل برنامج التثبيت من لوحة التحكم → إعداد الجهاز
- بعد التثبيت، أدخل مفتاح API الخاص بمتجرك

## لوحة التحكم
- الرئيسية: ملخص أداء المتجر وحالة الاتصال
- سجل التدقيق: جميع تقارير التدقيق مع الصور والتحليل
- التحكم: إرسال أوامر للجهاز عن بُعد
- إعداد الجهاز: إدارة كاميراتك ومفاتيح API
- الإعدادات: إدارة حسابك ومعلوماتك
- الدعم الفني: التذاكر والمحادثة

## الأسئلة الشائعة

**س: الجهاز غير متصل؟**
ج: تحقق من: (1) اتصال الإنترنت في المتجر (2) أن برنامج SPLIT Engine يعمل (3) مفتاح API صحيح في الإعدادات. إذا استمرت المشكلة افتح تذكرة دعم.

**س: الكاميرا لا تظهر صورة؟**
ج: تحقق من: (1) رابط RTSP صحيح (2) اسم المستخدم وكلمة المرور (3) أن الكاميرا على نفس الشبكة. جرب الرابط في VLC أولاً للتأكد.

**س: التقارير لا تصل؟**
ج: تأكد من: (1) الجهاز متصل (آخر نبضة أقل من 30 دقيقة) (2) ساعات العمل مضبوطة صح (3) الكاميرات مفعّلة. راجع سجل التدقيق للأخطاء.

**س: كيف أضيف متجراً جديداً؟**
ج: من الإعدادات → إدارة المتاجر → إضافة متجر. يحتاج كل متجر جهاز وكاميرات منفصلة.

**س: كيف أجدد الاشتراك؟**
ج: يتجدد الاشتراك تلقائياً. للترقية أو تغيير الباقة تواصل مع فريق SPLIT عبر support@splittech.sa

**س: أنسيت كلمة المرور؟**
ج: من صفحة تسجيل الدخول اضغط "نسيت كلمة المرور" وأدخل بريدك الإلكتروني.

**س: كيف أتواصل مع الدعم؟**
ج: عبر التذاكر في لوحة التحكم أو عبر البريد support@splittech.sa — وقت الاستجابة خلال 24 ساعة في أيام العمل.

## الأمان والخصوصية
- جميع البيانات تُخزن داخل المملكة العربية السعودية
- الصور تُحلل فورياً ولا تُخزن — خصوصية تامة
- متوافق مع نظام حماية البيانات الشخصية السعودي (PDPL)
- لا يطلع أي إنسان على صور كاميراتك
`

// ── Rules for the AI bot ──────────────────────────────────────────────────────
const BOT_SYSTEM_PROMPT = `أنت مساعد دعم فني لمنصة SPLIT Intelligence السعودية. اسمك "مساعد SPLIT".

## قواعد صارمة يجب اتباعها:
1. أجب دائماً باللغة التي يكتب بها المستخدم (عربي أو إنجليزي)
2. لا تكشف أي معلومات تقنية داخلية: لا IPs، لا passwords، لا مفاتيح API، لا تفاصيل الخوادم
3. لا تتحدث عن المنافسين بشكل سلبي
4. لا تعد بميزات أو خدمات غير موجودة حالياً
5. لا تشارك معلومات عن مستخدمين آخرين
6. إذا سألك عن معلومات حساسة أو خارج نطاق المنصة، اعتذر بلطف وأحل المستخدم للدعم
7. إذا كانت المشكلة تقنية معقدة تحتاج تدخل بشري (مثل: فشل في الدفع، حساب موقوف، مشكلة في الفاتورة) قل للمستخدم بوضوح أنك ستحيله لفريق الدعم
8. كن ودوداً ومحترفاً ومختصراً — لا تطوّل الإجابات بدون داعٍ
9. إذا لم تعرف الإجابة قل ذلك بصدق ووجّه لـ support@splittech.sa

## متى تحيل للدعم البشري؟
- مشاكل الدفع والفواتير
- الحسابات الموقوفة أو المحظورة
- طلبات الاسترداد أو الإلغاء
- أخطاء تقنية متكررة لم تُحل
- أي طلب يحتاج تدخل إداري

## معلومات المنصة:
${SPLIT_KNOWLEDGE}
`

app.post('/v1/smart-bot', async (req, res) => {
  try {
    const authHeader = req.headers['authorization']
    if (!authHeader) return res.status(401).json({ error: 'Missing authorization' })

    const token = authHeader.replace('Bearer ', '')
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })

    const { message, conversation_id } = req.body
    if (!message) return res.status(400).json({ error: 'Missing message' })

    const db = getPool()

    // Load extra KB articles from DB (if any added by admins)
    const { rows: articles } = await db.query(
      `SELECT question, answer FROM public.bot_knowledge_base WHERE is_active = TRUE LIMIT 50`
    ).catch(() => ({ rows: [] }))

    const dbKnowledge = articles.length > 0
      ? '\n\n## معلومات إضافية من قاعدة المعرفة:\n' + articles.map(a => `س: ${a.question}\nج: ${a.answer}`).join('\n\n')
      : ''

    let reply = ''

    try {
      const prompt = `${BOT_SYSTEM_PROMPT}${dbKnowledge}\n\n## رسالة المستخدم:\n${message}`
      reply = await callVertexGemini(prompt)
    } catch (e) {
      console.error('Vertex AI error:', e)
    }

    if (!reply) {
      reply = 'عذراً، واجهت مشكلة مؤقتة. يرجى التواصل مع فريق الدعم على support@splittech.sa أو فتح تذكرة دعم.'
    }

    if (conversation_id) {
      db.query(
        `INSERT INTO public.bot_conversations (id, user_id, user_message, bot_reply)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET bot_reply = EXCLUDED.bot_reply`,
        [conversation_id, user.id, message, reply]
      ).catch(() => {})
    }

    res.json({ response: reply, session_id: conversation_id || null })
  } catch (err) {
    console.error('smart-bot error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/analyze-store  — Gemini AI deep analysis of recent audit data
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/analyze-store', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })

    const db = getPool()

    // Get user's store
    const { rows: storeRows } = await db.query(
      `SELECT s.id, s.name, s.store_status, sub.status AS sub_status, sub.end_date
       FROM stores s
       LEFT JOIN subscriptions sub ON sub.store_id = s.id
       WHERE s.user_id = $1 AND s.store_status = 'active'
       ORDER BY s.created_at DESC LIMIT 1`,
      [user.id]
    )
    if (!storeRows.length) return res.status(404).json({ error: 'لا يوجد متجر نشط' })
    const store = storeRows[0]

    // Fetch last 50 audit logs
    const { rows: logs } = await db.query(`
      SELECT score, status, summary, observations, ai_reasoning, confidence_score, created_at
      FROM public.analytics_logs
      WHERE store_id = $1
      ORDER BY created_at DESC
      LIMIT 50
    `, [store.id])

    if (logs.length === 0) return res.status(200).json({
      store_name: store.name,
      analysis: 'لا توجد بيانات تدقيق كافية للتحليل. يرجى التأكد من تشغيل محرك التحليل في المتجر.',
      score_avg: 0,
      total_audits: 0,
    })

    const scoreAvg = logs.filter(l => l.score != null).reduce((s, l) => s + Number(l.score), 0) / (logs.filter(l => l.score != null).length || 1)
    const passCount = logs.filter(l => l.status === 'pass').length
    const warnCount = logs.filter(l => l.status === 'warning').length
    const failCount = logs.filter(l => l.status === 'fail').length

    // Collect unique observations
    const allObs = logs.flatMap(l => Array.isArray(l.observations) ? l.observations : [])
    const obsText = allObs.slice(0, 30).map(o => `- ${typeof o === 'string' ? o : JSON.stringify(o)}`).join('\n')

    const summaries = logs.filter(l => l.summary).slice(0, 10).map(l => `• ${l.summary}`).join('\n')

    const prompt = `أنت محلل متاجر خبير. حلّل بيانات التدقيق التالية لمتجر "${store.name}" وأعطِ تقريراً احترافياً باللغة العربية.

## إحصائيات التدقيق (آخر ${logs.length} جولة):
- متوسط النتيجة: ${Math.round(scoreAvg)}%
- جولات ناجحة: ${passCount}
- جولات تحذيرية: ${warnCount}
- جولات فاشلة: ${failCount}

## ملخصات الجولات الأخيرة:
${summaries || 'لا توجد ملخصات'}

## الملاحظات المكررة:
${obsText || 'لا توجد ملاحظات'}

## المطلوب منك:
1. **تقييم عام** للمتجر (جملتان)
2. **أبرز 3 مشاكل** تحتاج معالجة فورية
3. **3 توصيات عملية** لتحسين الأداء
4. **توقع الاتجاه** (هل الأداء يتحسن أم يتراجع؟)

اكتب التقرير بأسلوب احترافي ومختصر، مع استخدام عناوين واضحة. لا تتجاوز 400 كلمة.`

    const analysis = await callVertexGemini(prompt)

    res.json({
      store_name: store.name,
      analysis,
      score_avg: Math.round(scoreAvg),
      total_audits: logs.length,
      pass: passCount,
      warn: warnCount,
      fail: failCount,
      generated_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('analyze-store error:', err)
    res.status(500).json({ error: 'فشل التحليل: ' + err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/attendance-checkin
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/attendance-checkin', async (req, res) => {
  try {
    const authHeader = req.headers['authorization']
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' })

    const token = authHeader.replace('Bearer ', '')
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })

    if (!checkRateLimit(`attn:${user.id}`, 60_000, 12).allowed)
      return res.status(429).json({ error: 'Too many requests', code: 'RATE_LIMITED' })

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown'
    const ua = req.headers['user-agent'] || null
    const page = typeof req.body?.page === 'string' ? req.body.page : null

    const db = getPool()
    const role = await getUserRole(user.id)

    const workDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())

    const cleanIp = ip !== 'unknown' ? ip : null

    await db.query(`
      INSERT INTO public.staff_attendance (user_id, role, work_date, first_ip, last_ip, current_page, user_agent)
      VALUES ($1, $2, $3, $4, $4, $5, $6)
      ON CONFLICT (user_id, work_date) DO UPDATE SET
        last_ip = EXCLUDED.last_ip,
        last_active_at = NOW(),
        current_page = COALESCE(EXCLUDED.current_page, staff_attendance.current_page)
    `, [user.id, role, workDate, cleanIp, page, ua])

    await db.query(
      `INSERT INTO public.staff_presence_events (user_id, role, event, page, ip, user_agent)
       VALUES ($1, $2, 'login', $3, $4, $5)`,
      [user.id, role, page, cleanIp, ua]
    )

    res.json({ ok: true, work_date: workDate, role })
  } catch (err) {
    console.error('attendance-checkin error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/attendance-punch
// Direct route replacing PostgREST /rpc/attendance_punch.
// PostgREST receives the service-role key (not the user JWT), so auth.uid()
// returns NULL inside SECURITY DEFINER functions — causing 400 errors.
// This route verifies the JWT itself and runs the logic via direct pg.
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/attendance-punch', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Invalid token' })

    const page = typeof req.body?._page === 'string' ? req.body._page : null
    const ua   = typeof req.body?._ua   === 'string' ? req.body._ua   : (req.headers['user-agent'] || null)
    const db   = getPool()
    const role = await getUserRole(user.id)
    const workDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())

    const { rows } = await db.query(`
      INSERT INTO public.staff_attendance (user_id, role, work_date, current_page, user_agent)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, work_date) DO UPDATE
        SET last_active_at = NOW(),
            current_page   = COALESCE(EXCLUDED.current_page, staff_attendance.current_page),
            user_agent     = COALESCE(EXCLUDED.user_agent,   staff_attendance.user_agent),
            updated_at     = NOW()
      RETURNING id`,
      [user.id, role, workDate, page, ua]
    )

    await db.query(
      `INSERT INTO public.staff_presence_events (user_id, role, event, page, user_agent)
       VALUES ($1, $2, 'login', $3, $4)`,
      [user.id, role, page, ua]
    )

    res.json({ ok: true, id: rows[0]?.id })
  } catch (err) {
    console.error('attendance-punch error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/attendance-heartbeat  — direct route replacing PostgREST RPC
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/attendance-heartbeat', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Invalid token' })

    const page     = typeof req.body?._page === 'string' ? req.body._page : null
    const isActive = req.body?._is_active !== false
    const delta    = Math.max(0, parseInt(req.body?._delta_seconds) || 60)
    const db       = getPool()
    const role     = await getUserRole(user.id)
    const workDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())

    await db.query(
      `INSERT INTO public.staff_attendance (user_id, role, work_date, current_page)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, work_date) DO NOTHING`,
      [user.id, role, workDate, page]
    )

    await db.query(
      `UPDATE public.staff_attendance
          SET last_active_at  = NOW(),
              current_page    = COALESCE($3, current_page),
              heartbeat_count = heartbeat_count + 1,
              active_seconds  = active_seconds  + CASE WHEN $4 THEN $5 ELSE 0 END,
              idle_seconds    = idle_seconds    + CASE WHEN $4 THEN 0 ELSE $5 END,
              updated_at      = NOW()
        WHERE user_id = $1 AND work_date = $2`,
      [user.id, workDate, page, isActive, delta]
    )

    res.json({ ok: true })
  } catch (err) {
    console.error('attendance-heartbeat error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/attendance-punch-out  — direct route replacing PostgREST RPC
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/attendance-punch-out', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Invalid token' })

    const db = getPool()
    const role = await getUserRole(user.id)
    const workDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())

    await db.query(
      `UPDATE public.staff_attendance SET check_out_at = NOW(), updated_at = NOW()
        WHERE user_id = $1 AND work_date = $2`,
      [user.id, workDate]
    )
    await db.query(
      `INSERT INTO public.staff_presence_events (user_id, role, event)
       VALUES ($1, $2, 'logout')`,
      [user.id, role]
    )

    res.json({ ok: true })
  } catch (err) {
    console.error('attendance-punch-out error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/update-camera  — Electron app saves RTSP URL to DB
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/update-camera', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.headers['apikey']
    if (!apiKey) return res.status(401).json({ error: 'مفتاح API مطلوب' })

    const keyRecord = await validateApiKey(apiKey)
    if (!keyRecord?.is_active) return res.status(401).json({ error: 'مفتاح API غير صحيح' })

    const { rtsp_url, camera_ip, camera_username, network_mode } = req.body
    if (!rtsp_url) return res.status(400).json({ error: 'rtsp_url مطلوب' })

    const db = getPool()
    await db.query(
      `UPDATE public.stores SET rtsp_url=$1, camera_ip=$2, camera_username=$3, network_mode=$4 WHERE id=$5`,
      [rtsp_url, camera_ip || null, camera_username || null, network_mode || 'single_network', keyRecord.store_id]
    )

    res.json({ success: true, message: 'تم حفظ إعدادات الكاميرا' })
  } catch (err) {
    console.error('update-camera error:', err)
    res.status(500).json({ error: 'خطأ داخلي' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/network-speed-report
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/network-speed-report', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.headers['apikey']
    if (!apiKey) return res.status(401).json({ error: 'API key required' })

    if (!checkRateLimit(`speed:${apiKey}`, 60_000, 30).allowed)
      return res.status(429).json({ error: 'Rate limit exceeded' })

    const keyRecord = await validateApiKey(apiKey)
    if (!keyRecord?.is_active) return res.status(401).json({ error: 'Invalid API key' })
    if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date())
      return res.status(403).json({ error: 'License expired' })

    const { store_id, source = 'local_merchant', download_mbps, latency_ms, upload_ok, verdict } = req.body
    if (download_mbps == null || latency_ms == null || upload_ok == null)
      return res.status(400).json({ error: 'download_mbps, latency_ms, upload_ok are required' })
    if (store_id && store_id !== keyRecord.store_id)
      return res.status(403).json({ error: 'store_id mismatch' })

    const targetId = store_id || keyRecord.store_id
    const db = getPool()
    const { rows } = await db.query(`
      INSERT INTO public.network_speed_tests (store_id, source, download_mbps, latency_ms, upload_ok, verdict, raw_payload)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, created_at
    `, [targetId, source, Number(download_mbps), Number(latency_ms), Boolean(upload_ok), verdict || null, JSON.stringify(req.body)])

    res.json({ success: true, id: rows[0].id, created_at: rows[0].created_at })
  } catch (err) {
    console.error('network-speed-report error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/emergency-broadcast
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/emergency-broadcast', async (req, res) => {
  try {
    const authHeader = req.headers['authorization']
    if (!authHeader) return res.status(401).json({ error: 'Missing authorization' })

    const token = authHeader.replace('Bearer ', '')
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })

    const role = await getUserRole(user.id)
    if (!['super_owner', 'it_support'].includes(role))
      return res.status(403).json({ error: 'Admin access required' })

    const {
      title, message, severity = 'warning',
      target_scope = 'all', target_tier, target_store_ids,
      expires_in_minutes = 60, kill_signal = false, kill_reason,
    } = req.body
    if (!title || !message) return res.status(400).json({ error: 'Missing title or message' })

    const expiresAt = new Date(Date.now() + expires_in_minutes * 60_000).toISOString()

    const db = getPool()
    const { rows } = await db.query(`
      INSERT INTO public.emergency_broadcasts
        (title, message, severity, target_scope, target_tier, target_store_ids,
         expires_at, is_active, kill_signal, kill_reason, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10)
      RETURNING *
    `, [
      title, message, severity, target_scope,
      target_tier || null,
      target_store_ids ? JSON.stringify(target_store_ids) : null,
      expiresAt, kill_signal, kill_reason || null, user.id
    ])

    res.json({ success: true, broadcast: rows[0] })
  } catch (err) {
    console.error('emergency-broadcast error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/rollback
// actions: list_snapshots | create_snapshot | apply_rollback
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/rollback', async (req, res) => {
  try {
    const authHeader = req.headers['authorization']
    if (!authHeader) return res.status(401).json({ error: 'Missing authorization' })

    const token = authHeader.replace('Bearer ', '')
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })

    const callerRole = await getUserRole(user.id)
    if (!['super_owner', 'it_support'].includes(callerRole))
      return res.status(403).json({ error: 'Admin access required' })

    const { action, store_id, snapshot_id, reason } = req.body
    const db = getPool()

    // ── list snapshots ────────────────────────────────────────────────────
    if (action === 'list_snapshots') {
      if (!store_id) return res.status(400).json({ error: 'store_id مطلوب' })
      const { rows } = await db.query(
        `SELECT id, store_id, label, reason, created_by, created_at
         FROM public.config_snapshots
         WHERE store_id = $1
         ORDER BY created_at DESC LIMIT 20`,
        [store_id]
      )
      return res.json({ success: true, snapshots: rows })
    }

    // ── create snapshot ───────────────────────────────────────────────────
    if (action === 'create_snapshot') {
      if (!store_id) return res.status(400).json({ error: 'store_id مطلوب' })
      const { rows: storeRows } = await db.query(
        `SELECT id, name, store_status, verification_status, rtsp_url,
                camera_ip, camera_username, network_mode, interval_minutes
         FROM public.stores WHERE id = $1`,
        [store_id]
      )
      if (!storeRows[0]) return res.status(404).json({ error: 'المتجر غير موجود' })

      const { rows } = await db.query(
        `INSERT INTO public.config_snapshots (store_id, label, snapshot_data, reason, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, label, created_at`,
        [
          store_id,
          `لقطة ${new Date().toLocaleDateString('ar-SA')}`,
          JSON.stringify(storeRows[0]),
          reason || 'Manual snapshot',
          user.id,
        ]
      )
      return res.json({ success: true, snapshot: rows[0] })
    }

    // ── apply rollback ────────────────────────────────────────────────────
    if (action === 'apply_rollback') {
      if (!snapshot_id) return res.status(400).json({ error: 'snapshot_id مطلوب' })

      const { rows: snapRows } = await db.query(
        `SELECT * FROM public.config_snapshots WHERE id = $1`,
        [snapshot_id]
      )
      if (!snapRows[0]) return res.status(404).json({ error: 'اللقطة غير موجودة' })

      const snap = snapRows[0]
      const data = typeof snap.snapshot_data === 'string'
        ? JSON.parse(snap.snapshot_data)
        : snap.snapshot_data

      // Restore safe fields only
      await db.query(
        `UPDATE public.stores SET
           store_status       = $2,
           rtsp_url           = $3,
           camera_ip          = $4,
           camera_username    = $5,
           network_mode       = $6,
           interval_minutes   = $7,
           updated_at         = NOW()
         WHERE id = $1`,
        [
          snap.store_id,
          data.store_status,
          data.rtsp_url,
          data.camera_ip,
          data.camera_username,
          data.network_mode,
          data.interval_minutes,
        ]
      )

      db.query(
        `INSERT INTO public.rollback_log (store_id, snapshot_id, rolled_back_by, reason)
         VALUES ($1, $2, $3, $4)`,
        [snap.store_id, snapshot_id, user.id, reason || 'Manual rollback']
      ).catch(() => {})

      return res.json({ success: true, rolled_back_to: snapshot_id })
    }

    // ── legacy direct call (store_id + snapshot_id in body, no action) ───
    if (!action && store_id && snapshot_id) {
      const { rows: snapRows } = await db.query(
        `SELECT id FROM public.config_snapshots WHERE id = $1 AND store_id = $2`,
        [snapshot_id, store_id]
      )
      if (!snapRows[0]) return res.status(404).json({ error: 'Snapshot not found' })
      await db.query(`UPDATE public.stores SET updated_at = NOW() WHERE id = $1`, [store_id])
      db.query(
        `INSERT INTO public.rollback_log (store_id, snapshot_id, rolled_back_by, reason) VALUES ($1, $2, $3, $4)`,
        [store_id, snapshot_id, user.id, reason || 'Manual rollback']
      ).catch(() => {})
      return res.json({ success: true, rolled_back_to: snapshot_id })
    }

    res.status(400).json({ error: 'action غير معروف. المقبول: list_snapshots | create_snapshot | apply_rollback' })
  } catch (err) {
    console.error('rollback error:', err)
    res.status(500).json({ error: err.message || 'Internal server error' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/admin/approve-store  — direct SQL bypass (no PostgREST dependency)
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/admin/approve-store', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Unauthorized' })

    const gotureUser = await verifyToken(token)
    if (!gotureUser) return res.status(401).json({ error: 'Invalid token' })

    const { store_id } = req.body
    if (!store_id) return res.status(400).json({ error: 'store_id required' })

    const db = getPool()

    // Verify caller is admin
    const callerRole = await getUserRole(gotureUser.id)
    if (!['super_owner', 'it_support'].includes(callerRole)) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    // Get store + subscription + owner email
    const { rows: storeRows } = await db.query(
      `SELECT s.*, p.email AS owner_email
       FROM stores s
       LEFT JOIN auth.users p ON p.id = s.user_id
       WHERE s.id = $1`, [store_id]
    )
    if (!storeRows.length) return res.status(404).json({ error: 'Store not found' })
    const store = storeRows[0]

    const licenseKey = 'SPL-' + crypto.randomBytes(8).toString('hex').toUpperCase()
    const apiKey     = crypto.randomBytes(32).toString('hex')

    await db.query('BEGIN')
    try {
      // Approve store
      await db.query(`
        UPDATE stores SET
          store_status        = 'active',
          verification_status = 'verified',
          verification_notes  = 'تم الاعتماد من الإدارة',
          reviewed_at         = now()
        WHERE id = $1
      `, [store_id])

      // Activate subscription
      if (store.subscription_id) {
        await db.query(`
          UPDATE subscriptions SET
            status     = 'active',
            start_date = CURRENT_DATE,
            end_date   = CURRENT_DATE + interval '30 days'
          WHERE id = $1
        `, [store.subscription_id])
      }

      // Upsert API key (DELETE + INSERT avoids ON CONFLICT constraint requirement)
      await db.query(`DELETE FROM store_api_keys WHERE store_id = $1`, [store_id])
      await db.query(`
        INSERT INTO store_api_keys (store_id, license_key, api_key, key_preview, is_active, activated_at)
        VALUES ($1, $2, $3, $4, true, now())
      `, [store_id, licenseKey, apiKey, licenseKey.slice(0, 12) + '...'])

      await db.query('COMMIT')
    } catch (txErr) {
      await db.query('ROLLBACK')
      throw txErr
    }

    // Notify merchant
    const APP_URL = process.env.APP_URL || 'https://app.splittech.sa'
    if (store.owner_email) {
      sendMail(
        store.owner_email,
        'تم اعتماد متجرك في منصة SPLIT Intelligence',
        emailLayout(
          `تم اعتماد متجرك ${store.name || ''}`,
          `<h2 style="color:#1F2937;font-size:22px;font-weight:700;margin:0 0 6px;">تم اعتماد متجرك بنجاح</h2>
          <p style="color:#6B7280;font-size:14px;margin:0 0 24px;">تحقق فريق الـ IT من بياناتك وفعّل حسابك</p>

          <p style="color:#374151;font-size:15px;line-height:1.8;margin:0 0 20px;">
            تم التحقق من بيانات متجرك <strong>${store.name || ''}</strong> وتفعيله بنجاح.
            يمكنك الآن الدخول للوحة التحكم والبدء باستخدام المنصة.
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="background:#F0FDF4;border-radius:12px;margin:0 0 28px;">
            <tr><td style="padding:18px 24px;">
              <p style="color:#166534;font-size:13px;font-weight:600;margin:0 0 8px;">تفاصيل الحساب</p>
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="color:#6B7280;font-size:13px;padding-left:16px;white-space:nowrap;">مفتاح الترخيص:</td>
                  <td style="color:#1F2937;font-size:13px;font-family:monospace;font-weight:700;">${licenseKey}</td>
                </tr>
                <tr>
                  <td style="color:#6B7280;font-size:13px;padding-left:16px;padding-top:6px;white-space:nowrap;">مدة التجربة:</td>
                  <td style="color:#1F2937;font-size:13px;padding-top:6px;">30 يوماً مجاناً</td>
                </tr>
              </table>
            </td></tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td align="center" style="padding:0 0 24px;">
              <a href="${APP_URL}/dashboard"
                 style="display:inline-block;background:#005F2D;color:#ffffff;font-size:15px;font-weight:700;
                        padding:14px 44px;border-radius:10px;text-decoration:none;">
                الذهاب للوحة التحكم
              </a>
            </td></tr>
          </table>

          <p style="color:#9CA3AF;font-size:13px;line-height:1.7;margin:0;border-top:1px solid #F3F4F6;padding-top:20px;">
            احتفظ بمفتاح الترخيص في مكان آمن. للمساعدة:
            <a href="mailto:support@splittech.sa" style="color:#005F2D;">support@splittech.sa</a>
          </p>`
        )
      ).catch(e => console.error('merchant-approve-notify error:', e))
    }

    logAdminAction(gotureUser.id, callerRole, 'approve_store', 'store', store_id, { store_name: store.name })
    res.json({ success: true, license_key: licenseKey })
  } catch (err) {
    console.error('approve-store error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/admin/reject-store
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/admin/reject-store', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const gotureUser = await verifyToken(token)
    if (!gotureUser) return res.status(401).json({ error: 'Unauthorized' })

    const { store_id, reason } = req.body
    if (!store_id) return res.status(400).json({ error: 'store_id required' })

    const db = getPool()
    const rejectCallerRole = await getUserRole(gotureUser.id)
    if (!['super_owner', 'it_support', 'customer_support'].includes(rejectCallerRole)) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const { rows: rejStoreRows } = await db.query(
      `SELECT s.name, p.email AS owner_email
       FROM stores s LEFT JOIN auth.users p ON p.id = s.user_id
       WHERE s.id = $1`, [store_id]
    )

    await db.query(`
      UPDATE stores SET
        store_status        = 'inactive',
        verification_status = 'rejected',
        rejection_reason    = $2,
        verification_notes  = $2,
        reviewed_at         = now()
      WHERE id = $1
    `, [store_id, reason || 'تم رفض الطلب'])

    // Cancel any pending/unpaid subscription linked to this store's user
    await db.query(`
      UPDATE public.subscriptions
         SET status = 'cancelled', updated_at = NOW()
       WHERE user_id = (SELECT user_id FROM stores WHERE id = $1)
         AND status = 'pending'
    `, [store_id])

    // Notify merchant
    const rejStore = rejStoreRows[0]
    if (rejStore?.owner_email) {
      sendMail(
        rejStore.owner_email,
        'تحديث على طلب تفعيل متجرك — SPLIT Intelligence',
        emailLayout(
          'تحديث على طلب التفعيل الخاص بمتجرك',
          `<h2 style="color:#1F2937;font-size:22px;font-weight:700;margin:0 0 6px;">تحديث على طلب التفعيل</h2>
          <p style="color:#6B7280;font-size:14px;margin:0 0 24px;">بخصوص متجرك في منصة SPLIT Intelligence</p>

          <p style="color:#374151;font-size:15px;line-height:1.8;margin:0 0 20px;">
            نشكرك على تقديم طلب تفعيل متجرك <strong>${rejStore.name || ''}</strong>.
            بعد مراجعة فريق الـ IT، تعذّر قبول الطلب في الوقت الحالي.
          </p>

          ${reason ? `
          <table width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="background:#FEF2F2;border-radius:12px;margin:0 0 24px;">
            <tr><td style="padding:16px 20px;">
              <p style="color:#991B1B;font-size:13px;font-weight:600;margin:0 0 6px;">سبب الرفض:</p>
              <p style="color:#374151;font-size:14px;margin:0;line-height:1.7;">${reason}</p>
            </td></tr>
          </table>` : ''}

          <table width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="background:#F0FDF4;border-radius:12px;margin:0 0 28px;">
            <tr><td style="padding:16px 20px;">
              <p style="color:#166534;font-size:13px;font-weight:600;margin:0 0 8px;">الخطوات التالية:</p>
              <p style="color:#374151;font-size:14px;margin:0;line-height:1.8;">
                يمكنك تصحيح البيانات وإعادة تقديم طلب التفعيل من داخل لوحة التحكم،
                أو التواصل مع فريق الدعم للحصول على مساعدة.
              </p>
            </td></tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td align="center" style="padding:0 0 24px;">
              <a href="mailto:support@splittech.sa"
                 style="display:inline-block;background:#005F2D;color:#ffffff;font-size:15px;font-weight:700;
                        padding:14px 44px;border-radius:10px;text-decoration:none;">
                التواصل مع الدعم
              </a>
            </td></tr>
          </table>`
        )
      ).catch(e => console.error('merchant-reject-notify error:', e))
    }

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/admin/approve-camera-change  — admin applies new camera settings
//   from a merchant's support ticket, then resolves the ticket.
// Body: { ticket_id, store_id, rtsp_url, camera_ip?, camera_username? }
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/admin/approve-camera-change', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Unauthorized' })

    const callerUser = await verifyToken(token)
    if (!callerUser) return res.status(401).json({ error: 'Invalid token' })

    const { ticket_id, store_id, rtsp_url, camera_ip, camera_username } = req.body
    if (!ticket_id || !store_id || !rtsp_url) {
      return res.status(400).json({ error: 'ticket_id, store_id, and rtsp_url are required' })
    }

    const db = getPool()
    const callerRole = await getUserRole(callerUser.id)
    if (!['super_owner', 'it_support'].includes(callerRole)) {
      return res.status(403).json({ error: 'Forbidden — IT Support or Super Owner required' })
    }

    // Verify the store exists and belongs to this ticket
    const { rows: storeRows } = await db.query(
      `SELECT s.id, s.name, p.email AS owner_email
       FROM stores s
       LEFT JOIN auth.users p ON p.id = s.user_id
       WHERE s.id = $1`,
      [store_id]
    )
    if (!storeRows.length) return res.status(404).json({ error: 'Store not found' })
    const store = storeRows[0]

    // Verify the ticket exists and belongs to this store
    const { rows: ticketRows } = await db.query(
      `SELECT id, title FROM support_tickets WHERE id = $1 AND store_id = $2`,
      [ticket_id, store_id]
    )
    if (!ticketRows.length) return res.status(404).json({ error: 'Ticket not found or store mismatch' })

    await db.query('BEGIN')
    try {
      // Apply the new camera settings to the store
      await db.query(
        `UPDATE stores
            SET rtsp_url        = $1,
                camera_ip       = $2,
                camera_username = $3
          WHERE id = $4`,
        [rtsp_url, camera_ip || null, camera_username || null, store_id]
      )

      // Resolve the support ticket and note who approved it
      await db.query(
        `UPDATE support_tickets
            SET status      = 'resolved',
                updated_at  = now()
          WHERE id = $1`,
        [ticket_id]
      )

      await db.query('COMMIT')
    } catch (txErr) {
      await db.query('ROLLBACK')
      throw txErr
    }

    // Log the admin action
    logAdminAction(callerUser.id, callerRole, 'approve_camera_change', 'store', store_id, {
      store_name: store.name,
      ticket_id,
      camera_ip: camera_ip || null,
      camera_username: camera_username || null,
    })

    res.json({ success: true })
  } catch (err) {
    console.error('approve-camera-change error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /v1/admin/stores  — full store list for admin panel (bypasses PostgREST)
// Returns all columns including new ones PostgREST schema cache may not know about
// ══════════════════════════════════════════════════════════════════════════════
app.get('/v1/admin/stores', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const gotureUser = await verifyToken(token)
    if (!gotureUser) return res.status(401).json({ error: 'Unauthorized' })
    const callerRole = await getUserRole(gotureUser.id)
    if (!['super_owner', 'it_support', 'customer_support'].includes(callerRole))
      return res.status(403).json({ error: 'Forbidden' })

    const db = getPool()
    const { rows } = await db.query(`
      SELECT
        s.id, s.name, s.user_id, s.subscription_id,
        s.store_status, s.verification_status, s.rejection_reason, s.verification_notes,
        s.rtsp_url, s.camera_ip, s.camera_username, s.rtsp_password_encrypted,
        s.network_mode, s.hardware_choice, s.interval_minutes, s.debug_mode,
        s.remote_command, s.admin_override_signal,
        s.working_hours,         s.working_hours_approved,
        s.pending_working_hours,
        s.custom_questions,      s.custom_questions_approved,
        s.pending_custom_questions,
        s.last_heartbeat, s.reviewed_at,
        s.verification_requested_at, s.created_at, s.updated_at,
        -- Profile columns (only what profiles table actually has)
        p.id        AS profile_id,
        p.full_name,
        p.phone,
        p.company_name,
        -- Subscription
        sub.id        AS sub_id,
        sub.status    AS sub_status,
        sub.tier      AS sub_tier,
        sub.end_date  AS sub_end_date,
        sub.monthly_amount
      FROM public.stores s
      LEFT JOIN public.profiles p         ON p.id  = s.user_id
      LEFT JOIN public.subscriptions sub  ON sub.id = s.subscription_id
      ORDER BY s.created_at DESC
    `)

    // Shape into the same nested format the frontend expects
    const stores = rows.map(r => ({
      id:                        r.id,
      name:                      r.name,
      user_id:                   r.user_id,
      subscription_id:           r.subscription_id,
      store_status:              r.store_status,
      verification_status:       r.verification_status,
      rejection_reason:          r.rejection_reason,
      verification_notes:        r.verification_notes,
      rtsp_url:                  r.rtsp_url,
      camera_ip:                 r.camera_ip,
      camera_username:           r.camera_username,
      rtsp_password_encrypted:   r.rtsp_password_encrypted,
      network_mode:              r.network_mode,
      hardware_choice:           r.hardware_choice,
      interval_minutes:          r.interval_minutes,
      debug_mode:                r.debug_mode,
      remote_command:            r.remote_command,
      admin_override_signal:     r.admin_override_signal,
      working_hours:             r.working_hours,
      working_hours_approved:    r.working_hours_approved,
      pending_working_hours:     r.pending_working_hours,
      custom_questions:          r.custom_questions          ?? [],
      custom_questions_approved: r.custom_questions_approved ?? false,
      pending_custom_questions:  r.pending_custom_questions  ?? [],
      last_heartbeat:            r.last_heartbeat,
      reviewed_at:               r.reviewed_at,
      verification_requested_at: r.verification_requested_at,
      created_at:                r.created_at,
      updated_at:                r.updated_at,
      // Nested profile object (same shape as supabase join)
      profiles: r.profile_id ? {
        id:           r.profile_id,
        full_name:    r.full_name,
        phone:        r.phone,
        company_name: r.company_name,
      } : null,
      // Nested subscriptions array (same shape as supabase join)
      subscriptions: r.sub_id ? [{
        id:             r.sub_id,
        status:         r.sub_status,
        tier:           r.sub_tier,
        end_date:       r.sub_end_date,
        monthly_amount: r.monthly_amount,
      }] : [],
    }))

    res.json(stores)
  } catch (err) {
    console.error('admin/stores error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/admin/approve-questions  — approve pending custom audit questions
// Bypasses PostgREST (uses direct SQL) to avoid schema-cache issues with new cols
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/admin/approve-questions', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const gotureUser = await verifyToken(token)
    if (!gotureUser) return res.status(401).json({ error: 'Unauthorized' })
    const callerRole = await getUserRole(gotureUser.id)
    if (!['super_owner', 'it_support', 'customer_support'].includes(callerRole))
      return res.status(403).json({ error: 'Forbidden' })

    const { store_id } = req.body
    if (!store_id) return res.status(400).json({ error: 'store_id مطلوب' })

    const db = getPool()
    const { rows } = await db.query(
      `SELECT pending_custom_questions FROM public.stores WHERE id = $1`,
      [store_id]
    )
    if (!rows.length) return res.status(404).json({ error: 'متجر غير موجود' })

    const pending = rows[0].pending_custom_questions ?? []
    await db.query(
      `UPDATE public.stores
          SET custom_questions          = $1::jsonb,
              custom_questions_approved = true,
              pending_custom_questions  = '[]'::jsonb
        WHERE id = $2`,
      [JSON.stringify(pending), store_id]
    )
    res.json({ success: true })
  } catch (err) {
    console.error('approve-questions error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/admin/reject-questions  — reject pending custom audit questions
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/admin/reject-questions', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const gotureUser = await verifyToken(token)
    if (!gotureUser) return res.status(401).json({ error: 'Unauthorized' })
    const callerRole = await getUserRole(gotureUser.id)
    if (!['super_owner', 'it_support', 'customer_support'].includes(callerRole))
      return res.status(403).json({ error: 'Forbidden' })

    const { store_id } = req.body
    if (!store_id) return res.status(400).json({ error: 'store_id مطلوب' })

    const db = getPool()
    const { rows } = await db.query(`SELECT id FROM public.stores WHERE id = $1`, [store_id])
    if (!rows.length) return res.status(404).json({ error: 'متجر غير موجود' })

    await db.query(
      `UPDATE public.stores
          SET pending_custom_questions  = '[]'::jsonb,
              custom_questions_approved = false
        WHERE id = $1`,
      [store_id]
    )
    res.json({ success: true })
  } catch (err) {
    console.error('reject-questions error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/admin/approve-working-hours  — approve pending working hours
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/admin/approve-working-hours', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const gotureUser = await verifyToken(token)
    if (!gotureUser) return res.status(401).json({ error: 'Unauthorized' })
    const callerRole = await getUserRole(gotureUser.id)
    if (!['super_owner', 'it_support', 'customer_support'].includes(callerRole))
      return res.status(403).json({ error: 'Forbidden' })

    const { store_id } = req.body
    if (!store_id) return res.status(400).json({ error: 'store_id مطلوب' })

    const db = getPool()
    const { rows } = await db.query(
      `SELECT pending_working_hours FROM public.stores WHERE id = $1`,
      [store_id]
    )
    if (!rows.length) return res.status(404).json({ error: 'متجر غير موجود' })

    const pending = rows[0].pending_working_hours
    await db.query(
      `UPDATE public.stores
          SET working_hours          = $1::jsonb,
              pending_working_hours  = NULL,
              working_hours_approved = true
        WHERE id = $2`,
      [JSON.stringify(pending), store_id]
    )
    res.json({ success: true })
  } catch (err) {
    console.error('approve-working-hours error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/payment/initiate  — create Moyasar payment for a subscription
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/payment/initiate', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Invalid token' })

    const { subscription_id, tier: tierBody, cycle: cycleBody } = req.body
    if (!subscription_id) return res.status(400).json({ error: 'subscription_id required' })

    const VISION_MONTHLY = { basic: 1, pro: 219, enterprise: 269 }
    const VISION_ANNUAL = { basic: 1, pro: 1999, enterprise: 2499 }
    const VOICE_MONTHLY = { voice_basic: 199, voice_pro: 299, voice_enterprise: 499 }
    const VOICE_ANNUAL = { voice_basic: 1799, voice_pro: 2699, voice_enterprise: 4499 }

    const db = getPool()
    const hasServiceColumn = await hasSubscriptionsServiceColumn(db)
    const { rows } = await db.query(
      `SELECT id, user_id, tier, monthly_amount, status, ${hasServiceColumn ? 'service' : 'NULL AS service'}
         FROM subscriptions
        WHERE id = $1`,
      [subscription_id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Subscription not found' })
    const sub = rows[0]
    sub.service = sub.service || inferSubscriptionServiceFromTier(sub.tier)
    if (sub.user_id !== user.id) return res.status(403).json({ error: 'Forbidden' })

    const billingCycle = cycleBody === 'annual' ? 'annual' : 'monthly'
    let tier = tierBody || sub.tier
    if (sub.service === 'voice' && tier && !String(tier).startsWith('voice_')) {
      return res.status(400).json({ error: 'Invalid tier for voice subscription' })
    }
    if (sub.service === 'vision' && tier && String(tier).startsWith('voice_')) {
      return res.status(400).json({ error: 'Invalid tier for vision subscription' })
    }

    let chargeSar = Number(sub.monthly_amount) || 0
    let monthlyDisplay = chargeSar

    if (sub.service === 'voice') {
      const m = VOICE_MONTHLY[tier]
      const a = VOICE_ANNUAL[tier]
      if (!m || !a) return res.status(400).json({ error: 'Invalid voice tier' })
      monthlyDisplay = m
      chargeSar = billingCycle === 'annual' ? a : m
    } else {
      const m = VISION_MONTHLY[tier]
      const a = VISION_ANNUAL[tier]
      if (!m || !a) return res.status(400).json({ error: 'Invalid vision tier' })
      monthlyDisplay = m
      chargeSar = billingCycle === 'annual' ? a : m
    }

    await db.query(
      `UPDATE subscriptions SET tier = $1, monthly_amount = $2, updated_at = NOW() WHERE id = $3`,
      [tier, monthlyDisplay, subscription_id]
    )

    const MOYASAR_SECRET = process.env.MOYASAR_SECRET_KEY
    if (!MOYASAR_SECRET) return res.status(503).json({ error: 'Payment gateway not configured' })

    const APP_URL = process.env.APP_URL || 'https://app.splittech.sa'
    const amountHalala = Math.round(Number(chargeSar) * 100)
    const svcLabel = sub.service === 'voice' ? 'Voice' : 'Vision'
    const description = `SPLIT ${svcLabel} ${tier} — ${chargeSar} SAR (${billingCycle})`

    const expiredAt = new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 min TTL

    const invoiceRes = await fetch('https://api.moyasar.com/v1/invoices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + Buffer.from(MOYASAR_SECRET + ':').toString('base64'),
      },
      body: JSON.stringify({
        amount: amountHalala,
        currency: 'SAR',
        description,
        success_url: `${APP_URL}/payment/callback?subscription_id=${subscription_id}`,
        back_url: `${APP_URL}/dashboard/billing`,
        expired_at: expiredAt,
        metadata: { subscription_id, billing_cycle: billingCycle },
      }),
    })

    if (!invoiceRes.ok) {
      const errBody = await invoiceRes.text()
      console.error('[payment-initiate] Moyasar invoice error:', invoiceRes.status, errBody)
      return res.status(502).json({ error: 'Failed to create payment invoice' })
    }

    const invoice = await invoiceRes.json()
    if (!invoice.url) {
      console.error('[payment-initiate] Moyasar invoice missing url:', invoice)
      return res.status(502).json({ error: 'Payment gateway returned no checkout URL' })
    }

    res.json({ success: true, invoice_url: invoice.url, subscription_id, billing_cycle: billingCycle })
  } catch (err) {
    console.error('payment-initiate error:', err)
    res.status(500).json({ error: err.message || 'Payment gateway error' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// Shared: verify payment with Moyasar and activate subscription if paid
// ══════════════════════════════════════════════════════════════════════════════
// ── Record 150 SAR referral commission on FIRST successful payment ────────────
// Called from both verifyAndActivate (frontend-redirect flow) and the
// Moyasar webhook (server push flow). The UNIQUE constraint on store_user_id
// ensures the commission is created only once even if both fire.
async function recordReferralCommission(db, userId) {
  if (!userId) return
  try {
    // Look up the referral code the user entered at signup
    const { rows: prof } = await db.query(
      `SELECT referral_code_used FROM public.profiles WHERE id = $1`, [userId]
    )
    const code = prof[0]?.referral_code_used
    if (!code) return // user didn't use a referral code

    // Find the active associate who owns this code
    const { rows: assoc } = await db.query(
      `SELECT id FROM public.marketing_associate_profile
       WHERE UPPER(referral_code) = UPPER($1) AND is_active = TRUE LIMIT 1`,
      [code]
    )
    if (!assoc.length) return

    const associateId = assoc[0].id

    // Resolve store name + email for the record
    const { rows: storeInfo } = await db.query(
      `SELECT s.name AS store_name, u.email
         FROM public.stores s
         JOIN auth.users u ON u.id = s.user_id
        WHERE s.user_id = $1 LIMIT 1`,
      [userId]
    )
    const storeName  = storeInfo[0]?.store_name || ''
    const storeEmail = storeInfo[0]?.email       || ''

    // Insert commission (UNIQUE on store_user_id — second call is a no-op)
    const { rows: inserted } = await db.query(
      `INSERT INTO public.marketing_referral_conversions
         (associate_id, referral_code, store_user_id, store_name, store_email, commission_amount, status)
       VALUES ($1, UPPER($2), $3, $4, $5, 150, 'pending')
       ON CONFLICT (store_user_id) DO NOTHING
       RETURNING id`,
      [associateId, code, userId, storeName, storeEmail]
    )

    if (!inserted.length) return // commission already recorded — skip balance update

    // Increment associate's pending balance
    await db.query(
      `UPDATE public.marketing_associate_profile
         SET pending_commissions_sar = COALESCE(pending_commissions_sar, 0) + 150,
             total_conversions       = COALESCE(total_conversions, 0) + 1
       WHERE id = $1`,
      [associateId]
    )
    console.log(`[referral] 150 SAR commission recorded — code=${code} associate=${associateId} store_user=${userId}`)
  } catch (err) {
    console.error('[referral] commission recording failed (non-fatal):', err.message)
  }
}

async function verifyAndActivate(db, paymentId, userId, subscriptionIdHint = null) {
  const MOYASAR_SECRET = process.env.MOYASAR_SECRET_KEY
  if (!MOYASAR_SECRET) throw new Error('Payment gateway not configured')

  const verifyRes = await fetch(`https://api.moyasar.com/v1/payments/${paymentId}`, {
    headers: { Authorization: 'Basic ' + Buffer.from(MOYASAR_SECRET + ':').toString('base64') },
  })
  if (!verifyRes.ok) throw new Error('Payment not found at Moyasar')
  const payment = await verifyRes.json()

  if (payment.status !== 'paid') return { status: payment.status, activated: false }

  // Resolve subscription_id: prefer metadata, fall back to hint from success_url
  let subscriptionId = payment.metadata?.subscription_id || subscriptionIdHint

  // If still not found, try resolving via the invoice linked to this payment
  if (!subscriptionId && payment.invoice_id) {
    try {
      const invRes = await fetch(`https://api.moyasar.com/v1/invoices/${payment.invoice_id}`, {
        headers: { Authorization: 'Basic ' + Buffer.from(MOYASAR_SECRET + ':').toString('base64') },
      })
      if (invRes.ok) {
        const inv = await invRes.json()
        subscriptionId = inv.metadata?.subscription_id
      }
    } catch (_) {}
  }

  if (!subscriptionId) {
    console.error('[verifyAndActivate] cannot resolve subscription_id for payment', paymentId)
    return { status: 'paid', activated: false }
  }

  // Upsert transaction record
  const { rows: subUserRows } = await db.query(
    `SELECT user_id FROM subscriptions WHERE id = $1`, [subscriptionId]
  )
  const subUserId = subUserRows[0]?.user_id || userId || ''
  await db.query(
    `INSERT INTO payment_transactions (subscription_id, user_id, moyasar_id, amount, currency, status)
     VALUES ($1, $2, $3, $4, 'SAR', 'paid')
     ON CONFLICT (moyasar_id) DO UPDATE SET status = 'paid', updated_at = NOW()`,
    [subscriptionId, subUserId, paymentId, payment.amount ? payment.amount / 100 : 0]
  )

  // Activate subscription
  await db.query('BEGIN')
  try {
    const billingCycle = payment.metadata?.billing_cycle === 'annual' ? 'annual' : 'monthly'
    const extendInterval = billingCycle === 'annual' ? '365 days' : '30 days'
    await db.query(
      `UPDATE subscriptions SET
         status     = 'active',
         start_date = COALESCE(start_date, CURRENT_DATE),
         end_date   = GREATEST(COALESCE(end_date, CURRENT_DATE), CURRENT_DATE) + $2::interval,
         updated_at = NOW()
       WHERE id = $1`,
      [subscriptionId, extendInterval]
    )
    const hasServiceColumn = await hasSubscriptionsServiceColumn(db)
    const { rows: subSvc } = await db.query(
      `SELECT tier, ${hasServiceColumn ? 'service' : 'NULL AS service'} FROM subscriptions WHERE id = $1`,
      [subscriptionId]
    )
    const svc = subSvc[0]?.service || inferSubscriptionServiceFromTier(subSvc[0]?.tier)
    if (svc === 'voice') {
      await db.query(
        `UPDATE public.voice_agents SET status = 'active', updated_at = NOW() WHERE subscription_id = $1`,
        [subscriptionId]
      )
    }
    await db.query(
      `UPDATE public.store_api_keys sak
         SET expires_at = sub.end_date, is_active = TRUE
       FROM public.stores st
       JOIN public.subscriptions sub ON sub.id = st.subscription_id
       WHERE st.id = sak.store_id AND sub.id = $1`,
      [subscriptionId]
    )
    await db.query('COMMIT')
    console.log('[payment] subscription activated:', subscriptionId)

    // Fire referral commission for first-time subscriber (fire-and-forget)
    recordReferralCommission(db, subUserId).catch(() => {})
  } catch (e) {
    await db.query('ROLLBACK')
    throw e
  }

  return { status: 'paid', activated: true, subscription_id: subscriptionId }
}

// ── Shared: send invoice email after successful payment ───────────────────────
async function sendInvoiceEmail(db, subscriptionId, paymentId) {
  const MOYASAR_SECRET = process.env.MOYASAR_SECRET_KEY
  if (!MOYASAR_SECRET) return
  try {
    let moyasarPayment = {}
    try {
      const pRes = await fetch(`https://api.moyasar.com/v1/payments/${paymentId}`, {
        headers: { Authorization: 'Basic ' + Buffer.from(MOYASAR_SECRET + ':').toString('base64') },
      })
      if (pRes.ok) moyasarPayment = await pRes.json()
    } catch (_) {}

    const { rows } = await db.query(
      `SELECT u.email, p.full_name, s.name AS store_name,
              sub.tier, sub.monthly_amount, sub.end_date, sub.service
         FROM subscriptions sub
         JOIN auth.users u ON u.id = sub.user_id
         LEFT JOIN profiles p ON p.id = sub.user_id
         LEFT JOIN (
           SELECT DISTINCT ON (subscription_id) *
             FROM stores ORDER BY subscription_id, created_at DESC
         ) s ON s.subscription_id = sub.id
        WHERE sub.id = $1`,
      [subscriptionId]
    )
    if (!rows.length) return
    const inv = rows[0]

    const orderNum = 'SPL-' + paymentId.slice(-8).toUpperCase()
    const tierDisplayNames = {
      basic: 'الأساسية', pro: 'الاحترافية', enterprise: 'المتقدمة',
      voice_basic: 'وكيل صوتي — أساسي', voice_pro: 'وكيل صوتي — احترافي', voice_enterprise: 'وكيل صوتي — مؤسسات',
    }
    const PLAN_LIMITS = {
      basic:            ['كاميرا واحدة', '12 ساعة/يوم', '6 جولات/يوم', 'تقارير PDF', 'دعم بالتذاكر'],
      pro:              ['حتى 3 كاميرات', '18 ساعة/يوم', '9 جولات/يوم', 'تحليل AI', 'أسئلة مخصصة'],
      enterprise:       ['حتى 6 كاميرات', '24 ساعة', 'جولات غير محدودة', 'تقارير فورية', 'مدير حساب'],
      voice_basic:      ['فرع واحد', 'رد صوتي ذكي', 'ساعات العمل فقط', 'تقارير أسبوعية'],
      voice_pro:        ['فرع واحد', 'NLP متقدمة', 'شخصية مخصصة', 'تقارير يومية', 'دعم أولوية'],
      voice_enterprise: ['متعدد الفروع', 'Dialogflow CX كامل', 'إدارة خطوط متعددة', 'مدير حساب'],
    }

    const tierName    = tierDisplayNames[inv.tier] || inv.tier
    const limits      = PLAN_LIMITS[inv.tier] || []
    const svcLabel    = (inv.service || inferSubscriptionServiceFromTier(inv.tier)) === 'voice' ? 'Voice' : 'Vision'
    const endDate     = inv.end_date ? new Date(inv.end_date).toLocaleDateString('ar-SA') : '—'
    const amount      = moyasarPayment.amount ? (moyasarPayment.amount / 100).toFixed(2) : (inv.monthly_amount || '—')
    const paymentDate = new Date().toLocaleDateString('ar-SA')
    const srcType     = moyasarPayment.source?.type || ''
    const payMethod   = srcType === 'mada' ? 'مدى' : srcType === 'creditcard' ? 'بطاقة ائتمانية' : srcType === 'stcpay' ? 'STC Pay' : 'بوابة موثر'

    const limitsHtml = limits.length
      ? `<div style="margin:0 0 24px;background:#F8FAFC;border-radius:12px;padding:16px 20px;">
           <p style="color:#374151;font-size:13px;font-weight:600;margin:0 0 10px;">مميزات باقتك — SPLIT ${svcLabel} ${tierName}:</p>
           <table cellpadding="0" cellspacing="0" border="0" width="100%">
             ${limits.map(f => `<tr><td style="padding:3px 0;color:#4B5563;font-size:13px;"><span style="color:#84A90E;font-weight:700;margin-left:8px;">✓</span>${f}</td></tr>`).join('')}
           </table>
         </div>`
      : ''

    const APP_URL = process.env.APP_URL || 'https://splittech.sa'
    await sendMail(
      inv.email,
      `فاتورة اشتراكك في ذكاء سبلت — ${orderNum}`,
      emailLayout(
        `فاتورتك جاهزة — ${orderNum}`,
        `<h2 style="color:#1F2937;font-size:22px;font-weight:700;margin:0 0 6px;">فاتورة الاشتراك</h2>
        <p style="color:#6B7280;font-size:14px;margin:0 0 24px;">شكراً ${inv.full_name || ''} — تم استلام دفعتك بنجاح ✓</p>

        <table width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background:#F8FAFC;border-radius:12px;margin:0 0 20px;">
          <tr><td style="padding:20px 24px;">
            <table cellpadding="0" cellspacing="4" border="0" width="100%">
              <tr>
                <td style="color:#6B7280;font-size:13px;padding-left:16px;padding-bottom:8px;">رقم الفاتورة:</td>
                <td style="color:#1F2937;font-size:13px;font-weight:700;padding-bottom:8px;">${orderNum}</td>
              </tr>
              <tr>
                <td style="color:#6B7280;font-size:13px;padding-left:16px;padding-bottom:8px;">المنشأة:</td>
                <td style="color:#1F2937;font-size:13px;padding-bottom:8px;">${inv.store_name || '—'}</td>
              </tr>
              <tr>
                <td style="color:#6B7280;font-size:13px;padding-left:16px;padding-bottom:8px;">الباقة:</td>
                <td style="color:#1F2937;font-size:13px;font-weight:600;padding-bottom:8px;">SPLIT ${svcLabel} — ${tierName}</td>
              </tr>
              <tr>
                <td style="color:#6B7280;font-size:13px;padding-left:16px;padding-bottom:8px;">المبلغ المدفوع:</td>
                <td style="color:#059669;font-size:15px;font-weight:700;padding-bottom:8px;">${amount} ر.س</td>
              </tr>
              <tr>
                <td style="color:#6B7280;font-size:13px;padding-left:16px;padding-bottom:8px;">تاريخ الدفع:</td>
                <td style="color:#1F2937;font-size:13px;padding-bottom:8px;">${paymentDate}</td>
              </tr>
              <tr>
                <td style="color:#6B7280;font-size:13px;padding-left:16px;padding-bottom:8px;">صالح حتى:</td>
                <td style="color:#1F2937;font-size:13px;font-weight:600;padding-bottom:8px;">${endDate}</td>
              </tr>
              <tr>
                <td style="color:#6B7280;font-size:13px;padding-left:16px;">طريقة الدفع:</td>
                <td style="color:#1F2937;font-size:13px;">${payMethod}</td>
              </tr>
            </table>
          </td></tr>
        </table>

        ${limitsHtml}

        <div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:10px;padding:14px 18px;margin:0 0 24px;">
          <p style="color:#065F46;font-size:13px;margin:0;line-height:1.8;">
            <strong>✓ تم تفعيل اشتراكك</strong> — باقتك نشطة حتى <strong>${endDate}</strong>.<br>
            يمكنك الآن إعداد الكاميرا وبدء المراقبة الذكية.
          </p>
        </div>

        <a href="${APP_URL}/dashboard/store-setup"
           style="display:inline-block;background:#AECC1E;color:#0A0A0A;font-weight:700;font-size:14px;padding:12px 28px;border-radius:10px;text-decoration:none;margin-bottom:10px;">
          إعداد الكاميرا الآن
        </a><br>
        <a href="${APP_URL}/dashboard"
           style="font-size:12px;color:#9CA3AF;text-decoration:none;">الذهاب للوحة التحكم</a>`
      )
    )
    console.log('[invoice-email] sent to', inv.email, 'order', orderNum)
  } catch (err) {
    console.error('[invoice-email] error:', err.message)
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/payment/confirm  — called by frontend after Moyasar callback
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/payment/confirm', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Invalid token' })

    const { payment_id, subscription_id: subscriptionIdHint } = req.body
    if (!payment_id) return res.status(400).json({ error: 'payment_id required' })

    const db = getPool()
    const result = await verifyAndActivate(db, payment_id, user.id, subscriptionIdHint || null)
    // Send invoice email asynchronously — do not block the response
    if (result.activated && result.subscription_id) {
      sendInvoiceEmail(db, result.subscription_id, payment_id).catch(e => {
        console.error('[invoice-email] failed:', e?.message || e)
      })
    }
    res.json(result)
  } catch (err) {
    console.error('payment-confirm error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /v1/payment/status  — verify payment status by Moyasar payment_id
// ══════════════════════════════════════════════════════════════════════════════
app.get('/v1/payment/status', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Invalid token' })

    const { payment_id } = req.query
    if (!payment_id) return res.status(400).json({ error: 'payment_id required' })

    const db = getPool()
    const { rows } = await db.query(
      `SELECT pt.status, pt.amount, pt.moyasar_id, s.status AS sub_status, s.id AS sub_id
       FROM payment_transactions pt
       JOIN subscriptions s ON s.id = pt.subscription_id
       WHERE pt.moyasar_id = $1 AND pt.user_id = $2`,
      [payment_id, user.id]
    )

    if (!rows.length) {
      // Try to verify directly from Moyasar if not in DB yet
      const MOYASAR_SECRET = process.env.MOYASAR_SECRET_KEY
      if (!MOYASAR_SECRET) return res.status(404).json({ error: 'Payment not found' })
      const verifyRes = await fetch(`https://api.moyasar.com/v1/payments/${payment_id}`, {
        headers: { Authorization: 'Basic ' + Buffer.from(MOYASAR_SECRET + ':').toString('base64') },
      })
      if (!verifyRes.ok) return res.status(404).json({ error: 'Payment not found' })
      const payment = await verifyRes.json()
      return res.json({ status: payment.status, moyasar_id: payment.id })
    }

    res.json(rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/payment/webhook  — Moyasar webhook (payment status update)
// ══════════════════════════════════════════════════════════════════════════════
app.head('/v1/payment/webhook', (req, res) => res.status(200).end())
app.get('/v1/payment/webhook', (req, res) => res.status(200).end())
app.post('/v1/payment/webhook', async (req, res) => {
  try {
    // Verify Moyasar webhook secret token — required in production
    const webhookSecret = process.env.MOYASAR_WEBHOOK_SECRET
    if (!webhookSecret) {
      console.error('[webhook] MOYASAR_WEBHOOK_SECRET is not set — rejecting all webhook requests for security')
      return res.status(503).end()
    }
    const incoming = req.headers['authorization'] || req.headers['x-moyasar-secret'] || ''
    const token = incoming.replace(/^Bearer\s+/i, '')
    if (token !== webhookSecret) {
      console.warn('[webhook] invalid secret token — possible spoofed request')
      return res.status(401).end()
    }

    const MOYASAR_SECRET = process.env.MOYASAR_SECRET_KEY
    if (!MOYASAR_SECRET) return res.status(500).end()

    const { id: paymentId, status, metadata } = req.body
    if (!paymentId || !status) return res.status(400).json({ error: 'Invalid payload' })

    // Verify payment directly with Moyasar
    const verifyRes = await fetch(`https://api.moyasar.com/v1/payments/${paymentId}`, {
      headers: { Authorization: 'Basic ' + Buffer.from(MOYASAR_SECRET + ':').toString('base64') },
    })
    if (!verifyRes.ok) return res.status(502).end()
    const payment = await verifyRes.json()

    const db = getPool()
    const subscriptionId = payment.metadata?.subscription_id || metadata?.subscription_id
    if (!subscriptionId) return res.status(400).json({ error: 'subscription_id missing in metadata' })

    const { rows: subUserRows } = await db.query(
      `SELECT user_id FROM subscriptions WHERE id = $1`, [subscriptionId]
    )
    const webhookUserId = subUserRows[0]?.user_id || ''
    const { rows: txRows } = await db.query(
      `INSERT INTO payment_transactions (subscription_id, user_id, moyasar_id, amount, currency, status)
       VALUES ($1, $2, $3, $4, 'SAR', $5)
       ON CONFLICT (moyasar_id) DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()
       RETURNING (xmax = 0) AS is_new`,
      [subscriptionId, webhookUserId, paymentId, payment.amount ? payment.amount / 100 : 0, payment.status]
    )
    const isNewTransaction = txRows[0]?.is_new !== false

    if (payment.status === 'paid') {
      let committed = false
      await db.query('BEGIN')
      try {
        const billingCycle = payment.metadata?.billing_cycle === 'annual' ? 'annual' : 'monthly'
        const extendInterval = billingCycle === 'annual' ? '365 days' : '30 days'
        // Only extend end_date if this payment wasn't already processed by /v1/payment/confirm
        if (isNewTransaction) {
          await db.query(
            `UPDATE subscriptions SET
               status     = 'active',
               start_date = COALESCE(start_date, CURRENT_DATE),
               end_date   = GREATEST(COALESCE(end_date, CURRENT_DATE), CURRENT_DATE) + $2::interval,
               updated_at = NOW()
             WHERE id = $1`,
            [subscriptionId, extendInterval]
          )
        } else {
          // Payment already confirmed by frontend — just ensure status is active
          await db.query(
            `UPDATE subscriptions SET status = 'active', updated_at = NOW() WHERE id = $1`,
            [subscriptionId]
          )
        }
        const hasServiceColumn = await hasSubscriptionsServiceColumn(db)
        const { rows: subSvc } = await db.query(
          `SELECT tier, ${hasServiceColumn ? 'service' : 'NULL AS service'}
             FROM subscriptions
            WHERE id = $1`,
          [subscriptionId]
        )
        const subscriptionService = subSvc[0]?.service || inferSubscriptionServiceFromTier(subSvc[0]?.tier)
        if (subscriptionService === 'voice') {
          await db.query(
            `UPDATE public.voice_agents SET status = 'active', updated_at = NOW() WHERE subscription_id = $1`,
            [subscriptionId]
          )
        }
        // Mirror expiry on the license key so the Electron client sees the right date
        await db.query(
          `UPDATE public.store_api_keys sak
             SET expires_at = sub.end_date, is_active = TRUE
           FROM public.stores st
           JOIN public.subscriptions sub ON sub.id = st.subscription_id
           WHERE st.id = sak.store_id AND sub.id = $1`,
          [subscriptionId]
        )
        await db.query('COMMIT')
        committed = true
        console.log('[payment] subscription activated or renewed — cycle:', billingCycle)

        // ── Referral commission + invoice email (first payment only) ──
        if (isNewTransaction) {
          // 150 SAR commission for the associate who referred this store
          recordReferralCommission(db, webhookUserId).catch(() => {})
          sendInvoiceEmail(db, subscriptionId, paymentId).catch(e => {
            console.error('[invoice-email/webhook] failed:', e?.message || e)
          })
        }
      } catch (e) {
        if (!committed) await db.query('ROLLBACK')
        throw e
      }
    } else if (payment.status === 'failed') {
      console.warn('[webhook] payment.failed for subscription:', subscriptionId, '— transaction recorded, no activation')
    }

    res.status(200).json({ received: true })
  } catch (err) {
    console.error('payment-webhook error:', err)
    res.status(500).end()
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/otp/email/send  — send OTP to the user's registered email
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/otp/email/send', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Invalid token' })

    // Use user email as the "channel" key in otp_codes table
    const emailKey = `email:${user.email}`

    // 60-second cooldown
    const cooldown = await checkOtpCooldown(user.id, emailKey)
    if (!cooldown.allowed) return res.status(429).json({ error: `Please wait ${cooldown.waitSeconds} seconds before resending`, waitSeconds: cooldown.waitSeconds })

    // Rate limit: max 5 sends per 15 min
    const rl = checkRateLimit(`otp-email:${user.id}`, 15 * 60 * 1000, 5)
    if (!rl.allowed) return res.status(429).json({ error: 'Too many requests. Try again in 15 minutes.' })

    const code = await generateOtpDB(user.id, emailKey)

    const { data: profile } = await getPool().query(
      `SELECT full_name FROM profiles WHERE id = $1`, [user.id]
    ).then(r => ({ data: r.rows[0] })).catch(() => ({ data: null }))

    await sendMail(
      user.email,
      `Your SPLIT Intelligence verification code — ${code}`,
      emailLayout(
        `Verification Code: ${code}`,
        `<h2 style="color:#1F2937;font-size:22px;font-weight:700;margin:0 0 6px;">Email Verification</h2>
        <p style="color:#6B7280;font-size:14px;margin:0 0 24px;">Hello${profile?.full_name ? ' ' + profile.full_name : ''}, use the code below to verify your email address on SPLIT Intelligence.</p>
        <div style="background:#F0FDF4;border:2px solid #AECC1E;border-radius:16px;padding:28px;text-align:center;margin:0 0 24px;">
          <p style="color:#6B7280;font-size:13px;margin:0 0 8px;">Verification code</p>
          <p style="color:#0A0A0A;font-size:40px;font-weight:900;letter-spacing:12px;margin:0;font-family:monospace;">${code}</p>
          <p style="color:#9CA3AF;font-size:12px;margin:12px 0 0;">Valid for 10 minutes — do not share this code</p>
        </div>
        <p style="color:#6B7280;font-size:13px;margin:0;">If you didn't request this code, please ignore this email.</p>`
      )
    )

    res.json({
      success: true,
      channel: 'email',
      message: `Verification code sent to ${user.email}`,
    })
  } catch (err) {
    console.error('otp-email-send error:', err)
    res.status(500).json({ error: 'Failed to send verification code' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/otp/email/verify  — verify email OTP
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/otp/email/verify', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Invalid token' })

    const { code } = req.body
    if (!code) return res.status(400).json({ error: 'Verification code is required' })

    const emailKey = `email:${user.email}`
    const result = await verifyOtpDB(user.id, emailKey, code)
    if (!result.valid) return res.status(400).json({ error: result.reason })

    // Mark email as verified in profile
    await getPool().query(
      `UPDATE profiles SET email_verified = true, updated_at = NOW() WHERE id = $1`,
      [user.id]
    ).catch(() => {}) // non-blocking — column may not exist yet

    res.json({ success: true, message: 'Email verified successfully' })
  } catch (err) {
    console.error('otp-email-verify error:', err)
    res.status(500).json({ error: 'Verification failed' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/otp/send  — send email OTP for phone verification (legacy)
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/otp/send', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Invalid token' })

    const { phone } = req.body
    if (!phone?.trim()) return res.status(400).json({ error: 'رقم الجوال مطلوب' })

    // 60-second cooldown between sends
    const cooldown = await checkOtpCooldown(user.id, phone.trim())
    if (!cooldown.allowed) return res.status(429).json({ error: `انتظر ${cooldown.waitSeconds} ثانية قبل إعادة الإرسال`, waitSeconds: cooldown.waitSeconds })

    // Rate limit: max 5 OTP sends per phone per 15 min
    const rl = checkRateLimit(`otp:${phone}`, 15 * 60 * 1000, 5)
    if (!rl.allowed) return res.status(429).json({ error: 'تجاوزت الحد المسموح. حاول بعد 15 دقيقة.' })

    const code = await generateOtpDB(user.id, phone.trim())

    // Send OTP via email only
    const { data: profile } = await getPool().query(
      `SELECT full_name FROM profiles WHERE id = $1`, [user.id]
    ).then(r => ({ data: r.rows[0] })).catch(() => ({ data: null }))

    await sendMail(
      user.email,
      `رمز التحقق من رقم جوالك — ${code}`,
      emailLayout(
        `رمز التحقق: ${code}`,
        `<h2 style="color:#1F2937;font-size:22px;font-weight:700;margin:0 0 6px;">رمز التحقق من الجوال</h2>
        <p style="color:#6B7280;font-size:14px;margin:0 0 24px;">مرحباً ${profile?.full_name || ''}، استخدم الرمز أدناه للتحقق من رقم جوالك</p>
        <div style="background:#F0FDF4;border:2px solid #AECC1E;border-radius:16px;padding:28px;text-align:center;margin:0 0 24px;">
          <p style="color:#6B7280;font-size:13px;margin:0 0 8px;">رمز التحقق</p>
          <p style="color:#0A0A0A;font-size:40px;font-weight:900;letter-spacing:12px;margin:0;font-family:monospace;">${code}</p>
          <p style="color:#9CA3AF;font-size:12px;margin:12px 0 0;">صالح لمدة 10 دقائق</p>
        </div>
        <p style="color:#6B7280;font-size:13px;margin:0;">إذا لم تطلب هذا الرمز، تجاهل هذه الرسالة.</p>`
      )
    )

    res.json({
      success: true,
      channel: 'email',
      message: `تم إرسال رمز التحقق على بريدك الإلكتروني (${user.email})`,
    })
  } catch (err) {
    console.error('otp-send error:', err)
    res.status(500).json({ error: 'فشل إرسال الرمز' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/otp/verify  — verify OTP and save phone to profile
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/otp/verify', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Invalid token' })

    const { phone, code } = req.body
    if (!phone?.trim() || !code) return res.status(400).json({ error: 'رقم الجوال والرمز مطلوبان' })

    const result = await verifyOtpDB(user.id, phone.trim(), code)
    if (!result.valid) return res.status(400).json({ error: result.reason })

    await getPool().query(
      `UPDATE profiles SET phone = $1, updated_at = NOW() WHERE id = $2`,
      [phone.trim(), user.id]
    )

    res.json({ success: true, message: 'تم التحقق من رقم الجوال بنجاح' })
  } catch (err) {
    console.error('otp-verify error:', err)
    res.status(500).json({ error: 'فشل التحقق' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// WEBHOOK HELPER — fire outbound webhook for a store event
// Runs fire-and-forget (do not await); logs delivery to webhook_deliveries
// ══════════════════════════════════════════════════════════════════════════════
async function fireWebhook(storeId, event, data) {
  const db = getPool()
  try {
    const { rows } = await db.query(
      `SELECT webhook_url, webhook_secret, webhook_events, webhook_enabled, name
       FROM public.stores WHERE id = $1`,
      [storeId]
    )
    const store = rows[0]
    if (!store?.webhook_enabled || !store.webhook_url) return
    if (store.webhook_events?.length && !store.webhook_events.includes(event)) return

    const payload = {
      event,
      store_id:   storeId,
      store_name: store.name,
      data,
      timestamp:  new Date().toISOString(),
    }

    // ── Discord webhook auto-format ───────────────────────────────────────────
    // Discord rejects non-Discord payloads with HTTP 400.
    // Detect by URL pattern and send a Discord embed instead.
    const isDiscord = /discord(app)?\.com\/api\/webhooks\//i.test(store.webhook_url)
    const eventEmoji = { audit_complete: '✅', audit_fail: '❌', audit_warning: '⚠️', test: '🧪' }
    let bodyStr
    if (isDiscord) {
      const score   = data?.score  != null ? `${data.score}%` : '—'
      const status  = data?.status ?? event
      const discordPayload = {
        username:   'SplitTech AI',
        avatar_url: 'https://splittech.sa/logo-icon.png',
        embeds: [{
          title:       `${eventEmoji[event] || '🔔'} ${event.replace(/_/g, ' ').toUpperCase()}`,
          description: `**${store.name}**`,
          color:       event === 'audit_fail' ? 0xdc2626 : event === 'audit_warning' ? 0xd97706 : 0x16a34a,
          fields: [
            { name: 'الحدث / Event',   value: event,  inline: true },
            { name: 'النتيجة / Score',  value: score,  inline: true },
            { name: 'الحالة / Status',  value: status, inline: true },
          ],
          footer:    { text: 'SplitTech Intelligence · splittech.sa' },
          timestamp: new Date().toISOString(),
        }],
      }
      bodyStr = JSON.stringify(discordPayload)
    } else {
      bodyStr = JSON.stringify(payload)
    }
    // ─────────────────────────────────────────────────────────────────────────

    const headers = {
      'Content-Type':  'application/json',
      'User-Agent':    'SplitTech-Webhook/1.0',
      'X-SplitTech-Event': event,
    }
    if (store.webhook_secret && !isDiscord) {
      const { createHmac } = await import('node:crypto')
      const sig = createHmac('sha256', store.webhook_secret).update(JSON.stringify(payload)).digest('hex')
      headers['X-SplitTech-Signature'] = `sha256=${sig}`
    }

    const start = Date.now()
    let responseStatus = null
    let responseBody   = null
    let success        = false
    try {
      const resp = await fetch(store.webhook_url, {
        method:  'POST',
        headers,
        body:    bodyStr,
        signal:  AbortSignal.timeout(10_000),
      })
      responseStatus = resp.status
      responseBody   = (await resp.text()).slice(0, 500)
      success        = resp.ok
    } catch (fetchErr) {
      responseBody = fetchErr.message?.slice(0, 500)
    }

    const duration = Date.now() - start
    await db.query(
      `INSERT INTO public.webhook_deliveries
         (store_id, event, payload, response_status, response_body, success, duration_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [storeId, event, payload, responseStatus, responseBody, success, duration]
    ).catch(() => {})

    console.log(`[webhook] store=${storeId} event=${event} status=${responseStatus} ok=${success} ms=${duration}`)
  } catch (err) {
    console.error('[webhook] fire error:', err.message)
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /v1/webhook-settings
// ══════════════════════════════════════════════════════════════════════════════
app.get('/v1/webhook-settings', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const user  = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })

    const db = getPool()
    const { rows } = await db.query(
      `SELECT webhook_url, webhook_secret, webhook_events, webhook_enabled
       FROM public.stores WHERE user_id = $1 LIMIT 1`,
      [user.id]
    )
    if (!rows[0]) return res.json({ webhook_url: null, webhook_secret: null, webhook_events: ['audit_complete'], webhook_enabled: false })
    res.json(rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// PATCH /v1/webhook-settings
// ══════════════════════════════════════════════════════════════════════════════
app.patch('/v1/webhook-settings', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const user  = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })

    const { webhook_url, webhook_secret, webhook_events, webhook_enabled } = req.body

    // Validate URL if provided
    if (webhook_url) {
      try { new URL(webhook_url) } catch { return res.status(400).json({ error: 'Invalid webhook URL' }) }
      if (!webhook_url.startsWith('https://') && !webhook_url.startsWith('http://')) {
        return res.status(400).json({ error: 'Webhook URL must start with https:// or http://' })
      }
    }

    const db = getPool()
    const updates = []
    const vals    = []
    let   idx     = 1

    if (webhook_url       !== undefined) { updates.push(`webhook_url     = $${idx++}`); vals.push(webhook_url || null) }
    if (webhook_secret    !== undefined) { updates.push(`webhook_secret  = $${idx++}`); vals.push(webhook_secret || null) }
    if (webhook_events    !== undefined) { updates.push(`webhook_events  = $${idx++}`); vals.push(webhook_events) }
    if (webhook_enabled   !== undefined) { updates.push(`webhook_enabled = $${idx++}`); vals.push(!!webhook_enabled) }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' })

    vals.push(user.id)
    await db.query(
      `UPDATE public.stores SET ${updates.join(', ')}, updated_at = NOW() WHERE user_id = $${idx}`,
      vals
    )
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/webhook-settings/test
// Sends a synthetic test payload to the configured webhook URL
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/webhook-settings/test', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const user  = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })

    const db = getPool()
    const { rows } = await db.query(
      `SELECT id, name, webhook_url, webhook_secret, webhook_enabled
       FROM public.stores WHERE user_id = $1 LIMIT 1`,
      [user.id]
    )
    const store = rows[0]
    if (!store?.webhook_url) return res.status(400).json({ error: 'No webhook URL configured' })

    const testPayload = {
      event:      'test',
      store_id:   store.id,
      store_name: store.name,
      data: {
        audit_id: '00000000-0000-0000-0000-000000000000',
        score:    85,
        status:   'pass',
        message:  'This is a test webhook from SplitTech AI',
      },
      timestamp: new Date().toISOString(),
    }
    const bodyStr = JSON.stringify(testPayload)
    const headers = {
      'Content-Type':      'application/json',
      'User-Agent':        'SplitTech-Webhook/1.0',
      'X-SplitTech-Event': 'test',
    }
    if (store.webhook_secret) {
      const { createHmac } = await import('node:crypto')
      const sig = createHmac('sha256', store.webhook_secret).update(bodyStr).digest('hex')
      headers['X-SplitTech-Signature'] = `sha256=${sig}`
    }

    const start = Date.now()
    let responseStatus = null
    let responseBody   = null
    let success        = false
    try {
      const resp = await fetch(store.webhook_url, {
        method: 'POST',
        headers,
        body:   bodyStr,
        signal: AbortSignal.timeout(10_000),
      })
      responseStatus = resp.status
      responseBody   = (await resp.text()).slice(0, 500)
      success        = resp.ok
    } catch (fetchErr) {
      responseBody = fetchErr.message?.slice(0, 500)
    }

    const duration = Date.now() - start

    // Log the test delivery
    await db.query(
      `INSERT INTO public.webhook_deliveries
         (store_id, event, payload, response_status, response_body, success, duration_ms)
       VALUES ($1,'test',$2,$3,$4,$5,$6)`,
      [store.id, testPayload, responseStatus, responseBody, success, duration]
    ).catch(() => {})

    res.json({ success, response_status: responseStatus, response_body: responseBody, duration_ms: duration })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /v1/webhook-deliveries
// Last 20 webhook delivery attempts for the merchant's store
// ══════════════════════════════════════════════════════════════════════════════
app.get('/v1/webhook-deliveries', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const user  = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })

    const db = getPool()
    const { rows } = await db.query(
      `SELECT wd.id, wd.event, wd.response_status, wd.response_body,
              wd.success, wd.duration_ms, wd.created_at
       FROM public.webhook_deliveries wd
       JOIN public.stores s ON s.id = wd.store_id
       WHERE s.user_id = $1
       ORDER BY wd.created_at DESC
       LIMIT 20`,
      [user.id]
    )
    res.json({ deliveries: rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// Annotated frame → data URL (stored directly in PostgreSQL — no external storage)
// ══════════════════════════════════════════════════════════════════════════════
function buildAnnotatedImageDataUrl(imageBase64) {
  // imageBase64 is a raw JPEG base64 string from the engine.
  // We store it as a data: URI so the browser can render it directly via <img src=...>
  if (!imageBase64) return null
  try {
    // Sanity-check: must be valid base64
    if (!/^[A-Za-z0-9+/]+=*$/.test(imageBase64.slice(0, 16))) return null
    // Cap at ~800KB decoded (≈1.07MB base64) — frames are 320×240 JPEG, should be ≤150KB
    if (imageBase64.length > 1_200_000) {
      console.warn('[annotatedFrame] image too large, skipping:', Math.round(imageBase64.length / 1024), 'KB b64')
      return null
    }
    return `data:image/jpeg;base64,${imageBase64}`
  } catch (e) {
    console.warn('[annotatedFrame]', e.message)
    return null
  }
}

async function runMigrations() {
  const db = getPool()
  try {
    // ── otp_codes: DB-backed OTP (works across Cloud Run instances) ──────────
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.otp_codes (
        user_id      UUID        NOT NULL,
        phone        TEXT        NOT NULL,
        code         TEXT        NOT NULL,
        expires_at   TIMESTAMPTZ NOT NULL,
        attempts     INT         NOT NULL DEFAULT 0,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_sent_at TIMESTAMPTZ,
        PRIMARY KEY (user_id, phone)
      )
    `)
    await db.query(`ALTER TABLE public.otp_codes ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ`)
    // Clean up expired OTPs on every startup
    await db.query(`DELETE FROM public.otp_codes WHERE expires_at < NOW()`)

    // ── stores: add ALL columns missing from base schema 001 ────────────
    // Must be first — onboarding INSERT and other routes reference all of these.
    await db.query(`ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS verification_status         TEXT        NOT NULL DEFAULT 'pending'`)
    await db.query(`ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS verification_notes          TEXT`)
    await db.query(`ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS network_mode               TEXT        NOT NULL DEFAULT 'single_network'`)
    await db.query(`ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS camera_ip                  TEXT`)
    await db.query(`ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS camera_username             TEXT`)
    await db.query(`ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS reviewed_at                TIMESTAMPTZ`)
    await db.query(`ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS verification_requested_at  TIMESTAMPTZ`)
    await db.query(`ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS commercial_registration    TEXT`)
    await db.query(`ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS branch_activity            TEXT`)

    // ── stores: custom audit questions + working hours approval flow ──────
    await db.query(`ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS pending_custom_questions   JSONB       NOT NULL DEFAULT '[]'`)
    await db.query(`ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS custom_questions_approved  BOOLEAN     NOT NULL DEFAULT false`)
    await db.query(`ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS pending_working_hours      JSONB`)
    await db.query(`ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS working_hours_approved     BOOLEAN     NOT NULL DEFAULT false`)

    // ── subscriptions: expand tier check to include voice tiers ──────────
    // Base schema only allows basic/pro/enterprise; voice onboarding needs voice_*.
    await db.query(`
      DO $$ BEGIN
        ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_tier_check;
      EXCEPTION WHEN undefined_object THEN NULL;
      END $$
    `)
    await db.query(`
      DO $$ BEGIN
        ALTER TABLE public.subscriptions
          ADD CONSTRAINT subscriptions_tier_check
          CHECK (tier IN ('basic','pro','enterprise','voice_basic','voice_pro','voice_enterprise'));
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `)

    // ── store_api_keys: add missing columns ───────────────────────────────
    await db.query(`ALTER TABLE public.store_api_keys ADD COLUMN IF NOT EXISTS revoked_at  TIMESTAMPTZ`)
    await db.query(`ALTER TABLE public.store_api_keys ADD COLUMN IF NOT EXISTS revoked_by  UUID`)
    await db.query(`ALTER TABLE public.store_api_keys ADD COLUMN IF NOT EXISTS expires_at  TIMESTAMPTZ`)

    // ── config_snapshots table ────────────────────────────────────────────
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.config_snapshots (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        store_id      UUID NOT NULL,
        label         TEXT NOT NULL DEFAULT '',
        snapshot_data JSONB NOT NULL DEFAULT '{}',
        reason        TEXT,
        created_by    UUID,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)

    // ── rollback_log table ────────────────────────────────────────────────
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.rollback_log (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        store_id        UUID NOT NULL,
        snapshot_id     UUID,
        rolled_back_by  UUID,
        reason          TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    // FK → stores so PostgREST can embed stores(name) on rollback_log queries
    await db.query(`
      DELETE FROM public.rollback_log r
      WHERE NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = r.store_id)
    `)
    await db.query(`
      DO $fk$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'rollback_log_store_id_fkey'
        ) THEN
          ALTER TABLE public.rollback_log
            ADD CONSTRAINT rollback_log_store_id_fkey
            FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;
        END IF;
      END $fk$;
    `)

    // ── Staff attendance + RPCs (isolated — function signature changes break OR REPLACE) ──
    try {
    await db.query(`
      CREATE OR REPLACE FUNCTION public.is_super_or_it(uid UUID DEFAULT auth.uid())
      RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER SET search_path = public STABLE AS $fn$
        SELECT EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = uid
            AND role IN ('super_owner', 'it_support')
        );
      $fn$;
    `)
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.staff_attendance (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        role            TEXT,
        work_date       DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'Asia/Riyadh')::DATE,
        check_in_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        check_out_at    TIMESTAMPTZ,
        active_seconds  INT NOT NULL DEFAULT 0,
        idle_seconds    INT NOT NULL DEFAULT 0,
        heartbeat_count INT NOT NULL DEFAULT 0,
        current_page    TEXT,
        first_ip        INET,
        last_ip         INET,
        user_agent      TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, work_date)
      )
    `)
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_attendance_user_date
        ON public.staff_attendance (user_id, work_date DESC)
    `)
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_attendance_active
        ON public.staff_attendance (last_active_at DESC)
    `)
    await db.query(`ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY`)
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.staff_presence_events (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        role        TEXT,
        event       TEXT NOT NULL CHECK (event IN ('login', 'logout', 'page_change')),
        page        TEXT,
        ip          INET,
        user_agent  TEXT,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_presence_events_user
        ON public.staff_presence_events (user_id, occurred_at DESC)
    `)
    await db.query(`ALTER TABLE public.staff_presence_events ENABLE ROW LEVEL SECURITY`)

    await db.query(`DROP POLICY IF EXISTS "attendance_self_select" ON public.staff_attendance`)
    await db.query(`DROP POLICY IF EXISTS "attendance_admin_all" ON public.staff_attendance`)
    await db.query(`
      CREATE POLICY "attendance_self_select" ON public.staff_attendance
        FOR SELECT USING (auth.uid() = user_id OR public.is_super_or_it())
    `)
    await db.query(`
      CREATE POLICY "attendance_admin_all" ON public.staff_attendance
        FOR ALL USING (public.is_super_or_it()) WITH CHECK (public.is_super_or_it())
    `)
    await db.query(`DROP POLICY IF EXISTS "presence_self_select" ON public.staff_presence_events`)
    await db.query(`DROP POLICY IF EXISTS "presence_admin_all" ON public.staff_presence_events`)
    await db.query(`
      CREATE POLICY "presence_self_select" ON public.staff_presence_events
        FOR SELECT USING (auth.uid() = user_id OR public.is_super_or_it())
    `)
    await db.query(`
      CREATE POLICY "presence_admin_all" ON public.staff_presence_events
        FOR ALL USING (public.is_super_or_it()) WITH CHECK (public.is_super_or_it())
    `)
    await db.query(`GRANT SELECT ON public.staff_attendance TO authenticated`)
    await db.query(`GRANT SELECT ON public.staff_presence_events TO authenticated`)

    await db.query(`
      CREATE OR REPLACE FUNCTION public.attendance_punch(
        _page TEXT DEFAULT NULL,
        _ua   TEXT DEFAULT NULL
      ) RETURNS UUID
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
      DECLARE
        v_uid   UUID := auth.uid();
        v_role  TEXT;
        v_id    UUID;
        v_today DATE := (NOW() AT TIME ZONE 'Asia/Riyadh')::DATE;
      BEGIN
        IF v_uid IS NULL THEN
          RAISE EXCEPTION 'unauthenticated';
        END IF;
        SELECT role INTO v_role FROM public.user_roles WHERE user_id = v_uid LIMIT 1;

        INSERT INTO public.staff_attendance (user_id, role, work_date, current_page, user_agent)
        VALUES (v_uid, v_role, v_today, _page, _ua)
        ON CONFLICT (user_id, work_date) DO UPDATE
          SET last_active_at = NOW(),
              current_page   = COALESCE(EXCLUDED.current_page, public.staff_attendance.current_page),
              user_agent     = COALESCE(EXCLUDED.user_agent,   public.staff_attendance.user_agent),
              updated_at     = NOW()
        RETURNING id INTO v_id;

        INSERT INTO public.staff_presence_events (user_id, role, event, page, user_agent)
        VALUES (v_uid, v_role, 'login', _page, _ua);

        RETURN v_id;
      END;
      $fn$;
    `)
    // DROP all overloads first — Postgres rejects CREATE OR REPLACE when the return type
    // or signature changed, even by one arg. Covers every historical variant.
    await db.query(`
      DO $$ BEGIN
        DROP FUNCTION IF EXISTS public.attendance_heartbeat(TEXT, BOOLEAN, INT);
        DROP FUNCTION IF EXISTS public.attendance_heartbeat(TEXT, BOOLEAN, INTEGER);
        DROP FUNCTION IF EXISTS public.attendance_heartbeat(TEXT, BOOLEAN);
        DROP FUNCTION IF EXISTS public.attendance_heartbeat(TEXT);
        DROP FUNCTION IF EXISTS public.attendance_heartbeat();
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$
    `)
    await db.query(`
      CREATE OR REPLACE FUNCTION public.attendance_heartbeat(
        _page          TEXT    DEFAULT NULL,
        _is_active     BOOLEAN DEFAULT TRUE,
        _delta_seconds INT     DEFAULT 60
      ) RETURNS VOID
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
      DECLARE
        v_uid   UUID := auth.uid();
        v_role  TEXT;
        v_today DATE := (NOW() AT TIME ZONE 'Asia/Riyadh')::DATE;
      BEGIN
        IF v_uid IS NULL THEN
          RAISE EXCEPTION 'unauthenticated';
        END IF;
        SELECT role INTO v_role FROM public.user_roles WHERE user_id = v_uid LIMIT 1;

        INSERT INTO public.staff_attendance (user_id, role, work_date, current_page)
        VALUES (v_uid, v_role, v_today, _page)
        ON CONFLICT (user_id, work_date) DO NOTHING;

        UPDATE public.staff_attendance
           SET last_active_at  = NOW(),
               current_page    = COALESCE(_page, current_page),
               heartbeat_count = heartbeat_count + 1,
               active_seconds  = active_seconds
                                + CASE WHEN _is_active     THEN GREATEST(_delta_seconds, 0) ELSE 0 END,
               idle_seconds    = idle_seconds
                                + CASE WHEN NOT _is_active THEN GREATEST(_delta_seconds, 0) ELSE 0 END,
               updated_at      = NOW()
         WHERE user_id = v_uid AND work_date = v_today;
      END;
      $fn$;
    `)
    await db.query(`
      CREATE OR REPLACE FUNCTION public.attendance_punch_out()
      RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
      DECLARE
        v_uid   UUID := auth.uid();
        v_role  TEXT;
        v_today DATE := (NOW() AT TIME ZONE 'Asia/Riyadh')::DATE;
      BEGIN
        IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
        SELECT role INTO v_role FROM public.user_roles WHERE user_id = v_uid LIMIT 1;

        UPDATE public.staff_attendance
           SET check_out_at = NOW(), updated_at = NOW()
         WHERE user_id = v_uid AND work_date = v_today;

        INSERT INTO public.staff_presence_events (user_id, role, event)
        VALUES (v_uid, v_role, 'logout');
      END;
      $fn$;
    `)
    await db.query(`GRANT EXECUTE ON FUNCTION public.attendance_punch(TEXT, TEXT) TO authenticated`)
    await db.query(`GRANT EXECUTE ON FUNCTION public.attendance_heartbeat(TEXT, BOOLEAN, INT) TO authenticated`)
    await db.query(`GRANT EXECUTE ON FUNCTION public.attendance_punch_out() TO authenticated`)
    await db.query(`
      CREATE OR REPLACE VIEW public.daily_attendance_view
      WITH (security_invoker = true) AS
      SELECT
        a.id,
        a.user_id,
        a.role,
        a.work_date,
        a.check_in_at,
        a.check_out_at,
        a.last_active_at,
        a.active_seconds,
        a.idle_seconds,
        (a.active_seconds + a.idle_seconds) AS total_seconds,
        a.heartbeat_count,
        a.current_page,
        a.first_ip,
        a.last_ip,
        p.full_name
      FROM public.staff_attendance a
      LEFT JOIN public.profiles p ON p.id = a.user_id
    `)
    await db.query(`GRANT SELECT ON public.daily_attendance_view TO authenticated`)
    console.log('[migrations] attendance functions OK')
    } catch (attendanceErr) {
      console.error('[migrations] attendance error (non-fatal):', attendanceErr.message)
    }

    // ── profiles: employee_id ─────────────────────────────────────────────
    await db.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS employee_id VARCHAR(12)`)

    // Assign SP-XXXX to non-merchant staff
    await db.query(`
      WITH ranked AS (
        SELECT p.id, ROW_NUMBER() OVER (ORDER BY p.created_at NULLS LAST) AS rn
        FROM profiles p
        LEFT JOIN user_roles ur ON ur.user_id = p.id
        WHERE ur.role IS NULL OR ur.role != 'merchant'
      )
      UPDATE profiles SET employee_id = 'SP-' || LPAD(ranked.rn::text, 4, '0')
      FROM ranked WHERE profiles.id = ranked.id AND profiles.employee_id IS NULL
    `)

    // Assign MR-XXXX to merchants
    await db.query(`
      WITH ranked AS (
        SELECT p.id, ROW_NUMBER() OVER (ORDER BY p.created_at NULLS LAST) AS rn
        FROM profiles p
        JOIN user_roles ur ON ur.user_id = p.id
        WHERE ur.role = 'merchant' AND p.employee_id IS NULL
      )
      UPDATE profiles SET employee_id = 'MR-' || LPAD(ranked.rn::text, 4, '0')
      FROM ranked WHERE profiles.id = ranked.id
    `)

    // Create approve_store PostgreSQL function (isolated — return-type conflicts break OR REPLACE)
    try { await db.query(`DROP FUNCTION IF EXISTS approve_store(uuid, uuid)`) } catch (_) {}
    await db.query(`
      CREATE OR REPLACE FUNCTION approve_store(p_store_id uuid, p_admin_id uuid)
      RETURNS json
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $fn$
      DECLARE
        v_store stores%rowtype;
        v_api_key text;
        v_license_key text;
      BEGIN
        SELECT * INTO v_store FROM stores WHERE id = p_store_id;
        IF NOT FOUND THEN
          RETURN json_build_object('success', false, 'error', 'المتجر غير موجود');
        END IF;

        v_license_key := 'SPL-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 16));
        v_api_key     := encode(gen_random_bytes(32), 'hex');

        UPDATE stores SET
          store_status        = 'active',
          verification_status = 'verified',
          verification_notes  = 'تم الاعتماد من الإدارة',
          reviewed_at         = now()
        WHERE id = p_store_id;

        IF v_store.subscription_id IS NOT NULL THEN
          UPDATE subscriptions SET
            status     = 'active',
            start_date = now()::date,
            end_date   = (now() + interval '30 days')::date
          WHERE id = v_store.subscription_id;
        END IF;

        INSERT INTO store_api_keys (store_id, license_key, api_key, key_preview, is_active, activated_at)
        VALUES (p_store_id, v_license_key, v_api_key, left(v_license_key,12)||'...', true, now())
        ON CONFLICT DO NOTHING;

        RETURN json_build_object('success', true);
      EXCEPTION WHEN OTHERS THEN
        RETURN json_build_object('success', false, 'error', SQLERRM);
      END;
      $fn$;
    `)

    // Grant execute permission so PostgREST authenticated role can call it
    try { await db.query(`GRANT EXECUTE ON FUNCTION approve_store(uuid, uuid) TO authenticated`) } catch (_) {}

    // Create emergency_broadcasts table if it doesn't exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.emergency_broadcasts (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title         text NOT NULL,
        message       text NOT NULL,
        severity      text NOT NULL DEFAULT 'warning',
        target_scope  text NOT NULL DEFAULT 'all',
        target_tier   text,
        target_store_ids jsonb,
        expires_at    timestamptz,
        is_active     boolean NOT NULL DEFAULT true,
        kill_signal   boolean NOT NULL DEFAULT false,
        kill_reason   text,
        created_by    uuid REFERENCES auth.users(id),
        created_at    timestamptz NOT NULL DEFAULT now()
      )
    `)

    // Auto-deactivate expired broadcasts
    await db.query(`
      UPDATE public.emergency_broadcasts
      SET is_active = false
      WHERE expires_at IS NOT NULL AND expires_at < now() AND is_active = true
    `)

    // ── payment_transactions table ────────────────────────────────────────
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.payment_transactions (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
        user_id         UUID NOT NULL,
        moyasar_id      TEXT NOT NULL UNIQUE,
        amount          DECIMAL(10,2) NOT NULL,
        currency        TEXT NOT NULL DEFAULT 'SAR',
        status          TEXT NOT NULL DEFAULT 'initiated'
                          CHECK (status IN ('initiated','paid','failed','refunded','voided')),
        initiated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await db.query(`CREATE INDEX IF NOT EXISTS idx_pt_subscription ON public.payment_transactions(subscription_id)`)
    await db.query(`CREATE INDEX IF NOT EXISTS idx_pt_user         ON public.payment_transactions(user_id)`)

    // ── store_api_keys: ensure unique constraint on store_id ─────────────
    await db.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'store_api_keys_store_id_key'
        ) THEN
          ALTER TABLE public.store_api_keys ADD CONSTRAINT store_api_keys_store_id_key UNIQUE (store_id);
        END IF;
      END $$
    `)

    // ── stores: clean up orphaned 'pending' rows from the old flow ──────
    // Stores that never reached payment + camera setup must not pollute admin queue.
    // Anything with no camera_ip AND no active subscription is moved to 'draft' so the
    // admin only sees rows that actually completed payment + license-request.
    await db.query(`
      UPDATE public.stores st
         SET verification_status = 'draft',
             verification_requested_at = NULL
        FROM public.subscriptions sub
       WHERE st.subscription_id = sub.id
         AND st.verification_status IN ('pending', 'under_review')
         AND st.camera_ip IS NULL
         AND sub.status <> 'active'
    `)

    // ── subscriptions: add service column (vision | voice) ───────────────
    // Lets a single user have one Vision subscription AND one Voice Agent
    // subscription side-by-side. Existing rows default to 'vision'.
    await db.query(`
      ALTER TABLE public.subscriptions
        ADD COLUMN IF NOT EXISTS service TEXT NOT NULL DEFAULT 'vision'
    `)
    await db.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_service_check'
        ) THEN
          ALTER TABLE public.subscriptions
            ADD CONSTRAINT subscriptions_service_check CHECK (service IN ('vision', 'voice'));
        END IF;
      END $$
    `)
    await db.query(`CREATE INDEX IF NOT EXISTS idx_subscriptions_user_service ON public.subscriptions(user_id, service)`)

    // ── voice_agents: configuration per merchant's AI phone agent ────────
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.voice_agents (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        subscription_id       UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
        persona_name          TEXT NOT NULL DEFAULT 'مساعد الفرع',
        persona_description   TEXT,
        greeting              TEXT NOT NULL DEFAULT 'مرحباً، أنا المساعد الذكي. كيف يمكنني مساعدتك؟',
        business_phone        TEXT,
        business_hours_start  INT  NOT NULL DEFAULT 8,
        business_hours_end    INT  NOT NULL DEFAULT 22,
        status                TEXT NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'active', 'paused')),
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await db.query(`CREATE INDEX IF NOT EXISTS idx_voice_agents_user ON public.voice_agents(user_id)`)
    // One voice agent per user
    await db.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'voice_agents_user_id_key'
        ) THEN
          ALTER TABLE public.voice_agents ADD CONSTRAINT voice_agents_user_id_key UNIQUE (user_id);
        END IF;
      END $$
    `)

    // ── stores: migrate the legacy {8,22} default to the new overnight default ──
    // Stores using the previous daytime default get switched to 17:00 → 05:00.
    // Stores with custom hours (anything other than the legacy default) are left
    // alone — merchants who manually customised stay customised.
    await db.query(`
      UPDATE public.stores
         SET working_hours = '{"start": 17, "end": 5}'::jsonb
       WHERE working_hours @> '{"start": 8, "end": 22}'::jsonb
         AND working_hours <@ '{"start": 8, "end": 22}'::jsonb
    `)

    // ── call_logs: persisted call history for the Voice Agent ────────────
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.call_logs (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        voice_agent_id    UUID NOT NULL REFERENCES public.voice_agents(id) ON DELETE CASCADE,
        caller_phone      TEXT,
        duration_seconds  INT  NOT NULL DEFAULT 0,
        status            TEXT NOT NULL DEFAULT 'completed'
                            CHECK (status IN ('completed', 'missed', 'transferred', 'failed')),
        sentiment         TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
        transcript        JSONB,
        started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ended_at          TIMESTAMPTZ,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await db.query(`CREATE INDEX IF NOT EXISTS idx_call_logs_agent_started ON public.call_logs(voice_agent_id, started_at DESC)`)

    await db.query(`ALTER TABLE public.voice_agents ENABLE ROW LEVEL SECURITY`)
    await db.query(`DROP POLICY IF EXISTS "va_self_all" ON public.voice_agents`)
    await db.query(`DROP POLICY IF EXISTS "va_it_all" ON public.voice_agents`)
    await db.query(`
      CREATE POLICY "va_self_all" ON public.voice_agents
        FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())
    `)
    await db.query(`
      CREATE POLICY "va_it_all" ON public.voice_agents
        FOR ALL USING (public.is_super_or_it()) WITH CHECK (public.is_super_or_it())
    `)
    await db.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_agents TO authenticated`)

    await db.query(`ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY`)
    await db.query(`DROP POLICY IF EXISTS "cl_self_select" ON public.call_logs`)
    await db.query(`DROP POLICY IF EXISTS "cl_it_all" ON public.call_logs`)
    await db.query(`
      CREATE POLICY "cl_self_select" ON public.call_logs
        FOR SELECT USING (
          EXISTS (
            SELECT 1 FROM public.voice_agents va
            WHERE va.id = voice_agent_id AND va.user_id = auth.uid()
          )
        )
    `)
    await db.query(`
      CREATE POLICY "cl_it_all" ON public.call_logs
        FOR ALL USING (public.is_super_or_it()) WITH CHECK (public.is_super_or_it())
    `)
    await db.query(`GRANT SELECT ON public.call_logs TO authenticated`)

    // ── admin_audit_log: track key admin actions ──────────────────────────
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.admin_audit_log (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_id    UUID NOT NULL,
        actor_role  TEXT,
        action      TEXT NOT NULL,
        target_type TEXT,
        target_id   TEXT,
        details     JSONB,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await db.query(`CREATE INDEX IF NOT EXISTS idx_aal_actor     ON public.admin_audit_log(actor_id, created_at DESC)`)
    await db.query(`CREATE INDEX IF NOT EXISTS idx_aal_action    ON public.admin_audit_log(action, created_at DESC)`)
    await db.query(`CREATE INDEX IF NOT EXISTS idx_aal_target    ON public.admin_audit_log(target_id, created_at DESC)`)

    // ── profiles: add email_verified + phone columns if missing ──────────
    await db.query(`ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE`)
    await db.query(`ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT`)

    // ── Performance indexes on hot query paths ────────────────────────────
    await db.query(`CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id   ON public.subscriptions(user_id)`)
    await db.query(`CREATE INDEX IF NOT EXISTS idx_subscriptions_status    ON public.subscriptions(status)`)
    await db.query(`CREATE INDEX IF NOT EXISTS idx_subscriptions_end_date  ON public.subscriptions(end_date)`)
    await db.query(`CREATE INDEX IF NOT EXISTS idx_stores_user_id          ON public.stores(user_id)`)
    await db.query(`CREATE INDEX IF NOT EXISTS idx_stores_store_status     ON public.stores(store_status)`)

    // ── Webhook configuration + delivery log (isolated try-catch so it always runs) ──
    try {
      await db.query(`ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS webhook_url     TEXT`)
      await db.query(`ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS webhook_secret  TEXT`)
      await db.query(`ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS webhook_events  TEXT[]  DEFAULT ARRAY['audit_complete']`)
      await db.query(`ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS webhook_enabled BOOLEAN NOT NULL DEFAULT FALSE`)
      await db.query(`
        CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
          id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          store_id        UUID        NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
          event           TEXT        NOT NULL,
          payload         JSONB       NOT NULL,
          response_status INTEGER,
          response_body   TEXT,
          success         BOOLEAN     NOT NULL DEFAULT FALSE,
          duration_ms     INTEGER,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      await db.query(`CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_store ON public.webhook_deliveries(store_id, created_at DESC)`)
      await db.query(`ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY`)
      await db.query(`DROP POLICY IF EXISTS "webhook_del_own" ON public.webhook_deliveries`)
      await db.query(`
        CREATE POLICY "webhook_del_own" ON public.webhook_deliveries
          FOR ALL TO authenticated
          USING  (store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid()))
          WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid()))
      `)
      console.log('[migrations] webhook tables OK')
    } catch (webhookErr) {
      console.error('[migrations] webhook error (non-fatal):', webhookErr.message)
    }

    // ── YOLO + Gemini Agentic Vision — new audit columns ─────────────────────
    try {
      await db.query(`
        ALTER TABLE public.analytics_logs
          ADD COLUMN IF NOT EXISTS annotated_image_url TEXT,
          ADD COLUMN IF NOT EXISTS detections_json     JSONB
      `)
      console.log('[migrations] analytics_logs YOLO columns OK')
    } catch (yoloMigErr) {
      console.error('[migrations] YOLO columns (non-fatal):', yoloMigErr.message)
    }

    // ── Referral / Commission system ─────────────────────────────────────────
    try {
      // Create marketing_associate_profile if it doesn't exist yet
      await db.query(`
        CREATE TABLE IF NOT EXISTS public.marketing_associate_profile (
          id                         UUID        PRIMARY KEY,
          display_name               TEXT,
          is_active                  BOOLEAN     NOT NULL DEFAULT TRUE,
          total_conversions          INT         NOT NULL DEFAULT 0,
          total_leads_assigned       INT         NOT NULL DEFAULT 0
        )
      `)

      // Add referral/commission columns to marketing_associate_profile
      for (const col of [
        `ADD COLUMN IF NOT EXISTS referral_code             VARCHAR(20) UNIQUE`,
        `ADD COLUMN IF NOT EXISTS iban                      VARCHAR(34)`,
        `ADD COLUMN IF NOT EXISTS employee_number           VARCHAR(20) UNIQUE`,
        `ADD COLUMN IF NOT EXISTS pending_commissions_sar   NUMERIC(10,2) NOT NULL DEFAULT 0`,
        `ADD COLUMN IF NOT EXISTS paid_commissions_sar      NUMERIC(10,2) NOT NULL DEFAULT 0`,
      ]) {
        await db.query(`ALTER TABLE public.marketing_associate_profile ${col}`).catch(() => {})
      }

      // Create referral conversions table (one row per 150 SAR earned)
      await db.query(`
        CREATE TABLE IF NOT EXISTS public.marketing_referral_conversions (
          id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          associate_id      UUID        NOT NULL,
          referral_code     VARCHAR(20) NOT NULL,
          store_user_id     UUID,
          store_name        TEXT,
          store_email       TEXT,
          commission_amount NUMERIC(10,2) NOT NULL DEFAULT 150,
          status            TEXT        NOT NULL DEFAULT 'pending',
          paid_at           TIMESTAMPTZ,
          paid_by           UUID,
          payment_notes     TEXT,
          created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      await db.query(`CREATE INDEX IF NOT EXISTS idx_mrc_associate ON public.marketing_referral_conversions(associate_id, created_at DESC)`)
      await db.query(`CREATE INDEX IF NOT EXISTS idx_mrc_code      ON public.marketing_referral_conversions(referral_code)`)

      // RLS: associate sees only own conversions; admins/managers see all
      await db.query(`ALTER TABLE public.marketing_referral_conversions ENABLE ROW LEVEL SECURITY`)
      await db.query(`DROP POLICY IF EXISTS "mrc_own_read" ON public.marketing_referral_conversions`)
      await db.query(`
        CREATE POLICY "mrc_own_read" ON public.marketing_referral_conversions
          FOR SELECT TO authenticated
          USING (
            associate_id = auth.uid()
            OR EXISTS (
              SELECT 1 FROM public.profiles
              WHERE id = auth.uid()
              AND role IN ('super_owner','it_support','marketing_manager')
            )
          )
      `)

      // RLS: allow associate to update their own iban/employee_number
      await db.query(`ALTER TABLE public.marketing_associate_profile ENABLE ROW LEVEL SECURITY`)
      await db.query(`DROP POLICY IF EXISTS "map_own_update" ON public.marketing_associate_profile`)
      await db.query(`
        CREATE POLICY "map_own_update" ON public.marketing_associate_profile
          FOR UPDATE TO authenticated
          USING  (id = auth.uid())
          WITH CHECK (id = auth.uid())
      `)
      await db.query(`DROP POLICY IF EXISTS "map_read_all" ON public.marketing_associate_profile`)
      await db.query(`
        CREATE POLICY "map_read_all" ON public.marketing_associate_profile
          FOR SELECT TO authenticated
          USING (
            id = auth.uid()
            OR EXISTS (
              SELECT 1 FROM public.profiles
              WHERE id = auth.uid()
              AND role IN ('super_owner','it_support','marketing_manager')
            )
          )
      `)

      // Auto-generate referral code trigger
      await db.query(`
        CREATE OR REPLACE FUNCTION public.fn_generate_referral_code()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        DECLARE attempt INT := 0; candidate TEXT;
        BEGIN
          IF NEW.referral_code IS NULL THEN
            LOOP
              attempt := attempt + 1;
              candidate := 'SP-' || upper(
                translate(
                  substring(encode(gen_random_bytes(5),'hex') from 1 for 6),
                  'abcdef', 'ABCDEF'
                )
              );
              BEGIN
                NEW.referral_code := candidate;
                EXIT;
              EXCEPTION WHEN unique_violation THEN
                IF attempt > 10 THEN EXIT; END IF;
              END;
            END LOOP;
          END IF;
          RETURN NEW;
        END $$
      `)
      await db.query(`DROP TRIGGER IF EXISTS trg_referral_code ON public.marketing_associate_profile`)
      await db.query(`
        CREATE TRIGGER trg_referral_code
          BEFORE INSERT ON public.marketing_associate_profile
          FOR EACH ROW EXECUTE FUNCTION public.fn_generate_referral_code()
      `)

      // Back-fill referral codes for existing associates that don't have one
      await db.query(`
        UPDATE public.marketing_associate_profile
        SET referral_code = 'SP-' || upper(substring(md5(id::text || clock_timestamp()::text) from 1 for 6))
        WHERE referral_code IS NULL
      `).catch(() => {})

      // UNIQUE: one commission per store user (prevents double-counting on renewals)
      await db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_mrc_unique_store_user
          ON public.marketing_referral_conversions(store_user_id)
          WHERE store_user_id IS NOT NULL
      `).catch(() => {})

      // profiles: store referral code at signup — commission fires on first payment only
      await db.query(`ALTER TABLE IF EXISTS public.profiles ADD COLUMN IF NOT EXISTS referral_code_used VARCHAR(20)`)
        .catch(() => {})

      console.log('[migrations] referral/commission system OK')
    } catch (refErr) {
      console.error('[migrations] referral error (non-fatal):', refErr.message)
    }

    // Reload PostgREST schema cache so newly created/replaced functions are visible
    await db.query(`NOTIFY pgrst, 'reload schema'`).catch(() => {})

    console.log('[migrations] complete')
  } catch (err) {
    console.error('Migration error:', err.message)
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/onboarding
// Creates a (pending) subscription + a (draft) store row for the merchant.
//
// Important: this endpoint NO LONGER notifies admins or marks the store for
// review. It only captures the organisation profile + chosen tier. The user
// must complete payment AND submit camera details via /v1/license-request
// before the store becomes visible in the admin approval queue.
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/onboarding', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Unauthorized' })

    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Invalid token' })

    const {
      tier = 'pro',
      store_name,
      commercial_registration,
      branch_activity,
      questions = [],
    } = req.body

    if (!store_name?.trim())
      return res.status(400).json({ error: 'اسم المتجر مطلوب' })

    const tierPrices = { basic: 1, pro: 219, enterprise: 269 }
    const monthly = tierPrices[tier] ?? 219

    const db = getPool()

    // Check if user already has a pending/active VISION subscription. (Voice
    // subscriptions live in the same table with service='voice' and are not a
    // conflict here.)
    const hasServiceColumn = await hasSubscriptionsServiceColumn(db)
    const { rows: existing } = await db.query(
      `SELECT id FROM public.subscriptions
         WHERE user_id = $1
           AND ${hasServiceColumn ? "service = 'vision'" : "tier NOT LIKE 'voice_%'"}
           AND status IN ('pending','active')
         LIMIT 1`,
      [user.id]
    )
    if (existing.length > 0)
      return res.status(409).json({ error: 'لديك اشتراك قائم بالفعل. تواصل مع الدعم للمساعدة.', code: 'ALREADY_SUBSCRIBED' })

    // Atomic: insert subscription + store. Store starts as 'draft' so it does
    // NOT appear in the admin approval queue until /v1/license-request runs.
    await db.query('BEGIN')
    try {
      const { rows: subRows } = await db.query(
        hasServiceColumn
          ? `INSERT INTO public.subscriptions
               (user_id, tier, status, monthly_amount, start_date, end_date, auto_renew, notes, service)
             VALUES ($1, $2, 'pending', $3, NULL, NULL, TRUE, $4, 'vision')
             RETURNING id`
          : `INSERT INTO public.subscriptions
               (user_id, tier, status, monthly_amount, start_date, end_date, auto_renew, notes)
             VALUES ($1, $2, 'pending', $3, NULL, NULL, TRUE, $4)
             RETURNING id`,
        [
          user.id, tier, monthly,
          `طلب إطلاق جديد — تبدأ التجربة المجانية (30 يوماً) بعد إتمام الدفع وإعداد الكاميرا`,
        ]
      )
      const subId = subRows[0].id

      await db.query(
        `INSERT INTO public.stores
           (user_id, subscription_id, name, store_status, custom_questions, working_hours,
            commercial_registration, branch_activity,
            verification_status, verification_notes,
            network_mode, interval_minutes)
         VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7,
                 'draft', 'بانتظار إتمام الدفع وإعداد الكاميرا',
                 'single_network', 10)`,
        [
          user.id, subId, store_name.trim(),
          JSON.stringify(questions),
          JSON.stringify({ start: 17, end: 5 }),
          commercial_registration?.trim() || null,
          branch_activity?.trim() || null,
        ]
      )

      await db.query('COMMIT')

      // Note: admin notification intentionally NOT sent here. It now fires
      // from /v1/license-request once the user has paid and submitted camera
      // configuration. This prevents pre-payment requests polluting the queue.

      res.json({ success: true, subscription_id: subId })
    } catch (txErr) {
      await db.query('ROLLBACK')
      throw txErr
    }
  } catch (err) {
    console.error('onboarding error:', err)
    res.status(500).json({ error: err.message || 'خطأ داخلي في الخادم' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// Voice Agent endpoints — Smart Phone Agent (وكيل الهاتف الذكي)
// ══════════════════════════════════════════════════════════════════════════════
const VOICE_TIER_PRICES = { voice_basic: 199, voice_pro: 299, voice_enterprise: 499 }

// ── POST /v1/voice-agent/onboarding ───────────────────────────────────────────
// Creates a (pending) Voice Agent subscription + voice_agents row. Mirrors
// /v1/onboarding's flow: no admin notification here — admin only becomes
// involved once payment is settled (handled later by activation flow).
app.post('/v1/voice-agent/onboarding', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Invalid token' })

    const {
      tier = 'voice_pro',
      persona_name,
      business_phone,
      greeting,
    } = req.body

    if (!VOICE_TIER_PRICES[tier])
      return res.status(400).json({ error: 'Invalid voice tier', code: 'INVALID_TIER' })
    if (!persona_name?.trim())
      return res.status(400).json({ error: 'اسم الوكيل الصوتي مطلوب' })

    const monthly = VOICE_TIER_PRICES[tier]
    const db = getPool()

    // Reject if user already has a pending/active VOICE subscription
    const hasServiceColumn = await hasSubscriptionsServiceColumn(db)
    const { rows: existing } = await db.query(
      `SELECT id FROM public.subscriptions
         WHERE user_id = $1
           AND ${hasServiceColumn ? "service = 'voice'" : "tier LIKE 'voice_%'"}
           AND status IN ('pending','active')
         LIMIT 1`,
      [user.id]
    )
    if (existing.length > 0)
      return res.status(409).json({
        error: 'لديك اشتراك وكيل صوتي قائم بالفعل.',
        code: 'ALREADY_SUBSCRIBED',
      })

    await db.query('BEGIN')
    try {
      const { rows: subRows } = await db.query(
        hasServiceColumn
          ? `INSERT INTO public.subscriptions
               (user_id, tier, status, monthly_amount, auto_renew, notes, service)
             VALUES ($1, $2, 'pending', $3, TRUE, $4, 'voice')
             RETURNING id`
          : `INSERT INTO public.subscriptions
               (user_id, tier, status, monthly_amount, auto_renew, notes)
             VALUES ($1, $2, 'pending', $3, TRUE, $4)
             RETURNING id`,
        [user.id, tier, monthly, 'اشتراك وكيل الهاتف الذكي — بانتظار إتمام الدفع']
      )
      const subId = subRows[0].id

      await db.query(
        `INSERT INTO public.voice_agents
           (user_id, subscription_id, persona_name, business_phone, greeting, status)
         VALUES ($1, $2, $3, $4, COALESCE($5, 'مرحباً، أنا المساعد الذكي. كيف يمكنني مساعدتك؟'), 'pending')
         ON CONFLICT (user_id) DO UPDATE
            SET subscription_id = EXCLUDED.subscription_id,
                persona_name    = EXCLUDED.persona_name,
                business_phone  = EXCLUDED.business_phone,
                greeting        = COALESCE(EXCLUDED.greeting, voice_agents.greeting),
                updated_at      = NOW()`,
        [
          user.id, subId,
          persona_name.trim(),
          business_phone?.trim() || null,
          greeting?.trim() || null,
        ]
      )

      await db.query('COMMIT')
      res.json({ success: true, subscription_id: subId })
    } catch (txErr) {
      await db.query('ROLLBACK')
      throw txErr
    }
  } catch (err) {
    console.error('voice-agent/onboarding error:', err)
    res.status(500).json({ error: err.message || 'خطأ داخلي في الخادم' })
  }
})

// ── GET /v1/voice-agent/me ────────────────────────────────────────────────────
// Returns the user's voice agent record + their voice subscription (or null).
app.get('/v1/voice-agent/me', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Invalid token' })

    const db = getPool()
    const { rows: agentRows } = await db.query(
      `SELECT id, user_id, subscription_id, persona_name, persona_description,
              greeting, business_phone, business_hours_start, business_hours_end,
              status, created_at, updated_at
         FROM public.voice_agents
        WHERE user_id = $1`,
      [user.id]
    )
    const hasServiceColumn = await hasSubscriptionsServiceColumn(db)
    const { rows: subRows } = await db.query(
      `SELECT id, tier, status, monthly_amount, start_date, end_date, auto_renew, ${hasServiceColumn ? 'service' : 'NULL AS service'}
         FROM public.subscriptions
        WHERE user_id = $1
          AND ${hasServiceColumn ? "service = 'voice'" : "tier LIKE 'voice_%'"}
        ORDER BY created_at DESC
        LIMIT 1`,
      [user.id]
    )
    if (subRows[0]) subRows[0].service = subRows[0].service || inferSubscriptionServiceFromTier(subRows[0].tier)

    res.json({
      agent:        agentRows[0] || null,
      subscription: subRows[0]   || null,
    })
  } catch (err) {
    console.error('voice-agent/me error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── PATCH /v1/voice-agent/persona ─────────────────────────────────────────────
// Update the agent's persona / training data. Requires an active voice sub.
app.patch('/v1/voice-agent/persona', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Invalid token' })

    const {
      persona_name,
      persona_description,
      greeting,
      business_phone,
      business_hours_start,
      business_hours_end,
    } = req.body

    const db = getPool()
    const hasServiceColumn = await hasSubscriptionsServiceColumn(db)
    const { rows: subRows } = await db.query(
      `SELECT status FROM public.subscriptions
        WHERE user_id = $1
          AND ${hasServiceColumn ? "service = 'voice'" : "tier LIKE 'voice_%'"}
          AND status = 'active'
        LIMIT 1`,
      [user.id]
    )
    if (!subRows.length)
      return res.status(402).json({
        error: 'Active Voice Agent subscription required.',
        code: 'PAYMENT_REQUIRED',
      })

    const { rows: updated } = await db.query(
      `UPDATE public.voice_agents SET
         persona_name         = COALESCE($1, persona_name),
         persona_description  = COALESCE($2, persona_description),
         greeting             = COALESCE($3, greeting),
         business_phone       = COALESCE($4, business_phone),
         business_hours_start = COALESCE($5, business_hours_start),
         business_hours_end   = COALESCE($6, business_hours_end),
         updated_at           = NOW()
       WHERE user_id = $7
       RETURNING id, persona_name, persona_description, greeting,
                 business_phone, business_hours_start, business_hours_end,
                 status, updated_at`,
      [
        persona_name?.trim() || null,
        persona_description?.trim() || null,
        greeting?.trim() || null,
        business_phone?.trim() || null,
        Number.isInteger(business_hours_start) ? business_hours_start : null,
        Number.isInteger(business_hours_end)   ? business_hours_end   : null,
        user.id,
      ]
    )
    if (!updated.length)
      return res.status(404).json({ error: 'Voice agent not found' })

    res.json({ success: true, agent: updated[0] })
  } catch (err) {
    console.error('voice-agent/persona error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── GET /v1/voice-agent/calls ─────────────────────────────────────────────────
// Lists call logs (paginated). Returns empty array until telephony is wired.
app.get('/v1/voice-agent/calls', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Invalid token' })

    const limit  = Math.min(parseInt(req.query.limit, 10)  || 50, 200)
    const offset = Math.max(parseInt(req.query.offset, 10) || 0,  0)

    const db = getPool()
    const { rows: agent } = await db.query(
      `SELECT id FROM public.voice_agents WHERE user_id = $1`,
      [user.id]
    )
    if (!agent.length) return res.json({ calls: [], total: 0 })

    const { rows: calls } = await db.query(
      `SELECT id, caller_phone, duration_seconds, status, sentiment,
              started_at, ended_at, created_at
         FROM public.call_logs
        WHERE voice_agent_id = $1
        ORDER BY started_at DESC
        LIMIT $2 OFFSET $3`,
      [agent[0].id, limit, offset]
    )
    const { rows: countRows } = await db.query(
      `SELECT COUNT(*)::int AS total FROM public.call_logs WHERE voice_agent_id = $1`,
      [agent[0].id]
    )

    res.json({ calls, total: countRows[0]?.total ?? 0 })
  } catch (err) {
    console.error('voice-agent/calls error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// Subscription email notifications — runs every 24 hours
// ══════════════════════════════════════════════════════════════════════════════
async function runSubscriptionNotifications() {
  const db = getPool()
  const APP_URL = process.env.APP_URL || 'https://splittech.sa'
  try {
    // 1. Reminder: subscriptions expiring in 7 days (send once per subscription)
    const { rows: expiring } = await db.query(`
      SELECT s.id, s.end_date, s.monthly_amount,
             st.name AS store_name,
             u.email AS owner_email
      FROM subscriptions s
      JOIN stores st ON st.subscription_id = s.id
      JOIN auth.users u ON u.id = s.user_id
      WHERE s.status = 'active'
        AND s.end_date::date = CURRENT_DATE + interval '7 days'
    `)
    for (const row of expiring) {
      if (!row.owner_email) continue
      await sendMail(
        row.owner_email,
        'تذكير: اشتراكك ينتهي خلال 7 أيام — SPLIT Intelligence',
        emailLayout(
          `تذكير بتجديد اشتراك ${row.store_name}`,
          `<h2 style="color:#1F2937;font-size:22px;font-weight:700;margin:0 0 6px;">اشتراكك ينتهي قريباً ⏰</h2>
          <p style="color:#6B7280;font-size:14px;margin:0 0 24px;">تذكير بتجديد اشتراك متجر <strong>${row.store_name}</strong></p>

          <table width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="background:#FEF9C3;border-radius:12px;margin:0 0 24px;">
            <tr><td style="padding:16px 20px;">
              <p style="color:#854D0E;font-size:14px;margin:0;line-height:1.8;">
                اشتراكك في منصة SPLIT Intelligence سينتهي بتاريخ
                <strong>${new Date(row.end_date).toLocaleDateString('ar-SA')}</strong>.<br>
                جدّد الآن لضمان استمرارية الخدمة دون انقطاع.
              </p>
            </td></tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="background:#F9FAFB;border-radius:12px;margin:0 0 28px;">
            <tr><td style="padding:16px 20px;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="color:#6B7280;font-size:13px;padding-bottom:6px;">المتجر:</td>
                  <td style="color:#1F2937;font-size:13px;font-weight:600;padding-bottom:6px;">${row.store_name}</td>
                </tr>
                <tr>
                  <td style="color:#6B7280;font-size:13px;padding-bottom:6px;">تاريخ الانتهاء:</td>
                  <td style="color:#DC2626;font-size:13px;font-weight:600;padding-bottom:6px;">${new Date(row.end_date).toLocaleDateString('ar-SA')}</td>
                </tr>
                <tr>
                  <td style="color:#6B7280;font-size:13px;">قيمة الاشتراك الشهري:</td>
                  <td style="color:#1F2937;font-size:13px;font-weight:600;">${row.monthly_amount} ريال</td>
                </tr>
              </table>
            </td></tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td align="center" style="padding:0 0 24px;">
              <a href="${APP_URL}/dashboard"
                 style="display:inline-block;background:#005F2D;color:#ffffff;font-size:15px;font-weight:700;
                        padding:14px 44px;border-radius:10px;text-decoration:none;">
                تجديد الاشتراك الآن
              </a>
            </td></tr>
          </table>

          <p style="color:#9CA3AF;font-size:13px;line-height:1.7;margin:0;border-top:1px solid #F3F4F6;padding-top:20px;">
            للمساعدة تواصل معنا: <a href="mailto:support@splittech.sa" style="color:#005F2D;">support@splittech.sa</a>
          </p>`
        )
      ).catch(e => console.error('subscription-reminder error:', e))
    }

    // 2. Expiry: subscriptions that expired today → mark expired + notify
    const { rows: expired } = await db.query(`
      UPDATE subscriptions s
      SET status = 'expired'
      FROM stores st, auth.users u
      WHERE st.subscription_id = s.id
        AND s.user_id = u.id
        AND s.status = 'active'
        AND s.end_date::date < CURRENT_DATE
      RETURNING s.id, s.end_date, st.name AS store_name, u.email AS owner_email
    `)
    for (const row of expired) {
      if (!row.owner_email) continue
      await sendMail(
        row.owner_email,
        'انتهى اشتراكك في SPLIT Intelligence',
        emailLayout(
          `انتهاء اشتراك ${row.store_name}`,
          `<h2 style="color:#1F2937;font-size:22px;font-weight:700;margin:0 0 6px;">انتهى اشتراكك 🔴</h2>
          <p style="color:#6B7280;font-size:14px;margin:0 0 24px;">بخصوص متجر <strong>${row.store_name}</strong></p>

          <p style="color:#374151;font-size:15px;line-height:1.8;margin:0 0 20px;">
            انتهت صلاحية اشتراكك في منصة SPLIT Intelligence بتاريخ
            <strong>${new Date(row.end_date).toLocaleDateString('ar-SA')}</strong>.
            تم إيقاف الوصول للوحة التحكم مؤقتاً حتى يتم التجديد.
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="background:#FEF2F2;border-radius:12px;margin:0 0 28px;">
            <tr><td style="padding:16px 20px;">
              <p style="color:#991B1B;font-size:14px;margin:0;line-height:1.8;">
                جدّد اشتراكك الآن لاستعادة الوصول الكامل لجميع الميزات وبيانات متجرك.
              </p>
            </td></tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td align="center" style="padding:0 0 24px;">
              <a href="${APP_URL}/subscription-expired"
                 style="display:inline-block;background:#005F2D;color:#ffffff;font-size:15px;font-weight:700;
                        padding:14px 44px;border-radius:10px;text-decoration:none;">
                تجديد الاشتراك
              </a>
            </td></tr>
          </table>

          <p style="color:#9CA3AF;font-size:13px;line-height:1.7;margin:0;border-top:1px solid #F3F4F6;padding-top:20px;">
            للمساعدة تواصل معنا: <a href="mailto:support@splittech.sa" style="color:#005F2D;">support@splittech.sa</a>
          </p>`
        )
      ).catch(e => console.error('subscription-expired-notify error:', e))
    }

    if (expiring.length || expired.length)
      console.log('[subscriptions] notification sweep', { reminders: expiring.length, expired: expired.length })
  } catch (err) {
    console.error('runSubscriptionNotifications error:', err.message)
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/analyze-frame  — Gemini API (paid tier, no quota limits)
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/analyze-frame', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.headers['apikey']
    if (!apiKey) return res.status(401).json({ error: 'مفتاح API مطلوب' })

    const db = getPool()
    const { rows } = await db.query(
      `SELECT sak.store_id, sak.is_active, sak.expires_at
       FROM public.store_api_keys sak WHERE sak.api_key = $1`,
      [apiKey]
    )
    if (!rows[0]?.is_active) return res.status(401).json({ error: 'مفتاح API غير صحيح' })

    const { image_base64, prompt } = req.body
    if (!image_base64 || !prompt) return res.status(400).json({ error: 'image_base64 و prompt مطلوبان' })

    const GEMINI_KEY = process.env.GEMINI_API_KEY
    if (!GEMINI_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY غير مضبوط' })

    const MODEL    = 'gemini-2.5-flash'
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`

    const aiRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            { inline_data: { mime_type: 'image/jpeg', data: image_base64 } },
          ],
        }],
        generationConfig: { maxOutputTokens: 8192, temperature: 0.7 },
      }),
      signal: AbortSignal.timeout(120_000),
    })

    if (!aiRes.ok) {
      const errText = await aiRes.text()
      console.error('Gemini API error:', aiRes.status, errText)
      return res.status(502).json({ error: 'خطأ من Gemini API', details: errText })
    }

    const data = await aiRes.json()
    // Gemini 2.5 may include thinking parts — get the last non-thought text
    const fParts = data?.candidates?.[0]?.content?.parts || []
    const fOut = [...fParts].reverse().find(p => !p.thought && p.text) || fParts[0]
    const text = fOut?.text || ''
    res.json({ text, finish_reason: data?.candidates?.[0]?.finishReason || 'STOP' })

  } catch (err) {
    console.error('analyze-frame error:', err)
    res.status(500).json({ error: 'خطأ داخلي في التحليل' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/analyze-data  — Text-only Gemini analysis (V11 — no images)
// Engine sends structured tracking JSON, Gemini returns business analysis
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/analyze-data', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.headers['apikey']
    if (!apiKey) return res.status(401).json({ error: 'مفتاح API مطلوب' })

    const db = getPool()
    const { rows } = await db.query(
      `SELECT sak.store_id, sak.is_active, sak.expires_at
       FROM public.store_api_keys sak WHERE sak.api_key = $1`,
      [apiKey]
    )
    if (!rows[0]?.is_active) return res.status(401).json({ error: 'مفتاح API غير صحيح' })

    const { prompt, store_id } = req.body
    if (!prompt) return res.status(400).json({ error: 'prompt مطلوب' })

    const GEMINI_KEY = process.env.GEMINI_API_KEY
    if (!GEMINI_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY غير مضبوط' })

    const MODEL    = 'gemini-2.5-flash'
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`

    const aiRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: prompt }],
        }],
        generationConfig: {
          maxOutputTokens: 4096,
          temperature: 0.4,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(90_000),
    })

    if (!aiRes.ok) {
      const errText = await aiRes.text()
      console.error('Gemini analyze-data error:', aiRes.status, errText)
      return res.status(502).json({ error: 'خطأ من Gemini API', details: errText })
    }

    const data = await aiRes.json()
    // Gemini 2.5 may return thinking parts before the actual JSON response.
    // Find the last non-thought text part (the actual output).
    const parts = data?.candidates?.[0]?.content?.parts || []
    const outputPart = [...parts].reverse().find(p => !p.thought && p.text) || parts[0]
    const rawText = outputPart?.text || '{}'

    // ── Robust Gemini JSON Sanitizer ─────────────────────────────────────
    // LLMs randomly violate "no markdown" instructions. This sanitizer is
    // the last line of defense against parse crashes.
    function sanitizeGeminiJson(text) {
      let s = text.trim()

      // 1. Strip leading prose before first { or [
      //    e.g. "Here is your JSON:\n{..." → "{..."
      const firstBrace = s.search(/[{[]/)
      if (firstBrace > 0) s = s.slice(firstBrace)

      // 2. Strip trailing prose after last } or ]
      const lastBrace = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'))
      if (lastBrace >= 0 && lastBrace < s.length - 1) s = s.slice(0, lastBrace + 1)

      // 3. Strip markdown code fences (```json ... ``` or ``` ... ```)
      s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

      // 4. Remove BOM or zero-width characters
      s = s.replace(/^﻿/, '').replace(/[​-‍﻿]/g, '')

      // 5. Fix common LLM JSON mistakes: trailing commas before } or ]
      s = s.replace(/,\s*([}\]])/g, '$1')

      return s
    }

    let parsed
    try {
      const clean = sanitizeGeminiJson(rawText)
      parsed = JSON.parse(clean)
    } catch (parseErr) {
      // Last resort: try to extract any JSON object via regex
      const match = rawText.match(/\{[\s\S]*\}/)
      if (match) {
        try {
          parsed = JSON.parse(sanitizeGeminiJson(match[0]))
        } catch {
          parsed = null
        }
      }

      if (!parsed) {
        console.warn('analyze-data: Gemini returned non-JSON:', rawText.slice(0, 300))
        parsed = {
          score: 50,
          status: 'review',
          summary: 'تعذّر تحليل الاستجابة — يرجى المحاولة مجدداً',
          ai_reasoning: 'لم يُرجع النظام بيانات منظمة في هذه الدورة',
          confidence_score: 0.3,
          observations: [],
          merchant_greeting: '',
          operational_defects: [],
          growth_opportunities_ar: [],
          camera_specific_status: [],
        }
      }
    }

    res.json(parsed)

  } catch (err) {
    console.error('analyze-data error:', err)
    res.status(500).json({ error: 'خطأ داخلي في التحليل' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /v1/my-invoices  — merchant's own payment history
// ══════════════════════════════════════════════════════════════════════════════
app.get('/v1/my-invoices', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })

    const db = getPool()
    const page  = Math.max(1, Number(req.query.page) || 1)
    const limit = 20
    const offset = (page - 1) * limit

    const { rows: txRows } = await db.query(
      `SELECT pt.id,
              'SPL-' || UPPER(RIGHT(pt.moyasar_id, 8)) AS invoice_num,
              pt.moyasar_id,
              pt.amount,
              pt.currency,
              pt.status,
              pt.initiated_at,
              sub.tier,
              sub.service,
              sub.end_date,
              sub.start_date
       FROM payment_transactions pt
       JOIN subscriptions sub ON sub.id = pt.subscription_id
       WHERE pt.user_id = $1
       ORDER BY pt.initiated_at DESC
       LIMIT $2 OFFSET $3`,
      [user.id, limit, offset]
    )

    const { rows: metaRows } = await db.query(
      `SELECT
         COUNT(*)::int                          AS total_count,
         COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0)::int  AS total_paid,
         COALESCE(MAX(initiated_at) FILTER (WHERE status = 'paid'), NULL) AS last_paid_at
       FROM payment_transactions
       WHERE user_id = $1`,
      [user.id]
    )

    res.json({
      invoices: txRows,
      meta: metaRows[0] || { total_count: 0, total_paid: 0, last_paid_at: null },
      page,
      limit,
    })
  } catch (err) {
    console.error('my-invoices error:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /v1/admin/billing  — master billing ledger (super_owner + it_support)
// ══════════════════════════════════════════════════════════════════════════════
app.get('/v1/admin/billing', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })
    const callerRole = await getUserRole(user.id)
    if (!['super_owner', 'it_support'].includes(callerRole)) return res.status(403).json({ error: 'Forbidden' })

    const db = getPool()
    const search = (req.query.search || '').trim()
    const page   = Math.max(1, parseInt(req.query.page) || 1)
    const limit  = 50
    const offset = (page - 1) * limit

    const searchClause = search
      ? `AND (pt.moyasar_id ILIKE $3 OR u.email ILIKE $3 OR ('SPL-' || UPPER(RIGHT(pt.moyasar_id, 8))) ILIKE $3)`
      : ''
    const params = search ? [limit, offset, `%${search}%`] : [limit, offset]

    const { rows: txRows } = await db.query(
      `SELECT pt.id, pt.moyasar_id, pt.amount, pt.currency, pt.status,
              pt.initiated_at, pt.updated_at,
              sub.tier, sub.service, sub.end_date,
              u.email,
              COALESCE(p.full_name, '') AS full_name,
              COALESCE(s.name, '')      AS store_name,
              'SPL-' || UPPER(RIGHT(pt.moyasar_id, 8)) AS invoice_num
         FROM payment_transactions pt
         JOIN subscriptions sub ON sub.id = pt.subscription_id
         JOIN auth.users    u   ON u.id = sub.user_id
         LEFT JOIN profiles p   ON p.id = sub.user_id
         LEFT JOIN (SELECT DISTINCT ON (subscription_id) * FROM stores ORDER BY subscription_id, created_at DESC) s
           ON s.subscription_id = sub.id
        WHERE pt.status = 'paid'
          ${searchClause}
        ORDER BY pt.initiated_at DESC
        LIMIT $1 OFFSET $2`,
      params
    )

    const { rows: metricRows } = await db.query(
      `SELECT
         COUNT(*)                                                          AS total_transactions,
         COALESCE(SUM(pt.amount), 0)                                      AS total_revenue,
         COALESCE(SUM(pt.amount) FILTER (
           WHERE pt.initiated_at >= date_trunc('month', NOW())), 0)       AS mrr,
         COALESCE(SUM(pt.amount) FILTER (
           WHERE pt.initiated_at >= date_trunc('year', NOW())), 0)        AS arr_ytd,
         COUNT(*) FILTER (
           WHERE pt.initiated_at >= date_trunc('month', NOW()))            AS new_this_month
       FROM payment_transactions pt
       WHERE pt.status = 'paid'`
    )

    res.json({ transactions: txRows, metrics: metricRows[0], page, limit })
  } catch (err) {
    console.error('admin-billing error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// PATCH /v1/admin/merchant/:userId/suspend  — suspend or restore merchant
// ══════════════════════════════════════════════════════════════════════════════
app.patch('/v1/admin/merchant/:userId/suspend', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })
    const callerRole = await getUserRole(user.id)
    if (!['super_owner', 'it_support'].includes(callerRole)) return res.status(403).json({ error: 'Forbidden' })

    const { userId } = req.params
    const { action, reason } = req.body // action: 'suspend' | 'restore'
    if (!['suspend', 'restore'].includes(action)) return res.status(400).json({ error: 'action must be suspend or restore' })

    const db = getPool()
    const isSuspend = action === 'suspend'
    const newStatus = isSuspend ? 'suspended' : 'active'

    await db.query('BEGIN')
    try {
      await db.query(
        `UPDATE profiles SET is_banned = $1, banned_at = $2, banned_reason = $3 WHERE id = $4`,
        [isSuspend, isSuspend ? new Date() : null, isSuspend ? (reason || 'Suspended by admin') : null, userId]
      )
      await db.query(
        `UPDATE subscriptions SET status = $1, updated_at = NOW() WHERE user_id = $2`,
        [newStatus, userId]
      )
      await db.query(
        `UPDATE stores SET store_status = $1, updated_at = NOW() WHERE user_id = $2`,
        [newStatus, userId]
      )
      if (isSuspend) {
        await db.query(
          `UPDATE store_api_keys sak SET is_active = FALSE
             FROM stores s WHERE s.id = sak.store_id AND s.user_id = $1`,
          [userId]
        )
      } else {
        await db.query(
          `UPDATE store_api_keys sak SET is_active = TRUE
             FROM stores s
             JOIN subscriptions sub ON sub.id = s.subscription_id
            WHERE s.id = sak.store_id AND s.user_id = $1
              AND sub.end_date >= CURRENT_DATE AND sak.revoked_at IS NULL`,
          [userId]
        )
      }
      await db.query('COMMIT')
    } catch (e) {
      await db.query('ROLLBACK')
      throw e
    }

    logAdminAction(user.id, callerRole, action === 'suspend' ? 'suspend_merchant' : 'restore_merchant', 'user', userId, { reason })
    console.log(`[admin] merchant ${userId} ${action}ed by ${user.id}`)
    res.json({ success: true, action, userId })
  } catch (err) {
    console.error('admin-suspend error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// DELETE /v1/admin/merchant/:userId  — soft-delete merchant (super_owner only)
// ══════════════════════════════════════════════════════════════════════════════
app.delete('/v1/admin/merchant/:userId', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })
    const callerRole = await getUserRole(user.id)
    if (callerRole !== 'super_owner') return res.status(403).json({ error: 'super_owner only' })

    const { userId } = req.params
    const db = getPool()

    await db.query('BEGIN')
    try {
      // Revoke all access first
      await db.query(`UPDATE store_api_keys sak SET is_active = FALSE, revoked_at = NOW(), revoked_by = $1
                        FROM stores s WHERE s.id = sak.store_id AND s.user_id = $2`, [user.id, userId])
      await db.query(`UPDATE stores SET store_status = 'deleted', updated_at = NOW() WHERE user_id = $1`, [userId])
      await db.query(`UPDATE subscriptions SET status = 'cancelled', updated_at = NOW() WHERE user_id = $1`, [userId])
      await db.query(`UPDATE profiles SET deleted_at = NOW(), is_banned = TRUE WHERE id = $1`, [userId])
      await db.query('COMMIT')
    } catch (e) {
      await db.query('ROLLBACK')
      throw e
    }

    logAdminAction(user.id, 'super_owner', 'delete_merchant', 'user', userId, {})
    console.log(`[admin] merchant ${userId} soft-deleted by ${user.id}`)
    res.json({ success: true, userId })
  } catch (err) {
    console.error('admin-delete error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/store/questions — merchant submits custom audit questions for approval
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/store/questions', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })

    const { questions } = req.body
    if (!Array.isArray(questions)) return res.status(400).json({ error: 'questions must be an array' })
    const cleaned = questions.map(q => String(q || '').trim()).filter(Boolean).slice(0, 5)
    if (!cleaned.length) return res.status(400).json({ error: 'أضف سؤالاً واحداً على الأقل' })

    const db = getPool()
    const { rows } = await db.query(
      `UPDATE public.stores
         SET pending_custom_questions = $1, custom_questions_approved = false
       WHERE user_id = $2
       RETURNING id`,
      [JSON.stringify(cleaned), user.id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'لم يتم العثور على المتجر' })
    res.json({ success: true, pending: cleaned })
  } catch (err) {
    console.error('store/questions error:', err)
    res.status(500).json({ error: 'خطأ داخلي' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/store/working-hours — merchant submits working hours for admin approval
// Always allowed — merchant can request a change even after prior approval.
// Active hours stay in working_hours until admin approves the new pending request.
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/store/working-hours', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })

    const { start, end } = req.body
    if (typeof start !== 'number' || typeof end !== 'number' || start < 0 || start > 23 || end < 0 || end > 23)
      return res.status(400).json({ error: 'start و end يجب أن تكون أرقاماً بين 0 و 23' })
    if (start === end)
      return res.status(400).json({ error: 'وقت الفتح والإغلاق لا يمكن أن يتطابقا' })

    const db = getPool()
    const { rows: check } = await db.query(
      `SELECT id FROM public.stores WHERE user_id = $1`, [user.id]
    )
    if (!check[0]) return res.status(404).json({ error: 'لم يتم العثور على المتجر' })

    // Store the new request as pending; existing approved hours remain active
    // until admin reviews and approves the change.
    await db.query(
      `UPDATE public.stores
          SET pending_working_hours  = $1,
              working_hours_approved = false
        WHERE user_id = $2`,
      [JSON.stringify({ start, end }), user.id]
    )
    res.json({ success: true, pending: { start, end } })
  } catch (err) {
    console.error('store/working-hours error:', err)
    res.status(500).json({ error: 'خطأ داخلي' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/store/daily-close
// Called by Electron when engine stops at end of working hours.
// Aggregates today's analytics_logs and emails the merchant a daily summary.
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/store/daily-close', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.headers['apikey']
    if (!apiKey) return res.status(401).json({ error: 'مفتاح API مطلوب' })

    const keyRecord = await validateApiKey(apiKey)
    if (!keyRecord?.is_active) return res.status(401).json({ error: 'مفتاح API غير صحيح أو غير نشط' })
    if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date())
      return res.status(403).json({ error: 'الترخيص منتهي الصلاحية' })

    const storeId = keyRecord.store_id
    const db = getPool()

    // Store info + merchant email
    const { rows: sRows } = await db.query(`
      SELECT s.id, s.name, u.email,
             COALESCE(p.full_name, u.email) AS merchant_name
      FROM public.stores s
      JOIN auth.users u ON u.id = s.user_id
      LEFT JOIN public.profiles p ON p.id = s.user_id
      WHERE s.id = $1
    `, [storeId])
    if (!sRows.length) return res.status(404).json({ error: 'متجر غير موجود' })
    const store = sRows[0]

    // KSA today boundaries  (UTC+3)
    const SAUDI_MS = 3 * 3600 * 1000
    const nowUTC   = new Date()
    const nowSaudi = new Date(nowUTC.getTime() + SAUDI_MS)
    const midnightSaudi = new Date(nowSaudi.getFullYear(), nowSaudi.getMonth(), nowSaudi.getDate())
    const todayStartUTC = new Date(midnightSaudi.getTime() - SAUDI_MS)

    const { rows: logs } = await db.query(`
      SELECT score, status, summary, observations, ai_reasoning, created_at
      FROM public.analytics_logs
      WHERE store_id = $1 AND created_at >= $2
      ORDER BY created_at ASC
    `, [storeId, todayStartUTC.toISOString()])

    if (!logs.length) return res.json({ sent: false, reason: 'no_data_today' })

    // Aggregate
    const total     = logs.length
    const avgScore  = Math.round(logs.reduce((s, l) => s + (l.score || 0), 0) / total)
    const passCount = logs.filter(l => l.status === 'pass').length
    const warnCount = logs.filter(l => l.status === 'warning').length
    const failCount = logs.filter(l => l.status === 'fail').length

    // Top 5 repeated observations
    const obsCounts = {}
    logs.flatMap(l => Array.isArray(l.observations) ? l.observations : [])
      .forEach(o => { if (o) obsCounts[String(o)] = (obsCounts[String(o)] || 0) + 1 })
    const topObs = Object.entries(obsCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([obs]) => obs)

    // Latest AI reasoning
    const latestReasoning = [...logs].reverse().find(l => l.ai_reasoning)?.ai_reasoning || null

    const dateStr    = nowSaudi.toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    const scoreColor = avgScore >= 75 ? '#10b981' : avgScore >= 50 ? '#f59e0b' : '#ef4444'
    const scoreBg    = avgScore >= 75 ? '#f0fdf4' : avgScore >= 50 ? '#fffbeb' : '#fef2f2'

    const obsHtml = topObs.length
      ? topObs.map(o => `<li style="padding:8px 12px;margin-bottom:6px;background:#F8FAFC;border-radius:8px;border-right:3px solid #005F2D;font-size:13px;color:#374151;">${String(o).slice(0, 120)}</li>`).join('')
      : '<li style="color:#9CA3AF;font-size:13px;list-style:none;">لا توجد ملاحظات مسجلة اليوم</li>'

    const reasoningHtml = latestReasoning
      ? `<div style="margin-top:24px;"><p style="font-size:13px;font-weight:700;color:#374151;margin:0 0 10px;">💡 آخر تحليل ذكاء اصطناعي:</p><div style="background:#F8FAFC;border:1px solid #E5E7EB;border-radius:12px;padding:16px;font-size:13px;color:#6B7280;line-height:1.7;">${String(latestReasoning).slice(0, 400)}${latestReasoning.length > 400 ? '…' : ''}</div></div>`
      : ''

    const subject = `📊 التقرير اليومي — ${store.name} — ${dateStr}`
    const html = emailLayout(subject, `
      <h2 style="margin:0 0 4px;font-size:20px;color:#111827;">مرحباً ${store.merchant_name}،</h2>
      <p style="color:#6B7280;font-size:14px;margin:0 0 24px;">إليك ملخص نشاط متجرك <strong>${store.name}</strong> ليوم ${dateStr}</p>
      <div style="background:${scoreBg};border-radius:16px;padding:24px;text-align:center;margin-bottom:24px;">
        <p style="margin:0 0 6px;font-size:13px;color:#6B7280;">متوسط نتيجة التدقيق</p>
        <p style="margin:0;font-size:52px;font-weight:900;color:${scoreColor};line-height:1;">${avgScore}</p>
        <p style="margin:4px 0 0;font-size:13px;color:${scoreColor};">/ 100</p>
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
        <tr>
          <td style="width:33%;text-align:center;padding:12px;background:#f0fdf4;border-radius:12px;">
            <p style="margin:0;font-size:22px;font-weight:800;color:#10b981;">${passCount}</p>
            <p style="margin:4px 0 0;font-size:11px;color:#6B7280;">✅ ناجح</p>
          </td>
          <td style="width:4%;"></td>
          <td style="width:33%;text-align:center;padding:12px;background:#fffbeb;border-radius:12px;">
            <p style="margin:0;font-size:22px;font-weight:800;color:#f59e0b;">${warnCount}</p>
            <p style="margin:4px 0 0;font-size:11px;color:#6B7280;">⚠️ تحذير</p>
          </td>
          <td style="width:4%;"></td>
          <td style="width:33%;text-align:center;padding:12px;background:#fef2f2;border-radius:12px;">
            <p style="margin:0;font-size:22px;font-weight:800;color:#ef4444;">${failCount}</p>
            <p style="margin:4px 0 0;font-size:11px;color:#6B7280;">❌ فشل</p>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 6px;font-size:12px;color:#9CA3AF;text-align:center;">إجمالي جلسات التدقيق: ${total}</p>
      <div style="margin-top:24px;">
        <p style="font-size:13px;font-weight:700;color:#374151;margin:0 0 10px;">🔍 أبرز الملاحظات:</p>
        <ul style="margin:0;padding:0;list-style:none;">${obsHtml}</ul>
      </div>
      ${reasoningHtml}
      <div style="margin-top:28px;text-align:center;">
        <a href="${process.env.APP_URL || 'https://splittech.sa'}/dashboard/audits"
           style="display:inline-block;background:#005F2D;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 32px;border-radius:12px;">
          عرض كامل التقارير
        </a>
      </div>
    `)

    await sendMail(store.email, subject, html)
    console.log(JSON.stringify({ event: 'daily_close_email', store_id: storeId, total, avgScore }))
    res.json({ sent: true, total, avgScore, passCount, warnCount, failCount })
  } catch (err) {
    console.error('daily-close error:', err.message)
    res.status(500).json({ error: 'خطأ داخلي' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /v1/demo/scenarios  — public, no auth
// GET /v1/demo/analyze?scenario=1  — public, no auth, rate-limited
// Returns pre-computed realistic audit data for the website demo page.
// Scenario 1: Bakery (PASS 84%)  |  2: Restaurant (WARNING 61%)  |  3: Clothing (FAIL 39%)
// ══════════════════════════════════════════════════════════════════════════════
const DEMO_SCENARIOS = [
  {
    id: 1,
    store_type: 'bakery',
    name_ar: 'مخبز النخبة — الفرع الرئيسي',
    name_en: 'Elite Bakery — Main Branch',
    icon: '🥐',
    score: 84,
    status: 'pass',
    confidence_score: 0.91,
    summary_ar: 'المتجر في حالة ممتازة — الزي موحّد، الرفوف منظمة، ومنطقة الصندوق نظيفة.',
    summary_en: 'Store is in excellent condition — uniform dress code, organized shelves, and clean checkout area.',
    observations_ar: [
      'زي الموظفين موحّد ونظيف بالكامل',
      'المنتجات مرتبة على الرفوف بشكل صحيح',
      'لافتات الأسعار واضحة ومقروءة',
      'منطقة الصندوق منظمة وخالية من الفوضى',
      'الإضاءة كافية في جميع أقسام المتجر',
    ],
    issues_ar: [
      'بعض المنتجات في الواجهة قريبة من تاريخ الانتهاء',
      'الزاوية الخلفية تحتاج لمسح إضافي',
    ],
    recommendations_ar: [
      'مراجعة تواريخ انتهاء صلاحية المنتجات في الواجهة يومياً',
      'إضافة جدول تنظيف للزاوية الخلفية كل ساعتين',
      'الحفاظ على مستوى الزي الموحد الممتاز الحالي',
    ],
    ai_reasoning: 'التحليل مبني على 10 فريمات متتالية خلال الفترة الصباحية. معدل الثقة مرتفع نظراً لوضوح الإضاءة وثبات الكاميرا.',
    trend: 'up',
  },
  {
    id: 2,
    store_type: 'restaurant',
    name_ar: 'مطعم الأصيل — فرع العليا',
    name_en: 'Al-Aseel Restaurant — Olaya Branch',
    icon: '🍽️',
    score: 61,
    status: 'warning',
    confidence_score: 0.87,
    summary_ar: 'يوجد عدة ملاحظات تستوجب المعالجة — زي غير موحد لدى موظف، وطاولتان لم تُنظَّفا بعد المغادرة.',
    summary_en: 'Several issues require attention — non-uniform dress for one staff member and two uncleaned tables.',
    observations_ar: [
      'موظف الاستقبال بدون كمامة رغم وجود عملاء',
      'طاولتان في القسم الأيسر لم تُنظَّفا بعد المغادرة',
      'منطقة الكاشير منظمة وموظفها بزي صحيح',
      'إضاءة المطبخ الخارجي كافية',
      'لافتات القائمة واضحة',
    ],
    issues_ar: [
      'عدم الالتزام بالكمامة — مخالفة صحية',
      'بطء في تنظيف الطاولات بعد مغادرة العملاء',
      'كرسي مكسور في الزاوية الجنوبية',
    ],
    recommendations_ar: [
      'تنبيه فوري لموظف الاستقبال بضرورة ارتداء الكمامة',
      'تخصيص موظف لمتابعة الطاولات بشكل دوري كل 10 دقائق',
      'إصلاح أو استبدال الكرسي المكسور اليوم',
    ],
    ai_reasoning: 'رُصدت المخالفات خلال ساعة الذروة (12:30 - 1:00 ظهراً). يُنصح بمراجعة الإجراءات التشغيلية في فترات الازدحام.',
    trend: 'stable',
  },
  {
    id: 3,
    store_type: 'clothing',
    name_ar: 'متجر الموضة — فرع النخيل',
    name_en: 'Fashion Store — Nakheel Branch',
    icon: '👕',
    score: 39,
    status: 'fail',
    confidence_score: 0.83,
    summary_ar: 'الوضع يستدعي تدخلاً فورياً — بضائع مكدسة، موظف منشغل بالهاتف، وعطل في الإضاءة.',
    summary_en: 'Situation requires immediate action — cluttered merchandise, staff on phone, lighting malfunction.',
    observations_ar: [
      'بضائع مكدسة بشكل عشوائي في مدخل المتجر',
      'موظف يستخدم الهاتف الشخصي في منطقة الاستقبال',
      'إضاءة معطلة في قسم الأطفال (3 لمبات)',
      'بعض العلامات السعرية مفقودة أو غير واضحة',
      'نظافة الأرضية مقبولة في المدخل الرئيسي',
    ],
    issues_ar: [
      'مدخل المتجر مكدس يعيق حركة العملاء',
      'الموظف غير منتبه للعملاء ويستخدم هاتفه',
      'عطل في الإضاءة يؤثر على تجربة التسوق',
      'غياب لافتات الأسعار في 40% من المنتجات',
    ],
    recommendations_ar: [
      'إزالة البضائع المكدسة من المدخل فوراً',
      'تطبيق سياسة حظر الهاتف الشخصي أثناء الدوام',
      'الإبلاغ عن عطل الإضاءة لقسم الصيانة اليوم',
      'مراجعة وإضافة لافتات الأسعار المفقودة',
    ],
    ai_reasoning: 'التدقيق جرى في ساعة هادئة (3:00 عصراً) ومع ذلك رُصدت مخالفات متعددة، مما يدل على مشكلة منهجية وليست ظرفية.',
    trend: 'down',
  },
]

app.get('/v1/demo/scenarios', (req, res) => {
  res.json(DEMO_SCENARIOS.map(({ id, store_type, name_ar, name_en, icon, score, status }) => ({
    id, store_type, name_ar, name_en, icon, score, status,
  })))
})

app.get('/v1/demo/analyze', (req, res) => {
  // Rate limit: 20 per IP per hour
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown'
  const rl = checkRateLimit(`demo:${ip}`, 60 * 60_000, 20)
  if (!rl.allowed) return res.status(429).json({ error: 'تجاوزت الحد المسموح. حاول بعد ساعة.' })

  const id = parseInt(req.query.scenario || '1', 10)
  const scenario = DEMO_SCENARIOS.find(s => s.id === id)
  if (!scenario) return res.status(404).json({ error: 'السيناريو غير موجود' })

  // Simulate slight variation in score (±3) to make it feel live
  const variation = Math.floor(Math.random() * 7) - 3
  const score = Math.min(100, Math.max(0, scenario.score + variation))

  res.json({ ...scenario, score, analyzed_at: new Date().toISOString() })
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /v1/notify-lead
// Called by the frontend after a successful insert to early_access_requests
// or contact_requests.  No auth required (public form submissions).
// Fetches super_owner + it_support emails from DB → sends notification via Resend.
// Rate-limited to 1 call per email per 5 minutes to prevent spam.
// ══════════════════════════════════════════════════════════════════════════════
app.post('/v1/notify-lead', async (req, res) => {
  try {
    const { table, record } = req.body || {}

    if (!table || !record || !['early_access_requests', 'contact_requests'].includes(table)) {
      return res.status(400).json({ error: 'Invalid payload' })
    }

    // Rate limit: 1 per source email per 5 min (prevents double-sends on retry)
    const rl = checkRateLimit(`notify-lead:${record.email}`, 5 * 60_000, 1)
    if (!rl.allowed) return res.status(429).json({ skipped: true, reason: 'rate_limited' })

    // Get all super_owner + it_support emails from DB
    const { rows } = await getPool().query(`
      SELECT u.email, COALESCE(p.full_name, u.email) AS full_name
      FROM auth.users u
      JOIN public.user_roles ur ON ur.user_id = u.id
      LEFT JOIN public.profiles p ON p.id = u.id
      WHERE ur.role IN ('super_owner', 'it_support')
        AND u.email IS NOT NULL
        AND u.email != ''
    `)

    if (!rows.length) {
      console.warn('[notify-lead] No admin emails found in DB')
      return res.json({ sent: 0 })
    }

    const adminEmails = rows.map(r => r.email)

    // ── Build email ───────────────────────────────────────────
    const date = new Date(record.created_at || new Date()).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })

    const tableRow = (label, value) => value
      ? `<tr>
           <td style="padding:10px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-size:13px;font-weight:600;color:#6b7280;white-space:nowrap;width:140px">${label}</td>
           <td style="padding:10px 12px;border:1px solid #e5e7eb;font-size:14px;color:#111827">${value}</td>
         </tr>`
      : ''

    const bizLabel = { retail: 'بيع بالتجزئة', restaurant: 'مطعم', logistics: 'لوجستيات', laundry: 'غسيل ملابس', other: 'أخرى' }
    const waLink = phone => `https://wa.me/966${(phone || '').replace(/^0/, '')}`

    let subject, bodyHtml

    if (table === 'early_access_requests') {
      subject = `🔔 طلب وصول مبكر جديد — ${record.full_name} (${record.store_name})`
      bodyHtml = `
        <h2 style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:800">🔔 طلب وصول مبكر جديد</h2>
        <p style="margin:0 0 20px;color:#6b7280;font-size:14px">وصل طلب جديد عبر صفحة الوصول المبكر — يرجى التواصل في أقرب وقت.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          ${tableRow('👤 الاسم', record.full_name)}
          ${tableRow('🏪 المتجر', record.store_name)}
          ${tableRow('🏢 نوع النشاط', bizLabel[record.business_type] || record.business_type)}
          ${tableRow('📞 الهاتف', `<a href="tel:${record.phone}" style="color:#005F2D">${record.phone}</a>`)}
          ${tableRow('📧 البريد', `<a href="mailto:${record.email}" style="color:#005F2D">${record.email}</a>`)}
          ${tableRow('🏙️ المدينة', record.city)}
          ${tableRow('📅 التاريخ', date)}
          ${record.notes ? tableRow('📝 ملاحظات', record.notes) : ''}
        </table>
        <div style="margin-top:24px;display:flex;gap:12px">
          <a href="${waLink(record.phone)}" style="display:inline-block;margin-left:8px;background:#25D366;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:700;font-size:13px">تواصل واتساب</a>
          <a href="mailto:${record.email}" style="display:inline-block;background:#005F2D;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:700;font-size:13px">إرسال بريد</a>
        </div>`

    } else {
      subject = `💬 رسالة تواصل جديدة — ${record.full_name} | ${record.subject}`
      bodyHtml = `
        <h2 style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:800">💬 رسالة تواصل جديدة</h2>
        <p style="margin:0 0 20px;color:#6b7280;font-size:14px">وصلت رسالة جديدة عبر صفحة التواصل.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          ${tableRow('👤 الاسم', record.full_name)}
          ${record.company ? tableRow('🏢 الشركة', record.company) : ''}
          ${tableRow('📞 الهاتف', `<a href="tel:${record.phone}" style="color:#1e40af">${record.phone}</a>`)}
          ${tableRow('📧 البريد', `<a href="mailto:${record.email}" style="color:#1e40af">${record.email}</a>`)}
          ${tableRow('📌 الموضوع', record.subject)}
          ${tableRow('📅 التاريخ', date)}
        </table>
        <div style="margin:20px 0;background:#f8fafc;border-right:4px solid #3b82f6;padding:16px;border-radius:8px">
          <p style="margin:0 0 6px;color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px">الرسالة</p>
          <p style="margin:0;color:#1f2937;font-size:14px;line-height:1.7;white-space:pre-wrap">${record.message}</p>
        </div>
        <div style="margin-top:8px">
          <a href="${waLink(record.phone)}" style="display:inline-block;margin-left:8px;background:#25D366;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:700;font-size:13px">تواصل واتساب</a>
          <a href="mailto:${record.email}?subject=رد: ${encodeURIComponent(record.subject || '')}" style="display:inline-block;background:#1e40af;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:700;font-size:13px">الرد بالبريد</a>
        </div>`
    }

    const html = emailLayout(subject, bodyHtml)
    await sendMail(adminEmails, subject, html)

    console.log(`[notify-lead] table=${table} from=${record.email} sent to ${adminEmails.length} admins`)
    res.json({ sent: adminEmails.length, recipients: adminEmails })

  } catch (err) {
    console.error('[notify-lead] error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

const port = Number(process.env.PORT) || 8080

// Run migrations to completion BEFORE accepting any HTTP traffic.
// Previously migrations ran fire-and-forget inside app.listen(), causing
// "column does not exist" errors for requests that arrived before the
// ALTER TABLE statements finished.
runMigrations().finally(() => {
  app.listen(port, () => {
    console.log(`splittech-api listening on :${port}`)
    runSubscriptionNotifications()
    setInterval(runSubscriptionNotifications, 24 * 60 * 60 * 1000)
  })
})
