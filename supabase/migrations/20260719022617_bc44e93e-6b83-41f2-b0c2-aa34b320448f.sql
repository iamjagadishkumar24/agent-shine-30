
-- Restrict has_role SECURITY DEFINER function to authenticated callers only
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- Tighten avatar bucket SELECT: only owner (or admins/staff) can read their avatar files
DROP POLICY IF EXISTS "Users can view avatars" ON storage.objects;

CREATE POLICY "Users can view own avatar"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

CREATE POLICY "Staff can view any avatar"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      public.has_role(auth.uid(), 'qa_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'team_manager'::public.app_role)
    )
  );
