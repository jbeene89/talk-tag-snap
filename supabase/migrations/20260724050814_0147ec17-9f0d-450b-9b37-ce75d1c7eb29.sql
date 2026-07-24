
DROP POLICY IF EXISTS "Anyone can upload an order icon" ON storage.objects;

CREATE POLICY "Public can upload constrained order icons"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'order-icons'
  AND (storage.foldername(name) IS NULL OR array_length(storage.foldername(name), 1) IS NULL)
  AND name ~ '^[0-9a-f-]{36}\.(png|jpe?g|webp)$'
);
