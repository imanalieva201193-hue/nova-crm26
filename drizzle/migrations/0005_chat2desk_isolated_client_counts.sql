CREATE TABLE public.chat2desk_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hook_type text, event_key text NOT NULL UNIQUE,
 client_id bigint, request_id bigint, channel_id bigint, transport text, is_new_client boolean,
 signature_valid boolean NOT NULL DEFAULT false, payload jsonb, event_time timestamptz,
 received_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.chat2desk_events TO authenticated;
GRANT ALL ON public.chat2desk_events TO service_role;
ALTER TABLE public.chat2desk_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "active staff read chat2desk events" ON public.chat2desk_events FOR SELECT TO authenticated USING (public.is_staff());
CREATE INDEX chat2desk_events_period ON public.chat2desk_events(event_time) WHERE signature_valid AND hook_type='new_request';
CREATE INDEX chat2desk_events_received ON public.chat2desk_events(received_at);
CREATE TABLE public.chat2desk_clients (
 client_id bigint PRIMARY KEY, name text, phone text, messenger_id text,
 first_transport text, first_channel_id bigint, first_seen_at timestamptz, last_seen_at timestamptz,
 requests_count int NOT NULL DEFAULT 0, patient_id uuid REFERENCES public.patients(id)
);
GRANT SELECT ON public.chat2desk_clients TO authenticated;
GRANT ALL ON public.chat2desk_clients TO service_role;
ALTER TABLE public.chat2desk_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "active staff read chat2desk clients" ON public.chat2desk_clients FOR SELECT TO authenticated USING (public.is_staff());
CREATE FUNCTION public.ingest_chat2desk_event(_event jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inserted_id uuid; cid bigint; c jsonb; ph text; pid uuid; moment timestamptz;
BEGIN
 INSERT INTO public.chat2desk_events(hook_type,event_key,client_id,request_id,channel_id,transport,is_new_client,signature_valid,payload,event_time)
 VALUES (_event->>'hook_type',_event->>'event_key',(_event->>'client_id')::bigint,(_event->>'request_id')::bigint,(_event->>'channel_id')::bigint,_event->>'transport',(_event->>'is_new_client')::boolean,(_event->>'signature_valid')::boolean,_event->'payload',(_event->>'event_time')::timestamptz)
 ON CONFLICT(event_key) DO NOTHING RETURNING id INTO inserted_id;
 IF inserted_id IS NULL THEN RETURN false; END IF;
 IF NOT coalesce((_event->>'signature_valid')::boolean,false) THEN RETURN true; END IF;
 cid:=(_event->>'client_id')::bigint;
 IF cid IS NULL THEN RETURN true; END IF;
 c:=coalesce(_event->'payload'->'client','{}'::jsonb);
 ph:=nullif(regexp_replace(coalesce(c->>'client_phone',''),'[^0-9]','','g'),'');
 IF ph IS NOT NULL THEN SELECT id INTO pid FROM public.patients WHERE public.patient_phone_key(phone)=public.patient_phone_key(ph) LIMIT 1; END IF;
 moment:=(_event->>'event_time')::timestamptz;
 INSERT INTO public.chat2desk_clients(client_id,name,phone,messenger_id,first_transport,first_channel_id,first_seen_at,last_seen_at,requests_count,patient_id)
 VALUES(cid,coalesce(nullif(c->>'assigned_name',''),nullif(c->>'name','')),ph,nullif(c->>'phone',''),_event->>'transport',(_event->>'channel_id')::bigint,moment,moment,CASE WHEN _event->>'hook_type'='new_request' THEN 1 ELSE 0 END,pid)
 ON CONFLICT(client_id) DO UPDATE SET
 name=CASE WHEN excluded.last_seen_at>=chat2desk_clients.last_seen_at THEN coalesce(excluded.name,chat2desk_clients.name) ELSE chat2desk_clients.name END,
 phone=CASE WHEN excluded.last_seen_at>=chat2desk_clients.last_seen_at AND c ? 'client_phone' THEN excluded.phone ELSE chat2desk_clients.phone END,
 messenger_id=CASE WHEN excluded.last_seen_at>=chat2desk_clients.last_seen_at THEN coalesce(excluded.messenger_id,chat2desk_clients.messenger_id) ELSE chat2desk_clients.messenger_id END,
 last_seen_at=greatest(chat2desk_clients.last_seen_at,excluded.last_seen_at),
 requests_count=chat2desk_clients.requests_count+excluded.requests_count,
 patient_id=CASE WHEN excluded.last_seen_at>=chat2desk_clients.last_seen_at AND c ? 'client_phone' THEN excluded.patient_id ELSE chat2desk_clients.patient_id END;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.ingest_chat2desk_event(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_chat2desk_event(jsonb) TO service_role;