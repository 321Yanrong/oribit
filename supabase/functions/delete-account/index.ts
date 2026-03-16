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
    // 2. 拿到系统的 URL 和 上帝钥匙
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    // 3. 验证当前是谁在发请求（防止别人乱删）
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader) throw new Error('未授权请求')
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) throw new Error('未授权请求')

    // 4. 验证前端传来的确认邮箱是否匹配
    const { confirmEmail } = await req.json()
    if (user.email !== confirmEmail) throw new Error('邮箱验证不匹配')

    // 5. ⚠️ 核心：使用上帝钥匙初始化 Admin 客户端
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    // 6. ⚠️ 核打击：从 auth.users 彻底删除该用户！
    // (Supabase 底层配置了外键级联删除，这会瞬间清空他的 profile, memories, 账单等所有记录)
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id)
    if (deleteError) throw deleteError

    return new Response(JSON.stringify({ success: true, message: '账号及数据已彻底销毁' }), {
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