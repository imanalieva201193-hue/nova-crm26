create type public.app_role as enum ('commercial_director','rop','senior_cc','operator','sales_manager','agent_manager','checkup_manager','branch_admin','reanimator');

create table public.branches (code text primary key, name text not null, address text, profile text, funnels text[] not null default '{}', sort int default 0);
create table public.employees (id uuid primary key default gen_random_uuid(), email text not null unique, full_name text not null default '', role public.app_role not null default 'operator', branch_codes text[] not null default '{}', active boolean not null default true, created_at timestamptz not null default now());
create table public.services (id uuid primary key default gen_random_uuid(), branch_codes text[] not null default '{}', direction text, subsection text, doctor_text text, name text not null, price numeric, price_text text, currency text not null default 'KGS', price_from boolean not null default false, note text, is_new boolean not null default false);
create table public.doctors (id uuid primary key default gen_random_uuid(), branch_code text references public.branches(code), full_name text not null, specialty text, schedule text, duration text, patient_age text, experience text, status text default 'Работает', indications text, extra text);
create table public.packages (id uuid primary key default gen_random_uuid(), branch_code text, name text not null, includes text, price_separately numeric, package_price numeric, benefit text);
create table public.operations (id uuid primary key default gen_random_uuid(), name text not null, description text, anesthesia text, duration text, primary_rehab text, recovery text, indications text, contraindications text);
create table public.drips (id uuid primary key default gen_random_uuid(), name text not null, price_text text, course text, indications text, effect text, manufacturer text);
create table public.partners (id uuid primary key default gen_random_uuid(), name text not null, type text, specialty text, clinic text, city text, status text default 'Активен', curator_email text, bonus_per_operation numeric default 0, created_at timestamptz not null default now());
create table public.kb_articles (id uuid primary key default gen_random_uuid(), section text not null, title text not null, body text not null default '', branch_code text, sort int default 0);
create table public.leads (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
  patient_name text, phone text not null, lead_date date not null default (now() at time zone 'Asia/Bishkek')::date,
  source text not null, channel text, line text not null, branch_code text not null references public.branches(code),
  funnel text not null, stage int not null default 1, outcome text, outcome_reason text,
  responsible_email text, doctor_id uuid references public.doctors(id), visit_date timestamptz, visited_at date,
  confirmed boolean not null default false, came boolean not null default false, operation_date date,
  operation_cost numeric, prepayment numeric, prepayment_date date, installment boolean not null default false,
  foreigner boolean not null default false, insurance text, interest boolean not null default false,
  next_touch date, comment text, partner_id uuid references public.partners(id), parent_lead_id uuid references public.leads(id));
create table public.lead_services (id uuid primary key default gen_random_uuid(), lead_id uuid not null references public.leads(id) on delete cascade, service_id uuid references public.services(id) on delete set null, package_id uuid references public.packages(id) on delete set null, name text not null, qty int not null default 1, price numeric not null default 0, currency text not null default 'KGS', price_from boolean not null default false, discount numeric not null default 0, is_package boolean not null default false, created_at timestamptz not null default now());
create table public.touches (id uuid primary key default gen_random_uuid(), lead_id uuid not null references public.leads(id) on delete cascade, touched_at timestamptz not null default now(), channel text, result text, no_answer boolean not null default false, author_email text);
create table public.lead_history (id uuid primary key default gen_random_uuid(), lead_id uuid not null references public.leads(id) on delete cascade, author_email text, changed_at timestamptz not null default now(), changes jsonb not null);
create table public.lookups (id uuid primary key default gen_random_uuid(), kind text not null, value text not null, unique(kind,value));

do $$ declare t text; begin
  foreach t in array array['branches','employees','services','doctors','packages','operations','drips','partners','kb_articles','leads','lead_services','touches','lead_history','lookups'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated; grant all on public.%I to service_role; alter table public.%I enable row level security;', t,t,t);
  end loop; end $$;

create or replace function public.my_email() returns text language sql stable as $$ select lower(coalesce(auth.jwt()->>'email','')) $$;
create or replace function public.is_staff() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.employees where lower(email)=public.my_email() and active) $$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.employees where lower(email)=public.my_email() and active and role in ('commercial_director','rop')) $$;
create or replace function public.can_see_branch(_code text) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.employees e where lower(e.email)=public.my_email() and e.active and (e.role in ('commercial_director','rop','senior_cc','operator','agent_manager','reanimator') or _code = any(e.branch_codes))) $$;
create or replace function public.claim_first_admin() returns boolean language plpgsql security definer set search_path=public as $$
begin
  if public.my_email() = '' then return false; end if;
  if exists(select 1 from public.employees) then return false; end if;
  insert into public.employees(email, full_name, role, branch_codes) values (public.my_email(), coalesce(auth.jwt()->'user_metadata'->>'full_name',''), 'commercial_director', array['asanbay','moskovskaya','abd2','abd3']);
  return true;
