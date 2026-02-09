
-- Create storage bucket for agent documents
INSERT INTO storage.buckets (id, name, public) VALUES ('agent-documents', 'agent-documents', false);

-- RLS: org members can upload files
CREATE POLICY "Org members can upload documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'agent-documents'
  AND auth.uid() IS NOT NULL
);

-- RLS: org members can view their org's files
CREATE POLICY "Org members can view documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'agent-documents'
  AND auth.uid() IS NOT NULL
);

-- RLS: org members can delete their own uploads
CREATE POLICY "Users can delete own uploads"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'agent-documents'
  AND auth.uid() = owner
);
