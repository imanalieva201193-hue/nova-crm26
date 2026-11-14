CREATE OR REPLACE FUNCTION public.finish_chat2desk_backfill(_id uuid,_lease uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.chat2desk_backfill_jobs;
BEGIN
 SELECT * INTO j FROM public.chat2desk_backfill_jobs WHERE id=_id AND lease_token=_lease AND status='running' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Backfill lease unavailable'; END IF;
 UPDATE public.chat2desk_clients c SET requests_count=(SELECT count(*)::int FROM public.chat2desk_events e WHERE e.client_id=c.client_id AND e.signature_valid AND e.hook_type='new_request') WHERE c.client_id IS NOT NULL;
 UPDATE public.chat2desk_backfill_jobs SET status='done',error=NULL,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=_id RETURNING * INTO j;
 RETURN to_jsonb(j);
END $$;
REVOKE ALL ON FUNCTION public.finish_chat2desk_backfill(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_chat2desk_backfill(uuid,uuid) TO service_role;