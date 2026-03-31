// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl      = Deno.env.get('SUPABASE_URL')              ?? ''
    const serviceRoleKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const oneSignalAppId   = Deno.env.get('ONE_SIGNAL_APP_ID')         ?? ''
    const oneSignalRestKey = Deno.env.get('ONE_SIGNAL_REST_KEY')       ?? ''

    if (!oneSignalAppId || !oneSignalRestKey) {
      throw new Error('OneSignal 配置缺失')
    }

    const authHeader = req.headers.get('Authorization') || ''

    // Admin access: caller presents Service Role Key as Bearer
    const isServiceRole = authHeader === `Bearer ${serviceRoleKey}`

    let callerUserId: string | null = null
    let callerIsAdmin = false

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    if (!isServiceRole) {
      if (!authHeader) throw new Error('未授权请求')
      const token = authHeader.replace(/^Bearer\s+/i, '')
      const { data: { user }, error: userError } = await adminClient.auth.getUser(token)
      if (userError || !user) throw new Error('未授权请求')
      callerUserId = user.id

      try {
        const { data: profile } = await adminClient
          .from('profiles')
          .select('is_admin')
          .eq('id', callerUserId)
          .single()
        callerIsAdmin = profile?.is_admin === true
      } catch (_) {
        callerIsAdmin = false
      }
    } else {
      callerIsAdmin = true
    }

    const body = await req.json()
    const {
      // Target selection — exactly one of these should be provided:
      user_ids,     // string[]  — individual / manual batch
      all_users,    // boolean   — broadcast to everyone
      filter,       // { registered_after?, registered_before? }
      // Message
      headings,
      contents,
      type = 'general',
      data = {},
    } = body || {}

    // ── Build the profiles query ──────────────────────────────────────────────
    let query = adminClient
      .from('profiles')
      .select('id, notification_prefs, one_signal_player_id')
      .not('one_signal_player_id', 'is', null)

    const modeCount =
      (all_users ? 1 : 0) +
      (filter ? 1 : 0) +
      (Array.isArray(user_ids) && user_ids.length > 0 ? 1 : 0)
    if (modeCount !== 1) {
      throw new Error('请且仅请提供一种目标参数：user_ids、all_users 或 filter')
    }

    if (all_users) {
      // Broadcast — must be admin
      if (!callerIsAdmin) throw new Error('仅管理员可发送全体广播')
      // no additional filters — fetch all non-banned users with a player ID

    } else if (filter) {
      // Segment by filter conditions — must be admin
      if (!callerIsAdmin) throw new Error('仅管理员可使用筛选发送')
      if (filter.registered_after)  query = query.gte('created_at', filter.registered_after)
      if (filter.registered_before) query = query.lte('created_at', filter.registered_before)

    } else if (Array.isArray(user_ids) && user_ids.length > 0) {
      // Individual / batch notifications should work for normal app flows
      // such as @, comment, and friend-request.
      query = query.in('id', user_ids)

    } else {
      throw new Error('请提供 user_ids、all_users 或 filter 参数之一')
    }

    const { data: rows, error } = await query
    if (error) throw error

    // ── Filter by notification preferences ────────────────────────────────────
    const mapTypeToPrefKey = (t: string) => {
      switch (t) {
        case 'comment':          return 'notifyComment'
        case 'friend_request':
        case 'friend_accepted':
        case 'friend_rejected':
        case 'friend_bind':      return 'notifyFriendRequest'
        case 'at':               return 'notifyAt'
        case 'like':             return 'notifyLike'
        default:                 return 'browser_notifications_enabled'
      }
    }

    const prefKey = mapTypeToPrefKey(type)
    const allowedPlayerIds: string[] = []
    const reasonSkipped: Record<string, string> = {}

    for (const u of rows || []) {
      const prefs    = u.notification_prefs || {}
      const playerId = u.one_signal_player_id

      const allowed = (() => {
        // Admin "general" broadcasts bypass per-type pref checks but still
        // respect browser_notifications_enabled if explicitly false.
        if (prefKey === 'browser_notifications_enabled') {
          return prefs.browser_notifications_enabled !== false
        }
        return prefs[prefKey] !== false
      })()

      if (!allowed) {
        reasonSkipped[u.id] = '用户偏好关闭此类通知'
        continue
      }
      if (!playerId) {
        reasonSkipped[u.id] = '无有效 OneSignal player id'
        continue
      }
      allowedPlayerIds.push(playerId)
    }

    if (allowedPlayerIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, skipped: Object.keys(reasonSkipped).length, reasonSkipped }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // ── Send via OneSignal REST API ────────────────────────────────────────────
    const onesignalBody = {
      app_id:              oneSignalAppId,
      include_player_ids:  allowedPlayerIds,
      headings:            { en: headings || '', 'zh-Hans': headings || '' },
      contents:            { en: contents || '', 'zh-Hans': contents || '' },
      data:                data || {},
    }

    const resp = await fetch('https://onesignal.com/api/v1/notifications', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json;charset=utf-8',
        'Authorization': `Basic ${oneSignalRestKey}`,
      },
      body: JSON.stringify(onesignalBody),
    })

    const respJson = await resp.json()

    return new Response(
      JSON.stringify({
        success:   true,
        sent:      allowedPlayerIds.length,
        total:     (rows || []).length,
        skipped:   reasonSkipped,
        onesignal: respJson,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (err) {
    console.error('[send-notifications] error:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
