CREATE FUNCTION public.is_director() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.employees WHERE lower(email)=public.my_email() AND active AND role='commercial_director') $$;
CREATE FUNCTION public.altegio_name_key(raw text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT lower(regexp_replace(replace(trim(coalesce(raw,'')),'ё','е'),'\s+',' ','g')) $$;

CREATE TABLE public.altegio_locations (location_id bigint PRIMARY KEY, title text, branch_code text REFERENCES public.branches(code), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.altegio_staff (location_id bigint NOT NULL, staff_id bigint NOT NULL, name text, doctor_id uuid REFERENCES public.doctors(id), manual boolean NOT NULL DEFAULT false, PRIMARY KEY(location_id, staff_id));
CREATE TABLE public.altegio_users (user_id bigint PRIMARY KEY, name text, employee_email text, manual boolean NOT NULL DEFAULT false);
CREATE TABLE public.altegio_categories (category_id bigint PRIMARY KEY, title text, kind text CHECK (kind IN ('surgeon_consult','operation','general')));
CREATE TABLE public.altegio_services (service_id bigint PRIMARY KEY, title text, category_id bigint);
CREATE TABLE public.altegio_records (
 record_id bigint PRIMARY KEY, location_id bigint NOT NULL, client_id bigint, client_name text, phone text, phone_key text,
 staff_id bigint, staff_name text, services jsonb NOT NULL DEFAULT '[]', amount numeric NOT NULL DEFAULT 0,
 visit_at timestamptz, attendance int NOT NULL DEFAULT 0, confirmed boolean NOT NULL DEFAULT false,
 created_user_id bigint, created_at_altegio timestamptz, changed_at_altegio timestamptz, deleted boolean NOT NULL DEFAULT false,
 kind text, direction text, branch_code text, lead_id uuid REFERENCES public.leads(id), matched_existing boolean,
 payload jsonb NOT NULL DEFAULT '{}', synced_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX altegio_records_phone ON public.altegio_records(phone_key);
CREATE INDEX altegio_records_created ON public.altegio_records(created_at_altegio);
CREATE TABLE public.altegio_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hook_id text UNIQUE, location_id bigint, resource text, status text, resource_id bigint, received_at timestamptz NOT NULL DEFAULT now(), result text, error text);
CREATE INDEX altegio_events_received ON public.altegio_events(received_at DESC);
CREATE TABLE public.altegio_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL DEFAULT 'history' CHECK (kind IN ('history','reconcile')), from_date date NOT NULL, location_ids bigint[] NOT NULL DEFAULT '{}', loc_index int NOT NULL DEFAULT 0, page int NOT NULL DEFAULT 1, api_calls int NOT NULL DEFAULT 0, imported int NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','done','error')), error text, lease_until timestamptz, started_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['altegio_locations','altegio_staff','altegio_users','altegio_categories','altegio_services','altegio_records','altegio_events','altegio_jobs'] LOOP
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated; GRANT ALL ON public.%I TO service_role; ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY; CREATE POLICY "leaders read" ON public.%I FOR SELECT TO authenticated USING (public.is_admin());', t,t,t,t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['altegio_locations','altegio_staff','altegio_users','altegio_categories'] LOOP
  EXECUTE format('GRANT UPDATE ON public.%I TO authenticated; CREATE POLICY "director edits" ON public.%I FOR UPDATE TO authenticated USING (public.is_director()) WITH CHECK (public.is_director());', t,t);
 END LOOP;
END $$;

CREATE FUNCTION public.apply_altegio_records(_rows jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb; old public.altegio_records; rec public.altegio_records; br text; fn text; k text; dir text; pk text; pid uuid; lid uuid; l public.leads;
 booked text; doc uuid; vdate date; note text; applied int:=0; stale int:=0; existed boolean; changes jsonb;
BEGIN
 FOR r IN SELECT * FROM jsonb_array_elements(coalesce(_rows,'[]')) LOOP
  SELECT * INTO old FROM public.altegio_records WHERE record_id=(r->>'record_id')::bigint FOR UPDATE;
  IF FOUND AND old.changed_at_altegio IS NOT NULL AND (r->>'changed_at') IS NOT NULL AND (r->>'changed_at')::timestamptz < old.changed_at_altegio AND NOT coalesce((r->>'deleted')::boolean,false) THEN stale:=stale+1; CONTINUE; END IF;
  existed := FOUND;
  pk := CASE WHEN length(regexp_replace(coalesce(r->>'phone',''),'[^0-9]','','g'))>=9 THEN public.patient_phone_key(r->>'phone') END;
  SELECT branch_code INTO br FROM public.altegio_locations WHERE location_id=(r->>'location_id')::bigint;
  IF r->>'staff_id' IS NOT NULL THEN
   INSERT INTO public.altegio_staff(location_id,staff_id,name) VALUES((r->>'location_id')::bigint,(r->>'staff_id')::bigint,r->>'staff_name')
   ON CONFLICT(location_id,staff_id) DO UPDATE SET name=coalesce(excluded.name,altegio_staff.name);
   UPDATE public.altegio_staff s SET doctor_id=(SELECT d.id FROM public.doctors d WHERE public.altegio_name_key(d.full_name)=public.altegio_name_key(s.name) OR public.altegio_name_key(d.full_name) LIKE public.altegio_name_key(s.name)||' %' OR public.altegio_name_key(s.name) LIKE public.altegio_name_key(d.full_name)||' %' LIMIT 1)
    WHERE s.location_id=(r->>'location_id')::bigint AND s.staff_id=(r->>'staff_id')::bigint AND s.doctor_id IS NULL AND NOT s.manual;
  END IF;
  IF r->>'created_user_id' IS NOT NULL AND (r->>'created_user_id')::bigint>0 THEN INSERT INTO public.altegio_users(user_id) VALUES((r->>'created_user_id')::bigint) ON CONFLICT DO NOTHING; END IF;
  SELECT CASE WHEN bool_or(c.kind='operation') THEN 'operation' WHEN bool_or(c.kind='surgeon_consult') THEN 'surgeon_consult' WHEN bool_or(c.kind='general') THEN 'general' END INTO k
   FROM jsonb_array_elements(coalesce(r->'services','[]')) s JOIN public.altegio_services sv ON sv.service_id=(s->>'id')::bigint JOIN public.altegio_categories c ON c.category_id=sv.category_id;
  dir := CASE WHEN k IN ('operation','surgeon_consult') THEN 'Хирургия' WHEN k='general' THEN 'Общий профиль' WHEN br IN ('abd3','asanbay') THEN 'Хирургия' WHEN br IN ('moskovskaya','abd2') THEN 'Общий профиль' END;
  INSERT INTO public.altegio_records AS t(record_id,location_id,client_id,client_name,phone,phone_key,staff_id,staff_name,services,amount,visit_at,attendance,confirmed,created_user_id,created_at_altegio,changed_at_altegio,deleted,kind,direction,branch_code,payload,synced_at)
  VALUES((r->>'record_id')::bigint,(r->>'location_id')::bigint,(r->>'client_id')::bigint,r->>'client_name',r->>'phone',pk,(r->>'staff_id')::bigint,r->>'staff_name',coalesce(r->'services','[]'),coalesce((r->>'amount')::numeric,0),(r->>'visit_at')::timestamptz,coalesce((r->>'attendance')::int,0),coalesce((r->>'confirmed')::boolean,false),(r->>'created_user_id')::bigint,(r->>'created_at')::timestamptz,(r->>'changed_at')::timestamptz,coalesce((r->>'deleted')::boolean,false),k,dir,br,coalesce(r->'payload','{}'),now())
  ON CONFLICT(record_id) DO UPDATE SET location_id=excluded.location_id,client_id=coalesce(excluded.client_id,t.client_id),client_name=coalesce(excluded.client_name,t.client_name),phone=coalesce(excluded.phone,t.phone),phone_key=coalesce(excluded.phone_key,t.phone_key),staff_id=coalesce(excluded.staff_id,t.staff_id),staff_name=coalesce(excluded.staff_name,t.staff_name),services=CASE WHEN excluded.deleted THEN t.services ELSE excluded.services END,amount=CASE WHEN excluded.deleted THEN t.amount ELSE excluded.amount END,visit_at=coalesce(excluded.visit_at,t.visit_at),attendance=CASE WHEN excluded.deleted THEN t.attendance ELSE excluded.attendance END,confirmed=excluded.confirmed OR (excluded.deleted AND t.confirmed),created_user_id=coalesce(excluded.created_user_id,t.created_user_id),created_at_altegio=coalesce(t.created_at_altegio,excluded.created_at_altegio),changed_at_altegio=greatest(excluded.changed_at_altegio,t.changed_at_altegio),deleted=excluded.deleted,kind=coalesce(excluded.kind,t.kind),direction=coalesce(excluded.direction,t.direction),branch_code=excluded.branch_code,payload=CASE WHEN excluded.deleted AND excluded.payload='{}'::jsonb THEN t.payload ELSE excluded.payload END,synced_at=now()
  RETURNING * INTO rec;
  applied:=applied+1;
  IF br IS NULL OR rec.phone_key IS NULL THEN CONTINUE; END IF;
  SELECT id INTO pid FROM public.patients WHERE phone=rec.phone_key;
  IF rec.matched_existing IS NULL THEN
   UPDATE public.altegio_records SET matched_existing=EXISTS(SELECT 1 FROM public.leads WHERE patient_id=pid AND source<>'Altegio') WHERE record_id=rec.record_id;
  END IF;
  lid := rec.lead_id;
  IF lid IS NULL AND pid IS NOT NULL THEN SELECT id INTO lid FROM public.leads WHERE patient_id=pid AND branch_code=br AND outcome IS NULL AND stage<10 ORDER BY created_at DESC LIMIT 1; END IF;
  IF lid IS NULL AND rec.deleted THEN CONTINUE; END IF;
  SELECT employee_email INTO booked FROM public.altegio_users WHERE user_id=rec.created_user_id;
  SELECT doctor_id INTO doc FROM public.altegio_staff WHERE location_id=rec.location_id AND staff_id=rec.staff_id;
  vdate := (rec.visit_at AT TIME ZONE 'Asia/Bishkek')::date;
  IF lid IS NULL THEN
   fn := CASE br WHEN 'asanbay' THEN 'rinos' WHEN 'abd3' THEN 'nova_surgery' ELSE 'nova_general' END;
   INSERT INTO public.leads(patient_name,phone,lead_date,source,line,branch_code,funnel,stage,comment,clinical_direction,booked_by_email,responsible_email)
   VALUES(rec.client_name,rec.phone,coalesce((rec.created_at_altegio AT TIME ZONE 'Asia/Bishkek')::date,(now() AT TIME ZONE 'Asia/Bishkek')::date),'Altegio','Филиал',br,fn,3,'Создано из Altegio',dir,booked,booked) RETURNING id INTO lid;
  END IF;
  UPDATE public.altegio_records SET lead_id=lid WHERE record_id=rec.record_id;
  SELECT * INTO l FROM public.leads WHERE id=lid FOR UPDATE;
  IF existed AND old.deleted=rec.deleted AND old.attendance=rec.attendance AND old.confirmed=rec.confirmed AND old.visit_at IS NOT DISTINCT FROM rec.visit_at AND old.kind IS NOT DISTINCT FROM rec.kind AND old.amount=rec.amount AND old.lead_id IS NOT NULL THEN CONTINUE; END IF;
  IF rec.deleted THEN note:='Отменена в Altegio';
  ELSE
   note := CASE rec.attendance WHEN 1 THEN 'Пришёл' WHEN -1 THEN 'Не пришёл' WHEN 2 THEN 'Подтвердил' ELSE CASE WHEN rec.confirmed THEN 'Подтвердил' ELSE 'Запись создана' END END;
   UPDATE public.leads SET
    booked_by_email=coalesce(booked_by_email,booked), doctor_id=coalesce(doctor_id,doc),
    stage=CASE WHEN rec.kind='operation' AND rec.attendance=1 THEN 10 WHEN rec.kind='operation' THEN greatest(stage,6) WHEN rec.attendance=1 THEN greatest(stage,5) ELSE greatest(stage,3) END,
    visit_date=CASE WHEN rec.kind='operation' THEN visit_date ELSE rec.visit_at END,
    confirmed=confirmed OR rec.confirmed OR rec.attendance IN (1,2), confirmed_by_email=CASE WHEN rec.confirmed OR rec.attendance IN (1,2) THEN coalesce(confirmed_by_email,booked) ELSE confirmed_by_email END,
    came=came OR rec.attendance=1, visited_at=CASE WHEN rec.attendance=1 AND rec.kind IS DISTINCT FROM 'operation' THEN coalesce(visited_at,vdate) ELSE visited_at END,
    outcome=CASE WHEN rec.attendance=-1 AND outcome IS NULL AND NOT came THEN 'Не пришёл' WHEN rec.attendance=1 AND outcome='Не пришёл' THEN NULL ELSE outcome END,
    operation_date=CASE WHEN rec.kind='operation' THEN vdate ELSE operation_date END,
    operation_cost=CASE WHEN rec.kind='operation' AND rec.attendance=1 THEN rec.amount ELSE operation_cost END,
    operation_by_email=CASE WHEN rec.kind='operation' AND rec.attendance=1 THEN coalesce(operation_by_email,booked) ELSE operation_by_email END,
    clinical_direction=coalesce(clinical_direction,dir)
   WHERE id=lid;
  END IF;
  changes := jsonb_build_object('altegio', note, 'altegio_record_id', rec.record_id, 'visit_at', rec.visit_at, 'attendance', rec.attendance, 'kind', rec.kind);
  INSERT INTO public.lead_history(lead_id,author_email,changed_at,changes) VALUES(lid,'altegio',coalesce(rec.changed_at_altegio,now()),changes);
 END LOOP;
 RETURN jsonb_build_object('applied',applied,'stale',stale);
END $$;
REVOKE ALL ON FUNCTION public.apply_altegio_records(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_altegio_records(jsonb) TO service_role;

CREATE FUNCTION public.claim_altegio_job(_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.altegio_jobs; BEGIN
 UPDATE public.altegio_jobs SET lease_until=now()+interval '90 seconds',status='running',error=NULL,updated_at=now() WHERE id=_id AND status<>'done' AND (lease_until IS NULL OR lease_until<now()) RETURNING * INTO j;
 IF NOT FOUND THEN RETURN NULL; END IF; RETURN to_jsonb(j); END $$;
REVOKE ALL ON FUNCTION public.claim_altegio_job(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_altegio_job(uuid) TO service_role;