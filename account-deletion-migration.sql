-- =============================================
-- Orbit account deletion migration (7 business days grace period)
-- Run this in Supabase SQL Editor for existing projects
-- =============================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.add_business_days(
  input_ts TIMESTAMPTZ,
  days_to_add INT
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
AS $$
DECLARE
  cursor_ts TIMESTAMPTZ := input_ts;
  added_days INT := 0;
BEGIN
  IF days_to_add < 0 THEN
    RAISE EXCEPTION 'days_to_add must be >= 0';
  END IF;

  WHILE added_days < days_to_add LOOP
    cursor_ts := cursor_ts + INTERVAL '1 day';
    IF EXTRACT(ISODOW FROM cursor_ts) < 6 THEN
      added_days := added_days + 1;
    END IF;
  END LOOP;

  RETURN cursor_ts;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_account_deletion(confirm_email TEXT)
RETURNS TABLE (deletion_scheduled_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid UUID := auth.uid();
  auth_email TEXT;
  normalized_email TEXT := lower(trim(coalesce(confirm_email, '')));
  now_ts TIMESTAMPTZ := now();
  scheduled_ts TIMESTAMPTZ;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF normalized_email = '' THEN
    RAISE EXCEPTION '请输入邮箱确认后再注销';
  END IF;

  SELECT lower(trim(coalesce(email, ''))) INTO auth_email
  FROM auth.users
  WHERE id = uid;

  IF auth_email IS NULL OR auth_email = '' OR auth_email <> normalized_email THEN
    RAISE EXCEPTION '邮箱不匹配，请输入当前登录邮箱后重试';
  END IF;

  scheduled_ts := public.add_business_days(now_ts, 7);

  UPDATE public.profiles
  SET deletion_requested_at = now_ts,
      deletion_scheduled_at = scheduled_ts,
      updated_at = now_ts
  WHERE id = uid;

  RETURN QUERY SELECT scheduled_ts;
END;
$$;

REVOKE ALL ON FUNCTION public.request_account_deletion(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_account_deletion(TEXT) TO authenticated;
