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
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const oneSignalAppId = Deno.env.get('ONE_SIGNAL_APP_ID') ?? ''
    const oneSignalRestKey = Deno.env.get('ONE_SIGNAL_REST_KEY') ?? ''

    if (!oneSignalAppId || !oneSignalRestKey) {
      throw new Error('OneSignal 配置缺失')
    }

    const authHeader = req.headers.get('Authorization') || ''

    // admin access if caller presents Service Role Key as Bearer
    const isAdminCall = authHeader === `Bearer ${serviceRoleKey}`

    let callerUserId: string | null = null
    if (!isAdminCall) {
      if (!authHeader) throw new Error('未授权请求')
      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
        global: { headers: { Authorization: authHeader } }
      })
      const { data: { user }, error: userError } = await userClient.auth.getUser()
      if (userError || !user) throw new Error('未授权请求')
      callerUserId = user.id
    }

    const body = await req.json()
    // 支持传入: { user_ids: string[], headings: string, contents: string, type: 'comment'|'friend_request'|'at'|'general' }
    const { user_ids, headings, contents, type = 'general', data = {} } = body || {}
    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      throw new Error('请提供 user_ids 列表')
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    // 拉取用户 prefs 与 player id
    const { data: rows, error } = await adminClient
      .from('profiles')
      .select('id, notification_prefs, one_signal_player_id')
      .in('id', user_ids)

    if (error) throw error

    const allowedPlayerIds: string[] = []
    const reasonSkipped: Record<string, string> = {}

    const mapTypeToPrefKey = (t: string) => {
      switch (t) {
        case 'comment': return 'notifyComment'
        case 'friend_request': return 'notifyFriendRequest'
        case 'at': return 'notifyAt'
        default: return 'browser_notifications_enabled'
      }
    }

    const prefKey = mapTypeToPrefKey(type)

    for (const u of rows || []) {
      const prefs = u.notification_prefs || {}
      const playerId = u.one_signal_player_id
      const allowed = (() => {
        // if explicit browser_notifications_enabled exists, use it for general types
        if (prefKey === 'browser_notifications_enabled') {
          if (prefs.browser_notifications_enabled === false) return false
          return true
        }
        // otherwise look for specific toggle, fallback to true
        if (prefs[prefKey] === false) return false
        return true
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
      return new Response(JSON.stringify({ success: true, sent: 0, skipped: Object.keys(reasonSkipped).length, reasonSkipped }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // 调用 OneSignal REST API 发送通知（按 player id 列表）
    const onesignalBody = {
      app_id: oneSignalAppId,
      include_player_ids: allowedPlayerIds,
      headings: { en: headings || '' },
      contents: { en: contents || '' },
      data: data || {},
    }

    const resp = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        'Authorization': `Basic ${oneSignalRestKey}`,
      },
      body: JSON.stringify(onesignalBody),
    })

    const respJson = await resp.json()

    return new Response(JSON.stringify({ success: true, sent: allowedPlayerIds.length, onesignal: respJson, skipped: reasonSkipped }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
