// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 1. 处理跨域请求 (CORS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 2. 拿到系统配置
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const authHeader = req.headers.get('Authorization') || ''
    const body = await req.json().catch(() => ({}))

    // 3. 使用服务角色初始化 Admin 客户端
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    // 4. 管理员模式：处理到期账号物理删除（用于 cron）
    // 通过解析 JWT payload 判断是否为 service_role 调用
    const token = authHeader.replace(/^Bearer\s+/i, '')
    let jwtRole = ''
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      jwtRole = payload?.role ?? ''
    } catch (_) {}
    const isServiceRoleCall = jwtRole === 'service_role'
    if (isServiceRoleCall && body?.mode === 'process_due') {
      const nowIso = new Date().toISOString()
      const { data: dueRows, error: dueError } = await adminClient
        .from('profiles')
        .select('id')
        .not('deletion_scheduled_at', 'is', null)
        .lte('deletion_scheduled_at', nowIso)
        .limit(100)

      if (dueError) throw dueError

      let deleted = 0
      const failed: string[] = []
      for (const row of dueRows || []) {
        const { error: deleteError } = await adminClient.auth.admin.deleteUser(row.id)
        if (deleteError) {
          failed.push(row.id)
        } else {
          deleted += 1
        }
      }

      return new Response(JSON.stringify({ success: true, processed: (dueRows || []).length, deleted, failed }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // 5. 用户模式：发起 7 个工作日后的删除申请
    if (!authHeader) throw new Error('未授权请求')
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) throw new Error('未授权请求')

    const confirmEmail = (body?.confirmEmail || '').trim().toLowerCase()
    if (!confirmEmail || (user.email || '').trim().toLowerCase() !== confirmEmail) {
      throw new Error('邮箱验证不匹配')
    }

    const now = new Date()
    const scheduledAt = new Date(now)
    let businessDays = 0
    while (businessDays < 7) {
      scheduledAt.setUTCDate(scheduledAt.getUTCDate() + 1)
      const day = scheduledAt.getUTCDay()
      if (day !== 0 && day !== 6) businessDays += 1
    }

    const { error: updateError } = await adminClient
      .from('profiles')
      .update({
        deletion_requested_at: now.toISOString(),
        deletion_scheduled_at: scheduledAt.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', user.id)

    if (updateError) throw updateError

    return new Response(JSON.stringify({
      success: true,
      message: '已提交注销申请，账号将在 7 个工作日后删除',
      deletionScheduledAt: scheduledAt.toISOString(),
    }), {
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