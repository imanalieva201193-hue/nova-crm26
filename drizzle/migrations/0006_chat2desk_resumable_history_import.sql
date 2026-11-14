CREATE TABLE public.chat2desk_backfill_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), from_date date NOT NULL, to_date date NOT NULL,
 phase text NOT NULL DEFAULT 'anchor' CHECK (phase IN ('anchor','messages','clients','finalize')),
 cursor_start_id bigint, clients_offset int NOT NULL DEFAULT 0, api_calls int NOT NULL DEFAULT 0,
 requests_imported int NOT NULL DEFAULT 0, clients_imported int NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','done','error')), error text,
 started_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 api_host text, lease_token uuid, lease_until timestamptz,
 CHECK (from_date <= to_date)
);
GRANT SELECT ON public.chat2desk_backfill_jobs TO authenticated;
GRANT ALL ON public.chat2desk_backfill_jobs TO service_role;
ALTER TABLE public.chat2desk_backfill_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "active staff read backfill jobs" ON public.chat2desk_backfill_jobs FOR SELECT TO authenticated USING (public.is_staff());
CREATE INDEX chat2desk_backfill_jobs_created ON public.chat2desk_backfill_jobs(created_at DESC);
CREATE INDEX chat2desk_backfill_client_events ON public.chat2desk_events(client_id,event_time) WHERE signature_valid AND hook_type='new_request';

CREATE FUNCTION public.claim_chat2desk_backfill(_id uuid, _lease uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.chat2desk_backfill_jobs;
BEGIN
 UPDATE public.chat2desk_backfill_jobs SET lease_token=_lease,lease_until=now()+interval '90 seconds',status='running',error=NULL,updated_at=now()
 WHERE id=_id AND status<>'done' AND (lease_until IS NULL OR lease_until<now()) RETURNING * INTO j;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN to_jsonb(j);
END $$;
REVOKE ALL ON FUNCTION public.claim_chat2desk_backfill(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_chat2desk_backfill(uuid,uuid) TO service_role;

CREATE FUNCTION public.apply_chat2desk_backfill_page(_id uuid,_lease uuid,_events jsonb,_clients jsonb,_cursor bigint,_offset int,_phase text,_host text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.chat2desk_backfill_jobs; e jsonb; c jsonb; cid bigint; moment timestamptz; inserted uuid; added int:=0; filled int:=0; ph text; pid uuid; earliest uuid; matched int;
BEGIN
 SELECT * INTO j FROM public.chat2desk_backfill_jobs WHERE id=_id AND lease_token=_lease AND status='running' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Backfill lease unavailable'; END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(_events) LOOP
  cid:=(e->>'client_id')::bigint; moment:=(e->>'event_time')::timestamptz;
  IF moment < j.from_date::timestamp AT TIME ZONE 'Asia/Bishkek' OR moment >= (j.to_date+1)::timestamp AT TIME ZONE 'Asia/Bishkek' THEN CONTINUE; END IF;
  INSERT INTO public.chat2desk_events(hook_type,event_key,client_id,request_id,channel_id,transport,is_new_client,signature_valid,payload,event_time)
  VALUES('new_request','new_request:'||(e->>'request_id'),cid,(e->>'request_id')::bigint,(e->>'channel_id')::bigint,e->>'transport',false,true,'{"source":"backfill"}'::jsonb,moment)
  ON CONFLICT(event_key) DO NOTHING RETURNING id INTO inserted;
  IF inserted IS NOT NULL THEN added:=added+1; END IF;
  INSERT INTO public.chat2desk_clients(client_id,first_transport,first_channel_id,first_seen_at,last_seen_at,requests_count)
  VALUES(cid,e->>'transport',(e->>'channel_id')::bigint,moment,moment,CASE WHEN inserted IS NOT NULL THEN 1 ELSE 0 END)
  ON CONFLICT(client_id) DO UPDATE SET
   first_transport=CASE WHEN excluded.first_seen_at<chat2desk_clients.first_seen_at OR chat2desk_clients.first_seen_at IS NULL THEN excluded.first_transport ELSE chat2desk_clients.first_transport END,
   first_channel_id=CASE WHEN excluded.first_seen_at<chat2desk_clients.first_seen_at OR chat2desk_clients.first_seen_at IS NULL THEN excluded.first_channel_id ELSE chat2desk_clients.first_channel_id END,
   first_seen_at=least(chat2desk_clients.first_seen_at,excluded.first_seen_at),last_seen_at=greatest(chat2desk_clients.last_seen_at,excluded.last_seen_at),
   requests_count=chat2desk_clients.requests_count+excluded.requests_count;
 END LOOP;
 FOR c IN SELECT value FROM jsonb_array_elements(_clients) LOOP
  cid:=(c->>'id')::bigint; pid:=NULL;
  ph:=nullif(regexp_replace(coalesce(c->>'client_phone',''),'[^0-9]','','g'),'');
  IF ph IS NOT NULL THEN SELECT id INTO pid FROM public.patients WHERE public.patient_phone_key(phone)=public.patient_phone_key(ph) LIMIT 1; END IF;
  UPDATE public.chat2desk_clients SET name=coalesce(nullif(c->>'assigned_name',''),nullif(c->>'name',''),name),phone=ph,messenger_id=nullif(c->>'phone',''),patient_id=pid WHERE client_id=cid;
  GET DIAGNOSTICS matched=ROW_COUNT; filled:=filled+matched;
  SELECT id INTO earliest FROM public.chat2desk_events WHERE client_id=cid AND signature_valid AND hook_type='new_request' AND payload->>'source'='backfill' ORDER BY event_time,id LIMIT 1;
  UPDATE public.chat2desk_events SET is_new_client=(id=earliest) WHERE client_id=cid AND signature_valid AND hook_type='new_request' AND payload->>'source'='backfill' AND is_new_client IS DISTINCT FROM (id=earliest);
 END LOOP;
 UPDATE public.chat2desk_backfill_jobs SET cursor_start_id=_cursor,clients_offset=_offset,phase=_phase,api_host=_host,requests_imported=requests_imported+added,clients_imported=clients_imported+filled,updated_at=now() WHERE id=_id RETURNING * INTO j;
 RETURN to_jsonb(j);
END $$;
REVOKE ALL ON FUNCTION public.apply_chat2desk_backfill_page(uuid,uuid,jsonb,jsonb,bigint,int,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_chat2desk_backfill_page(uuid,uuid,jsonb,jsonb,bigint,int,text,text) TO service_role;

CREATE FUNCTION public.finish_chat2desk_backfill(_id uuid,_lease uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.chat2desk_backfill_jobs;
BEGIN
 SELECT * INTO j FROM public.chat2desk_backfill_jobs WHERE id=_id AND lease_token=_lease AND status='running' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Backfill lease unavailable'; END IF;
 UPDATE public.chat2desk_clients c SET requests_count=(SELECT count(*)::int FROM public.chat2desk_events e WHERE e.client_id=c.client_id AND e.signature_valid AND e.hook_type='new_request');
 UPDATE public.chat2desk_backfill_jobs SET status='done',error=NULL,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=_id RETURNING * INTO j;
 RETURN to_jsonb(j);
END $$;
REVOKE ALL ON FUNCTION public.finish_chat2desk_backfill(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_chat2desk_backfill(uuid,uuid) TO service_role;