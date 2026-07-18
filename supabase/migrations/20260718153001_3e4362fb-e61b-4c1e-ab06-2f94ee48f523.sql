
CREATE POLICY "attachments read auth"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'feedback-attachments');

CREATE POLICY "attachments write admin"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'feedback-attachments'
             AND (public.has_role(auth.uid(),'qa_admin') OR public.has_role(auth.uid(),'super_admin')));

CREATE POLICY "attachments update admin"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'feedback-attachments'
         AND (public.has_role(auth.uid(),'qa_admin') OR public.has_role(auth.uid(),'super_admin')));

CREATE POLICY "attachments delete admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'feedback-attachments'
         AND (public.has_role(auth.uid(),'qa_admin') OR public.has_role(auth.uid(),'super_admin')));