end $$;
grant execute on function public.claim_first_admin() to authenticated;

do $$ declare t text; begin
  foreach t in array array['branches','services','doctors','packages','operations','drips','kb_articles','lookups','partners'] loop
    execute format('create policy "staff read" on public.%I for select to authenticated using (public.is_staff())', t);
    execute format('create policy "admin write" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop; end $$;

create policy "self or admin read" on public.employees for select to authenticated using (lower(email)=public.my_email() or public.is_admin());
create policy "admin write" on public.employees for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "leads read" on public.leads for select to authenticated using (public.can_see_branch(branch_code));
create policy "leads insert" on public.leads for insert to authenticated with check (public.is_staff());
create policy "leads update" on public.leads for update to authenticated using (public.can_see_branch(branch_code)) with check (public.is_staff());
create policy "leads delete" on public.leads for delete to authenticated using (public.is_admin());

do $$ declare t text; begin
  foreach t in array array['lead_services','touches','lead_history'] loop
    execute format('create policy "via lead" on public.%I for all to authenticated using (exists(select 1 from public.leads l where l.id=lead_id and public.can_see_branch(l.branch_code))) with check (exists(select 1 from public.leads l where l.id=lead_id and public.can_see_branch(l.branch_code)))', t);
  end loop; end $$;

insert into public.branches(code,name,address,profile,funnels,sort) values
('asanbay','Асанбай (Rinos)','мкр Асанбай, ул. А. Токомбаева 44/1','Центр ринопластики и ЛОР-хирургии','{rinos}',1),
('moskovskaya','Московская','ул. Московская 137','Превентивная медицина','{nova_general}',2),
('abd2','Абдумомунова, 2 этаж','ул. Абдумомунова 244, 2 этаж','Превентивная медицина, чекап','{nova_general,nova_check}',3),
('abd3','Абдумомунова, 3 этаж','ул. Абдумомунова 244, 3 этаж','Пластическая и реконструктивная хирургия','{nova_surgery}',4);

insert into public.lookups(kind,value) values
('source','Instagram'),('source','WhatsApp'),('source','Таргет'),('source','2ГИС'),('source','Сайт'),('source','Рекомендация'),('source','Партнёр'),('source','Повторный пациент'),('source','Звонок'),
('reason','Дорого'),('reason','Не дозвонились'),('reason','Выбрал другую клинику'),('reason','Передумал'),('reason','Неактуально'),('reason','Спам / ошибка'),
('insurance','АЮ Гарант'),('insurance','Кыргызстан'),('insurance','АТН полис'),('insurance','НСК (Бишкек Ассист)'),('insurance','ТОО Архимедес (Казахстан)'),('insurance','ОФ «Гражданские инициативы»');

insert into public.services(branch_codes,direction,subsection,name,price,currency) values
('{abd2}','Чекапы','Nova Check','Чек-ап',50000,'KGS'),('{abd2}','Чекапы','Nova Check','Подростковый чек-ап',39000,'KGS'),
('{abd2}','Чекапы','Nova Check','Подготовка к беременности — женщины',43000,'KGS'),('{abd2}','Чекапы','Nova Check','Подготовка к беременности — мужчины',27000,'KGS'),
('{abd3}','Стационар и анестезия','Стационар','ПИТ пластическая хирургия, 1-е сутки',12000,'KGS'),('{abd3}','Стационар и анестезия','Стационар','ПИТ пластическая хирургия, 2-е сутки',9000,'KGS'),
('{abd3}','Стационар и анестезия','Стационар','Палата пластической хирургии, сутки',9000,'KGS'),('{abd3}','Стационар и анестезия','Стационар','ПИТ 1-е сутки — интимпластика / щитовидная железа',9000,'KGS'),
('{abd3}','Стационар и анестезия','Стационар','Общая хирургия: палата, сутки',7000,'KGS'),('{abd3}','Стационар и анестезия','Стационар','Общая хирургия: ПИТ, сутки',9000,'KGS'),
('{abd3}','Стационар и анестезия','Анестезия','Общий наркоз',36000,'KGS'),('{abd3}','Стационар и анестезия','Анестезия','Газовый наркоз (общая хирургия)',15000,'KGS'),('{abd3}','Стационар и анестезия','Анестезия','СМА, седация',12000,'KGS');

insert into public.kb_articles(section,title,body,branch_code,sort) values
('nova_check','Nova Check','Программы: Чек-ап — 50 000 сом; Подростковый — 39 000; Подготовка к беременности: женщины — 43 000, мужчины — 27 000.
Предоплата 5 000 сом (Элсом / Мбанк).
Не больше 3 чекапов в день. Обследование 3 дня, вся программа 3–9 дней. Через год — повторный чекап.','abd2',1),
('installment','Стационар и рассрочка','Рассрочка О!Банк: 3, 6 или 9 месяцев, максимум 250 000 сом; только операции и чекапы.
Скидки, акции и персональные предложения не применяются.
Документы: паспорт + справка с работы за 3–6 месяцев; свыше 300 000 сом — поручитель.
Оформление — на ресепшене Абдумомунова, 2 и 3 этаж (розовые QR-коды).','abd3',2),
('insurance','Страховые','АЮ Гарант, Кыргызстан, АТН полис, НСК (Бишкек Ассист), ТОО Архимедес (Казахстан), ОФ «Гражданские инициативы».
Документы: карточка застрахованного + паспорт или водительское удостоверение.
Всё, что касается красоты, страховка не покрывает.',null,3);

insert into public.doctors(branch_code,full_name,specialty,schedule,status) values
('asanbay','Урмат Таалайбекович','ЛОР-хирург, ринопластика','Вт, Чт 13:00–16:00','Работает'),
('asanbay','Байзаков Алмаз Жыргалбекович','ЛОР-хирург','Чт, Пт, Сб 9:00–18:00; Пн, Ср 13:00–17:00; Вт 9:00–12:00','Работает'),
('asanbay','Уркасымов Эржан Жайлообекович','ЛОР-хирург','Пн, Пт 13:00–18:00','Работает'),
('asanbay','Бессонова Ангелина Сергеевна','ЛОР, хирург','по расписанию в Алтеджио','Работает'),
('asanbay','Таласбаева Саадат Салаватовна','ЛОР','Пн 9:00–13:00, Вт 12:00–16:00, Ср 9:00–13:00','Работает'),
('moskovskaya','Нурмат Кубанычбекович','Флеболог, сосудистый хирург, УЗИ сосудов','Пн, Вт, Ср, Пт 10:00–16:00; Сб 8:30–13:00','Работает'),
('moskovskaya','Мадрахимова Азиза Алижановна','Флеболог, сосудистый хирург','Пн, Вт, Чт 9:00–13:00','Работает'),
('moskovskaya','Бакиров Жолдошбек Усеевич','Уролог, андролог, эндокринолог, anti-age','Вт, Чт 14:00–18:00; Сб 10:00–17:00','Работает'),
('moskovskaya','Елистратов Артем Анательевич','Ревматолог','Пн, Вт, Ср, Пт, Сб 9:00–16:00','Работает'),
('moskovskaya','Мамаджанов Дильшод Бахтиярович','Гепатолог, инфекционист, паразитолог','Пн, Ср, Пт 13:00–17:00','Работает'),
('moskovskaya','Урманбетова Сайкал Кубатбековна','Дерматовенеролог, дерматокосметолог','Пт 9:00–13:00','Работает'),
('moskovskaya','Усубалиев Мейкин Бейшембаевич','Дерматовенеролог','Чт 15:00–18:00','Работает'),
('moskovskaya','Жумабеков Субанбек Бакытович','Ортопед','Пн, Чт 13:00–17:00; Сб 11:00–14:00','Работает'),
('moskovskaya','Шералиев Таалайбек Усеналиевич','Ортопед','Вт 14:00–17:00 (Чт временно не принимает)','Работает'),
('moskovskaya','Кадырбеков Рамис Кадырбекович','Травматолог-ортопед','Ср, Пт 14:00–17:00','Работает'),
('moskovskaya','Лукьянов Дмитрий Васильевич','Физиотерапевт','Пн, Ср, Пт 10:00–17:00','Работает'),
('moskovskaya','Потехина Яна Игоревна','Невролог','Пн, Ср, Пт 13:15–18:15','Работает'),
('moskovskaya','Кадыракунов Нурлан Эркинбекович','УЗИ','Пн, Ср, Пт 9:00–17:00','Работает'),
('abd2','Шепель Марина Николаевна','Гинеколог','Пн, Ср, Чт, Пт 9:30–16:00','Работает'),
('abd2','Ерубаев Нуржан Дауренович','Эндокринный хирург, онколог, УЗИ','Пн 13:00–16:00; Вт, Чт 9:00–16:00; Ср 9:00–14:00; Пт 9:00–13:00','Работает'),
('abd2','Жумагулова Даткайым Саламатовна','Эндокринолог','Пн 9:00–12:30; Ср 16:00–18:00; Пт 13:30–16:00; Сб 9:00–16:00','Работает'),
('abd2','Валишева Рамиля Джалильевна','Эндокринолог, нутрициолог','Пн, Ср 13:00–17:00; Вт, Чт 9:00–15:00','Работает'),
('abd2','Джафарова Гулбахор Рамазановна','Нутрициолог, эндокринолог','Пн, Ср, Пт 9:00–13:00','Работает'),
('abd2','Жазгул Тенирбердиевна','Нутрициолог, терапевт','Пн, Вт, Чт 9:00–14:00','Работает'),
('abd2','Дарчыбаева Мунара Кадышевна','Гастроэнтеролог, кардиолог, терапевт','Пн, Ср, Пт 8:30–13:00','Работает'),
('abd2','Маматов Эмрах Салманович','Терапевт, инфузия','Ср, Пт, Сб, Вс 9:00–21:00; Пн, Вт, Чт 14:00–21:00','Работает'),
('abd2','Алимова Надира Юлдашевна','Маммолог','Вт, Чт 14:00–17:00','Работает'),
('abd2','Токтобаева Айгерим Женишовна','Онколог, маммолог','Пт 16:00–19:00','Работает'),
('abd2','Асанова Айжана Арналовна','Маммолог','декрет','Декрет'),
('abd2','Темирбекова Жаныл Толомушевна','ЛОР','Пн, Ср, Пт 9:00–15:00','Работает'),
('abd2','Тыналиева Асел Асхатовна','ЛОР','Вт, Сб 9:00–13:00','Работает'),
('abd2','Калюжная Оксана Александровна','Остеопат, физиотерапевт, иглорефлексотерапевт','Пн, Чт 9:30–16:00','Работает'),
('abd2','Камалов Сардор Шухратович','Травматолог-ортопед','Пн–Пт 10:00–13:00','Работает'),
('abd2','Потехина Яна Игоревна','Невролог','Вт, Чт 9:00–13:00','Работает'),
('abd2','Сыдыкбекова Асел Келдибековна','Психолог','Чт 8:00–19:00; Сб 8:00–13:00','Работает'),
('abd2','Токтогожоев Нурахмед Анарбекович','Общий хирург, проктолог','Ср 16:00–19:00','Работает'),
('abd2','Шаршембиев Азамат Джолдошбекович','Уролог','Вт, Чт 13:00–15:30; Сб 13:00–15:00','Работает'),
('abd2','Гогаева Лайла Борисовна','Офтальмолог','Пн, Ср 14:00–17:00','Работает'),
('abd2','Бейшеева Алмагуль Жумабаевна','УЗИ','Пн 8:00–16:00; Вт 9:00–13:30; Чт 9:00–14:00; Сб 8:00–16:00','Работает'),
('abd2','Кудайбергенова Дарыгуль Айылчиевна','Массажист','Вт, Ср, Пт 9:00–18:00; Сб 9:00–15:00','Работает'),
('abd3','Исмаилов Эдиль Алманбекович','Пластический хирург','Пн–Пт 9:00–18:00','Работает'),
('abd3','Бочарников Александр Андреевич','Пластический хирург','Пн–Пт 9:00–18:00','Работает'),
('abd3','Аралбаев Ержан Муратович','Пластический хирург','Пн–Пт 9:00–18:00','Работает'),
('abd3','Логвиненко Мария Юрьевна','Пластический хирург','Пн–Пт 9:00–18:00','Работает'),
('abd3','Мурат Тегени Раджив','Пластический хирург (интимная пластика, гинекология)','Пн–Пт 9:00–18:00','Работает'),
('abd3','Кубанычбеков Элдияр Кубанычбекович','Пластический хирург (ассистент)','Пн–Сб 9:00–18:00','Работает'),
('abd3','Дильгер Алтынай','Пластический хирург, инъекционная косметология','декрет','Декрет'),
('abd3','Нургазиев Аман Сапарбекович','Общий хирург (лапароскопия, грыжи)','Пн–Пт 9:00–15:00','Работает'),
('abd3','Апиев Канат Каныбекович','Микрохирург (кисть, нервы, сухожилия)','Пн–Пт 9:00–18:00','Работает'),
('abd3','Камчыбеков Бексултан Камчыбекович','Микрохирург (кисть, нервы, сухожилия)','Пн–Пт 9:00–18:00','Работает'),
(null,'Даниярова Линда Данияровна','Кардиолог, ЭхоКГ','Ср 9:00–12:00','Работает');