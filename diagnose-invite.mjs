/**
 * 邀请码诊断脚本
 * 用法: node diagnose-invite.mjs <service_role_key>
 * service_role key 在 Supabase 控制台 → Settings → API → service_role secret
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://qoaqmbepnsqymxzpncyf.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvYXFtYmVwbnNxeW14enBuY3lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NTQ5NTMsImV4cCI6MjA4ODUzMDk1M30.dmQ5kVi2dGQHJ8QM7gDSRx8nNSSIfZ5jVbh22NLeBIc'

const SERVICE_KEY = process.argv[2] || ''

if (!SERVICE_KEY) {
  console.error('❌ 需要传入 service_role key: node diagnose-invite.mjs <service_role_key>')
  process.exit(1)
}

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

function generateInviteCode(userId) {
  const hash = userId.split('').reduce((acc, char) => ((acc << 5) - acc) + char.charCodeAt(0), 0)
  const code = Math.abs(hash).toString(36).toUpperCase().padStart(6, '0')
  return `ORBIT${code.slice(0, 6)}`
}

async function main() {
  console.log('\n========== Orbit 邀请码诊断 ==========\n')

  // 1. 检查 invite_code 列是否存在
  console.log('1️⃣  检查 profiles 表结构...')
  const { data: colCheck, error: colErr } = await adminClient
    .from('profiles')
    .select('invite_code')
    .limit(1)
  if (colErr?.message?.includes('column') || colErr?.message?.includes('does not exist')) {
    console.error('❌ invite_code 列不存在！请在 Supabase SQL Editor 运行:')
    console.error('   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE;')
    return
  }
  console.log('✅ invite_code 列存在\n')

  // 2. 查所有用户（绕过 RLS）
  console.log('2️⃣  查询所有 profiles...')
  const { data: profiles, error: profilesErr } = await adminClient
    .from('profiles')
    .select('id, username, invite_code, created_at')
    .order('created_at', { ascending: false })
  
  if (profilesErr) {
    console.error('❌ 查询 profiles 失败:', profilesErr)
    return
  }

  console.log(`找到 ${profiles.length} 个用户:\n`)
  profiles.forEach((p, i) => {
    const expected = generateInviteCode(p.id)
    const codeStatus = p.invite_code 
      ? (p.invite_code === expected ? '✅ 与预期一致' : `⚠️  与预期不符 (预期: ${expected})`)
      : '❌ 为 NULL（未保存）'
    console.log(`  用户 ${i + 1}:`)
    console.log(`    ID:           ${p.id}`)
    console.log(`    用户名:       ${p.username || '(无)'}`)
    console.log(`    invite_code:  ${p.invite_code || 'NULL'} ${codeStatus}`)
    console.log(`    注册时间:     ${p.created_at}`)
    console.log()
  })

  // 3. 修复 invite_code 为 NULL 的用户
  const missingCode = profiles.filter(p => !p.invite_code)
  if (missingCode.length > 0) {
    console.log(`3️⃣  修复 ${missingCode.length} 个没有邀请码的用户...`)
    for (const p of missingCode) {
      const code = generateInviteCode(p.id)
      const { error } = await adminClient
        .from('profiles')
        .update({ invite_code: code })
        .eq('id', p.id)
      if (error) {
        console.error(`  ❌ 修复用户 ${p.username} 失败:`, error)
      } else {
        console.log(`  ✅ 用户 ${p.username || p.id} → 邀请码设为 ${code}`)
      }
    }
    console.log()
  } else {
    console.log('3️⃣  所有用户都有邀请码，无需修复\n')
  }

  // 4. 检查 RLS 策略（用 anon 客户端模拟新账号查询）
  console.log('4️⃣  检查 RLS 策略（用匿名客户端模拟查询）...')
  const anonClient = createClient(SUPABASE_URL, ANON_KEY)
  
  // 用第一个有邀请码的用户测试
  const testProfile = profiles.find(p => p.invite_code) || 
    { invite_code: generateInviteCode(profiles[0]?.id || 'test'), username: 'test' }
  
  const { data: rlsTest, error: rlsErr } = await anonClient
    .from('profiles')
    .select('id, username, avatar_url')
    .eq('invite_code', testProfile.invite_code)
    .maybeSingle()

  if (rlsErr) {
    console.error('❌ 匿名查询失败 (RLS 错误):', JSON.stringify(rlsErr))
    console.error('   请在 Supabase SQL Editor 运行:')
    console.error(`   CREATE POLICY "Users can lookup profile by invite code" ON profiles`)
    console.error(`     FOR SELECT USING (invite_code IS NOT NULL);`)
  } else if (!rlsTest) {
    console.error('❌ RLS 匿名查询返回空（策略可能未允许跨用户访问）')
    console.error('   请在 Supabase SQL Editor 运行:')
    console.error(`   DROP POLICY IF EXISTS "Users can lookup profile by invite code" ON profiles;`)
    console.error(`   CREATE POLICY "Users can lookup profile by invite code" ON profiles`)
    console.error(`     FOR SELECT USING (invite_code IS NOT NULL);`)
  } else {
    console.log(`✅ RLS 策略正常，匿名查询可以找到用户: ${rlsTest.username}`)
  }

  console.log('\n========== 诊断完成 ==========\n')
}

main().catch(console.error)
