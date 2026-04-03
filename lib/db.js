// ============================================================
// lib/db.js — Database abstraction layer
//
// TO SWITCH DATABASE: only edit the ACTIVE ADAPTER section.
// All API routes import from here — nothing else ever changes.
//
// Available adapters:
//   neon      → Neon / Vercel Postgres
//   supabase  → Supabase Postgres
//   postgres  → Any standard Postgres (AWS, Railway, Azure)
// ============================================================

// ============================================================
// ACTIVE ADAPTER: STANDARD POSTGRES (Azure)
// Env variable needed: DATABASE_URL
// ============================================================
import postgres from 'postgres'

var sql

function getDb() {
  if (!sql) {
    var url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set.')
    sql = postgres(url, { ssl: 'require' })
  }
  return async function(query, params) {
    
var safeParams = (params || []).map(function(p) {
  if (p === undefined) return null
  if (p !== null && typeof p === 'object') return JSON.stringify(p)
  return p
})
      
    return await sql.unsafe(query, safeParams)
  }
}
// ============================================================
// PUBLIC API — the only functions your routes ever call
// ============================================================
export async function query(sqlText, params) {
  try {
    var db = getDb()
    var result = await db(sqlText, params || [])
    return Array.isArray(result) ? result : []
  } catch (err) {
    console.error('DB query error:', err.message)
    throw new Error('Database error: ' + err.message)
  }
}

export async function queryOne(sqlText, params) {
  var rows = await query(sqlText, params)
  return rows[0] || null
}

export async function execute(sqlText, params) {
  return await query(sqlText, params)
}

export async function ping() {
  try {
    await query('SELECT 1')
    return true
  } catch (e) {
    return false
  }
}
