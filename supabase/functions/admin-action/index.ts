// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

class AppError extends Error {
  code: string
  status: number
  constructor(message: string, code = 'bad_request', status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

const fail = (message: string, code = 'bad_request', status = 400): never => {
  throw new AppError(message, code, status)
}

async function getAuthInfo(adminClient: any, ids: string[]): Promise<Record<string, { email: string | null; last_sign_in_at: string | null }>> {
  const uniqueIds = Array.from(new Set((ids || []).filter(Boolean)))
  if (uniqueIds.length === 0) return {}
  const map: Record<string, { email: string | null; last_sign_in_at: string | null }> = {}
  const results = await Promise.allSettled(uniqueIds.map(id => adminClient.auth.admin.getUserById(id)))
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value?.data?.user) {
      const u = r.value.data.user
      map[u.id] = { email: u.email ?? null, last_sign_in_at: u.last_sign_in_at ?? null }
    }
  }
  return map
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl      = Deno.env.get('SUPABASE_URL')              ?? ''
    const serviceRoleKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader) fail('未授权请求', 'unauthorized', 401)

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const token = authHeader.replace(/^Bearer\s+/i, '')
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token)
    if (userError || !user) fail('未授权请求', 'unauthorized', 401)

    let callerIsAdmin = false
    try {
      const { data: callerProfile } = await adminClient
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single()
      callerIsAdmin = callerProfile?.is_admin === true
    } catch (_) {
      callerIsAdmin = false
    }

    if (!callerIsAdmin) {
      fail('权限不足：仅管理员可执行此操作', 'not_admin', 403)
    }

    let body: any = {}
    try {
      body = await req.json()
    } catch (_) {
      fail('请求体必须是 JSON', 'bad_request', 400)
    }
    const { action, user_id } = body || {}

    if (!action) fail('缺少 action 参数', 'bad_request', 400)

    if (action !== 'search_users' && action !== 'list_users' && !user_id) {
      fail('缺少 user_id 参数', 'bad_request', 400)
    }

    if (user_id && user_id === user.id && (action === 'ban' || action === 'unban')) {
      fail('不能对自己的账号执行封禁操作', 'bad_request', 400)
    }

    switch (action) {
      case 'ban': {
        const { error } = await adminClient
          .from('profiles')
          .update({ is_banned: true })
          .eq('id', user_id)
        if (error) throw error
        return respond({ success: true, action: 'ban', user_id })
      }

      case 'unban': {
        const { error } = await adminClient
          .from('profiles')
          .update({ is_banned: false })
          .eq('id', user_id)
        if (error) throw error
        return respond({ success: true, action: 'unban', user_id })
      }

      case 'set_storage_quota': {
        const { bytes } = body
        if (typeof bytes !== 'number' || bytes < 0) {
          fail('bytes 参数无效，必须为非负整数', 'bad_request', 400)
        }
        const { error } = await adminClient
          .from('profiles')
          .update({ storage_quota_bytes: bytes })
          .eq('id', user_id)
        if (error) throw error
        return respond({ success: true, action: 'set_storage_quota', user_id, bytes })
      }

      case 'get_user': {
        const { data, error } = await adminClient
          .from('profiles')
          .select('id, username, avatar_url, is_admin, is_banned, storage_used, storage_quota_bytes, created_at, one_signal_player_id')
          .eq('id', user_id)
          .single()
        if (error) throw error
        const authMap = await getAuthInfo(adminClient, [user_id])
        const info = authMap[user_id]
        return respond({ success: true, profile: { ...data, email: info?.email ?? null, last_login_at: info?.last_sign_in_at ?? null } })
      }

      case 'search_users': {
        const { query, limit = 20 } = body
        if (!query || query.trim().length < 1) fail('搜索词不能为空', 'bad_request', 400)
        const q = query.trim()
        const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 200))

        const { data: byName, error: nameErr } = await adminClient
          .from('profiles')
          .select('id, username, avatar_url, is_banned, is_admin, storage_used, storage_quota_bytes, created_at')
          .ilike('username', `%${q}%`)
          .order('created_at', { ascending: false })
          .limit(safeLimit)
        if (nameErr) throw nameErr

        // Search auth users by email using admin API
        let emailMatchIds: string[] = []
        try {
          const { data: listed } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 200 })
          if (listed?.users) {
            const lowerQ = q.toLowerCase()
            emailMatchIds = listed.users
              .filter((u: any) => u.email && u.email.toLowerCase().includes(lowerQ))
              .map((u: any) => u.id)
          }
        } catch (_) {}

        const nameIds = new Set((byName || []).map((u: any) => u.id))
        const extraIds = emailMatchIds.filter(id => !nameIds.has(id))
        let extraProfiles: any[] = []
        if (extraIds.length > 0) {
          const { data: ep } = await adminClient
            .from('profiles')
            .select('id, username, avatar_url, is_banned, is_admin, storage_used, storage_quota_bytes, created_at')
            .in('id', extraIds)
          if (ep) extraProfiles = ep
        }

        const allProfiles = [...(byName || []), ...extraProfiles]
        const authMap = await getAuthInfo(adminClient, allProfiles.map((u: any) => u.id))

        const users = allProfiles.map((u: any) => ({
          ...u,
          email: authMap[u.id]?.email ?? null,
          last_login_at: authMap[u.id]?.last_sign_in_at ?? null,
        }))
        return respond({ success: true, users, limit: safeLimit })
      }

      case 'list_users': {
        const { limit = 50, offset = 0 } = body || {}
        const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200))
        const safeOffset = Math.max(0, Number(offset) || 0)

        const { data, error } = await adminClient
          .from('profiles')
          .select('id, username, avatar_url, is_banned, is_admin, storage_used, storage_quota_bytes, created_at')
          .order('created_at', { ascending: false })
          .range(safeOffset, safeOffset + safeLimit - 1)
        if (error) throw error

        const authMap = await getAuthInfo(adminClient, (data || []).map((u: any) => u.id))

        const users = (data || []).map((u: any) => ({
          ...u,
          email: authMap[u.id]?.email ?? null,
          last_login_at: authMap[u.id]?.last_sign_in_at ?? null,
        }))
        return respond({ success: true, users, limit: safeLimit, offset: safeOffset })
      }

      default:
        fail(`未知 action: ${action}`, 'bad_request', 400)
    }
  } catch (err) {
    console.error('[admin-action] error:', err)
    const status = err instanceof AppError
      ? err.status
      : Number(err?.status || err?.statusCode || 400)
    const code = err instanceof AppError
      ? err.code
      : (err?.code || 'admin_action_failed')
    const message = err?.message || '请求失败'
    return new Response(
      JSON.stringify({ error: message, code }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status }
    )
  }
})

function respond(body: unknown) {
  return new Response(
    JSON.stringify(body),
    { headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, status: 200 }
  )
}
