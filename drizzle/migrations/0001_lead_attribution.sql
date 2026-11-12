ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS brought_by_email text,
  ADD COLUMN IF NOT EXISTS booked_by_email text,
  ADD COLUMN IF NOT EXISTS confirmed_by_email text,
  ADD COLUMN IF NOT EXISTS operation_by_email text;
UPDATE public.leads SET brought_by_email = responsible_email WHERE brought_by_email IS NULL;
CREATE INDEX IF NOT EXISTS leads_phone_idx ON public.leads(phone);