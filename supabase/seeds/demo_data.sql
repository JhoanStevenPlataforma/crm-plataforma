--
-- Demo dataset for the local stack.
--
-- Run it by hand after `npx supabase db reset --local`, which wipes everything:
--
--   docker exec -i supabase_db_atomic-crm-demo psql -U postgres -d postgres \
--     -f - < supabase/seeds/demo_data.sql
--
-- Deliberately NOT wired into `[db.seed]` in config.toml. A reset would then
-- always land on an initialised CRM with six users, and `onboarding.spec.ts`
-- (the first-user signup flow) tests exactly the opposite state.
--
-- Every user's password is `Plataforma123!`.
--
--   admin@plataforma.com        admin    Ana Duarte
--   gerente@plataforma.com      manager  Marcos Ibanez
--   comercial1@plataforma.com   rep      Lucia Fernandez
--   comercial2@plataforma.com   rep      Diego Salazar
--   comercial3@plataforma.com   rep      Sofia Moreno
--   comercial4@plataforma.com   rep      Javier Ortiz
--
-- The deal set is built around the completed-task rule: some deals have work
-- finished since they entered their current stage and can be dragged to the
-- next column, others have none and the kanban dialog refuses them. A demo
-- where every card moves proves nothing about the rule that stops them.
--
-- Re-runnable: it clears its own data first.
--

begin;

--
-- 0. Clear the previous run.
--
-- `tasks` turns a DELETE into a soft delete unless the retention flag is set,
-- which would leave the rows behind and break the id ranges below.
--
select set_config('app.purge_tasks', 'on', true);

delete from public.task_links;
delete from public.task_assignments;
delete from public.tasks;
delete from public.deal_notes;
delete from public.deal_stage_changes;
delete from public.deals;
delete from public.contact_notes;
delete from public.contacts;
delete from public.companies;
delete from public.leads;
delete from public.team_member_budgets;
delete from public.team_budgets;
delete from public.team_members;
delete from public.teams;
delete from public.tags;
delete from auth.users;
delete from public.sales;

--
-- 1. Users. The `on_auth_user_created` trigger writes the matching
--    `public.sales` row; the role it picks (first user admin, the rest reps) is
--    corrected below.
--
insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, email_change, email_change_token_new, recovery_token
)
select
    '00000000-0000-0000-0000-000000000000',
    u.id,
    'authenticated',
    'authenticated',
    u.email,
    extensions.crypt('Plataforma123!', extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('first_name', u.first_name, 'last_name', u.last_name),
    '', '', '', ''
from (values
    ('11111111-1111-4111-8111-000000000001'::uuid, 'admin@plataforma.com',      'Ana',    'Duarte'),
    ('11111111-1111-4111-8111-000000000002'::uuid, 'gerente@plataforma.com',    'Marcos', 'Ibanez'),
    ('11111111-1111-4111-8111-000000000003'::uuid, 'comercial1@plataforma.com', 'Lucia',  'Fernandez'),
    ('11111111-1111-4111-8111-000000000004'::uuid, 'comercial2@plataforma.com', 'Diego',  'Salazar'),
    ('11111111-1111-4111-8111-000000000005'::uuid, 'comercial3@plataforma.com', 'Sofia',  'Moreno'),
    ('11111111-1111-4111-8111-000000000006'::uuid, 'comercial4@plataforma.com', 'Javier', 'Ortiz')
) as u(id, email, first_name, last_name);

-- Without an identity row GoTrue has no email provider to authenticate against,
-- so the password above would never be checked and every login would fail.
insert into auth.identities (
    provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
)
select
    u.id::text,
    u.id,
    jsonb_build_object(
        'sub', u.id::text,
        'email', u.email,
        'email_verified', true,
        'phone_verified', false),
    'email',
    now(), now(), now()
from auth.users u;

-- Fixed ids, so everything below can reference people by number instead of by
-- a subquery on every row. Safe here: nothing points at `sales` yet.
update public.sales s
   set id = m.id, role = m.role::public.sales_role
  from (values
    ('admin@plataforma.com',      1, 'admin'),
    ('gerente@plataforma.com',    2, 'manager'),
    ('comercial1@plataforma.com', 3, 'rep'),
    ('comercial2@plataforma.com', 4, 'rep'),
    ('comercial3@plataforma.com', 5, 'rep'),
    ('comercial4@plataforma.com', 6, 'rep')
  ) as m(email, id, role)
 where s.email = m.email::extensions.citext;

select setval(pg_get_serial_sequence('public.sales', 'id'), 100, false);

--
-- 2. Teams, their budgets and how each budget is split between the members.
--
insert into public.teams (id, name, description) values
    (1, 'Equipo Norte', 'Cuentas corporativas de la region norte'),
    (2, 'Equipo Sur',   'Pymes y sector publico de la region sur');
select setval(pg_get_serial_sequence('public.teams', 'id'), 100, false);

insert into public.team_members (id, team_id, sales_id) values
    (1, 1, 2),   -- Marcos, manager
    (2, 1, 3),   -- Lucia
    (3, 1, 4),   -- Diego
    (4, 2, 5),   -- Sofia
    (5, 2, 6);   -- Javier
select setval(pg_get_serial_sequence('public.team_members', 'id'), 100, false);

-- One row per period, never a column overwritten: the previous target has to
-- stay readable. Last year's is closed, this year's is the one in force.
insert into public.team_budgets (id, team_id, period_start, period_end, amount) values
    (1, 1, date_trunc('year', now())::date - interval '1 year',
           date_trunc('year', now())::date - interval '1 day', 600000),
    (2, 1, date_trunc('year', now())::date,
           (date_trunc('year', now()) + interval '1 year - 1 day')::date, 900000),
    (3, 2, date_trunc('year', now())::date,
           (date_trunc('year', now()) + interval '1 year - 1 day')::date, 520000);
select setval(pg_get_serial_sequence('public.team_budgets', 'id'), 100, false);

-- Norte is slightly over-allocated and Sur under-allocated on purpose: the
-- dashboard reports both, and a demo where the split always adds up exactly
-- never shows that it does.
insert into public.team_member_budgets (id, team_id, budget_id, team_member_id, amount) values
    (1, 1, 2, 1, 200000),
    (2, 1, 2, 2, 420000),
    (3, 1, 2, 3, 330000),
    (4, 2, 3, 4, 260000),
    (5, 2, 3, 5, 210000);
select setval(pg_get_serial_sequence('public.team_member_budgets', 'id'), 100, false);

--
-- 3. Tags
--
insert into public.tags (id, name, color) values
    (1, 'estrategico',   '#99c1de'),
    (2, 'renovacion',    '#c5dedd'),
    (3, 'riesgo',        '#fde2e4'),
    (4, 'sector-publico','#d6e2e9'),
    (5, 'referido',      '#fff1e6'),
    (6, 'congreso-2026', '#fad2e1'),
    (7, 'upsell',        '#dbe7e4'),
    (8, 'frio',          '#f0efeb');
select setval(pg_get_serial_sequence('public.tags', 'id'), 100, false);

--
-- 4. Companies. `logo` is set so `handle_company_saved` returns early instead
--    of reaching out over HTTP for a favicon on every insert.
--
insert into public.companies
    (id, name, sector, size, website, phone_number, city, country, sales_id, description, revenue, logo, created_at)
values
    (1, 'Acme Industrial',   'industrials',             450, 'https://acme.test',      '+34 910 111 222', 'Madrid',    'Espana', 3, 'Fabricante de componentes industriales.',        '80M',  '{"src":"","title":"Acme"}',   now() - interval '400 days'),
    (2, 'Bravo Logistica',   'industrials',             180, 'https://bravolog.test',  '+34 933 222 333', 'Barcelona', 'Espana', 3, 'Operador logistico peninsular.',                 '35M',  '{"src":"","title":"Bravo"}',  now() - interval '360 days'),
    (3, 'Ceres Agro',        'consumer-staples',         90, 'https://ceresagro.test', '+34 954 333 444', 'Sevilla',   'Espana', 4, 'Cooperativa agroalimentaria.',                   '18M',  '{"src":"","title":"Ceres"}',  now() - interval '320 days'),
    (4, 'Delta Seguros',     'financials',             1200, 'https://deltaseg.test',  '+34 915 444 555', 'Madrid',    'Espana', 4, 'Aseguradora con red de agentes.',                '210M', '{"src":"","title":"Delta"}',  now() - interval '300 days'),
    (5, 'Everest Salud',     'health-care',             640, 'https://everest.test',   '+34 963 555 666', 'Valencia',  'Espana', 5, 'Grupo de clinicas privadas.',                    '95M',  '{"src":"","title":"Everest"}',now() - interval '260 days'),
    (6, 'Fenix Retail',      'consumer-discretionary',  310, 'https://fenixretail.test','+34 944 666 777','Bilbao',    'Espana', 5, 'Cadena de tiendas de moda.',                     '52M',  '{"src":"","title":"Fenix"}',  now() - interval '230 days'),
    (7, 'Gamma Software',    'information-technology',   75, 'https://gammasoft.test', '+34 917 777 888', 'Madrid',    'Espana', 6, 'ISV de software de gestion.',                    '9M',   '{"src":"","title":"Gamma"}',  now() - interval '190 days'),
    (8, 'Helios Energia',    'energy',                  880, 'https://helios.test',    '+34 976 888 999', 'Zaragoza',  'Espana', 6, 'Comercializadora de energia renovable.',         '150M', '{"src":"","title":"Helios"}', now() - interval '150 days');
select setval(pg_get_serial_sequence('public.companies', 'id'), 100, false);

--
-- 5. Contacts. `avatar` is set for the same reason as the company logo.
--
insert into public.contacts
    (id, first_name, last_name, gender, title, company_id, sales_id, status, tags,
     email_jsonb, phone_jsonb, avatar, first_seen, last_seen, has_newsletter, background)
values
    (1,  'Marta',   'Gil',      'female', 'Directora de operaciones', 1, 3, 'hot',         '{1,2}', '[{"email":"marta.gil@acme.test","type":"Work"}]',        '[{"number":"+34 600 100 001","type":"Work"}]', '{"src":""}', now() - interval '390 days', now() - interval '4 days',  true,  'Decisora final en la renovacion anual.'),
    (2,  'Ruben',   'Castro',   'male',   'Responsable de compras',   1, 3, 'warm',        '{2}',   '[{"email":"ruben.castro@acme.test","type":"Work"}]',     '[{"number":"+34 600 100 002","type":"Work"}]', '{"src":""}', now() - interval '380 days', now() - interval '11 days', false, 'Negocia precio, no alcance.'),
    (3,  'Elena',   'Prieto',   'female', 'CIO',                      2, 3, 'hot',         '{1}',   '[{"email":"elena.prieto@bravolog.test","type":"Work"}]', '[{"number":"+34 600 100 003","type":"Work"}]', '{"src":""}', now() - interval '350 days', now() - interval '6 days',  true,  'Impulsora del proyecto ERP.'),
    (4,  'Tomas',   'Rey',      'male',   'Jefe de almacen',          2, 3, 'cold',        '{8}',   '[{"email":"tomas.rey@bravolog.test","type":"Work"}]',    '[{"number":"+34 600 100 004","type":"Work"}]', '{"src":""}', now() - interval '340 days', now() - interval '48 days', false, 'Usuario final, no firma.'),
    (5,  'Nuria',   'Vidal',    'female', 'Gerente',                  3, 4, 'warm',        '{5}',   '[{"email":"nuria.vidal@ceresagro.test","type":"Work"}]', '[{"number":"+34 600 100 005","type":"Work"}]', '{"src":""}', now() - interval '310 days', now() - interval '19 days', true,  'Llego por recomendacion de Delta.'),
    (6,  'Alberto', 'Nunez',    'male',   'Director financiero',      4, 4, 'in-contract', '{1,7}', '[{"email":"alberto.nunez@deltaseg.test","type":"Work"}]','[{"number":"+34 600 100 006","type":"Work"}]', '{"src":""}', now() - interval '290 days', now() - interval '2 days',  true,  'Firmante del portal de clientes.'),
    (7,  'Silvia',  'Marquez',  'female', 'Responsable de IT',        4, 4, 'warm',        '{7}',   '[{"email":"silvia.marquez@deltaseg.test","type":"Work"}]','[{"number":"+34 600 100 007","type":"Work"}]','{"src":""}', now() - interval '280 days', now() - interval '9 days',  false, 'Valida la integracion tecnica.'),
    (8,  'Ivan',    'Roldan',   'male',   'Director medico',          5, 5, 'hot',         '{1}',   '[{"email":"ivan.roldan@everest.test","type":"Work"}]',   '[{"number":"+34 600 100 008","type":"Work"}]', '{"src":""}', now() - interval '250 days', now() - interval '3 days',  true,  'Pide soporte 24x7 para tres clinicas.'),
    (9,  'Clara',   'Serrano',  'female', 'Compras',                  5, 5, 'cold',        '{3}',   '[{"email":"clara.serrano@everest.test","type":"Work"}]', '[{"number":"+34 600 100 009","type":"Work"}]', '{"src":""}', now() - interval '240 days', now() - interval '35 days', false, 'Bloquea por presupuesto.'),
    (10, 'Hugo',    'Bermudez', 'male',   'Director de marketing',    6, 5, 'warm',        '{6}',   '[{"email":"hugo.bermudez@fenixretail.test","type":"Work"}]','[{"number":"+34 600 100 010","type":"Work"}]','{"src":""}',now() - interval '220 days', now() - interval '14 days', true,  'Conocido en el congreso de 2026.'),
    (11, 'Lorena',  'Pina',     'female', 'Ecommerce manager',        6, 5, 'warm',        '{6,7}', '[{"email":"lorena.pina@fenixretail.test","type":"Work"}]','[{"number":"+34 600 100 011","type":"Work"}]','{"src":""}', now() - interval '210 days', now() - interval '21 days', false, 'Pide rediseno del portal.'),
    (12, 'Oscar',   'Lozano',   'male',   'CEO',                      7, 6, 'cold',        '{3,8}', '[{"email":"oscar.lozano@gammasoft.test","type":"Work"}]','[{"number":"+34 600 100 012","type":"Work"}]', '{"src":""}', now() - interval '180 days', now() - interval '30 days', false, 'Se fue con un competidor mas barato.'),
    (13, 'Beatriz', 'Cano',     'female', 'Directora de sistemas',    8, 6, 'hot',         '{1,4}', '[{"email":"beatriz.cano@helios.test","type":"Work"}]',   '[{"number":"+34 600 100 013","type":"Work"}]', '{"src":""}', now() - interval '140 days', now() - interval '5 days',  true,  'Quiere automatizar la facturacion.'),
    (14, 'Raul',    'Ferrer',   'male',   'Responsable de compras',   8, 6, 'warm',        '{4}',   '[{"email":"raul.ferrer@helios.test","type":"Work"}]',    '[{"number":"+34 600 100 014","type":"Work"}]', '{"src":""}', now() - interval '130 days', now() - interval '16 days', false, 'Pide licitacion formal.'),
    (15, 'Patricia','Duran',    'female', 'Directora general',        3, 4, 'warm',        '{5}',   '[{"email":"patricia.duran@ceresagro.test","type":"Work"}]','[{"number":"+34 600 100 015","type":"Work"}]','{"src":""}',now() - interval '300 days', now() - interval '25 days', true,  'Decide la migracion a cloud.'),
    (16, 'Sergio',  'Alonso',   'male',   'Controller',               1, 3, 'cold',        '{2}',   '[{"email":"sergio.alonso@acme.test","type":"Work"}]',    '[{"number":"+34 600 100 016","type":"Work"}]', '{"src":""}', now() - interval '370 days', now() - interval '60 days', false, 'Solo interviene al cierre.'),
    (17, 'Alicia',  'Vega',     'female', 'Jefa de proyecto',         2, 3, 'warm',        '{1}',   '[{"email":"alicia.vega@bravolog.test","type":"Work"}]',  '[{"number":"+34 600 100 017","type":"Work"}]', '{"src":""}', now() - interval '330 days', now() - interval '8 days',  true,  'Coordina la implantacion.'),
    (18, 'Andres',  'Molina',   'male',   'Director de operaciones',  7, 6, 'cold',        '{8}',   '[{"email":"andres.molina@gammasoft.test","type":"Work"}]','[{"number":"+34 600 100 018","type":"Work"}]','{"src":""}',now() - interval '175 days', now() - interval '40 days', false, 'Contacto secundario.');
select setval(pg_get_serial_sequence('public.contacts', 'id'), 100, false);

--
-- 6. Leads: prospects that are not contacts yet. `company_name` is free text on
--    purpose -- most arrive from a web form naming a company nobody has typed
--    into the CRM.
--
insert into public.leads
    (id, first_name, last_name, email, phone, company_name, title, source, status, score, sales_id, notes, tags, created_at, updated_at)
values
    (1,  'Nerea',   'Ibarra',  'nerea.ibarra@ionix.test',       '+34 600 200 001', 'Ionix Consulting',   'Directora de operaciones', 'web',      'new',         70, 3, 'Descargo el comparativo de precios.',              '{6}',   now() - interval '9 days',  now() - interval '9 days'),
    (2,  'Pablo',   'Herrera', 'pablo.herrera@nordan.test',     '+34 600 200 002', 'Nordan Muebles',     'Gerente',                  'event',    'contacted',   55, 3, 'Stand del congreso, pidio una demo.',              '{6}',   now() - interval '17 days', now() - interval '5 days'),
    (3,  'Irene',   'Salas',   'irene.salas@vitalab.test',      '+34 600 200 003', 'Vitalab',            'Responsable de calidad',   'referral', 'qualified',    85, 4, 'Referida por Everest Salud. Presupuesto aprobado.','{5,1}', now() - interval '24 days', now() - interval '2 days'),
    (4,  'Gonzalo', 'Pardo',   'gonzalo.pardo@trameso.test',    '+34 600 200 004', 'Trameso',            'CIO',                      'outbound', 'contacted',   40, 4, 'Primera llamada hecha, pide informacion escrita.', '{}',    now() - interval '13 days', now() - interval '6 days'),
    (5,  'Rocio',   'Espin',   'rocio.espin@ayuntamiento.test', '+34 600 200 005', 'Ayuntamiento de Ansa','Interventora',            'partner',  'qualified',    75, 6, 'Va a licitacion en el proximo trimestre.',         '{4}',   now() - interval '31 days', now() - interval '3 days'),
    (6,  'Martin',  'Cuesta',  'martin.cuesta@bluecar.test',    '+34 600 200 006', 'BlueCar Rental',     'Director financiero',      'web',      'unqualified',  20, 6, 'Fuera de rango de tamano, no hay encaje.',         '{8}',   now() - interval '28 days', now() - interval '20 days'),
    (7,  'Ainhoa',  'Recio',   'ainhoa.recio@delmar.test',      '+34 600 200 007', 'Conservas Delmar',   'Directora general',        'referral', 'new',          60, 5, 'La recomendo Ceres Agro.',                         '{5}',   now() - interval '4 days',  now() - interval '4 days'),
    (8,  'Victor',  'Nadal',   'victor.nadal@sertec.test',      '+34 600 200 008', 'Sertec Servicios',   'Responsable de IT',        'outbound', 'contacted',   45, 5, 'Interesado pero sin fecha.',                       '{}',    now() - interval '19 days', now() - interval '10 days'),
    (9,  'Miriam',  'Quiroga', 'miriam.quiroga@lumina.test',    '+34 600 200 009', 'Lumina Estudio',     'Socia fundadora',          'event',    'new',          50, 5, 'Congreso 2026, pidio caso de exito.',              '{6}',   now() - interval '7 days',  now() - interval '7 days'),
    (10, 'Ismael',  'Bravo',   'ismael.bravo@petraq.test',      '+34 600 200 010', 'Petraq Minerales',   'Director de compras',      'web',      'qualified',    80, 3, 'Pide propuesta para dos plantas.',                 '{1}',   now() - interval '11 days', now() - interval '1 day');
select setval(pg_get_serial_sequence('public.leads', 'id'), 100, false);

--
-- 7. Deals.
--
-- `created_at` and the history rows in section 9 decide which of these the
-- kanban will let a user move: the rule counts tasks completed since the deal
-- entered the stage it is leaving.
--
insert into public.deals
    (id, name, company_id, contact_ids, category, stage, description, amount,
     sales_id, team_id, index, expected_closing_date, created_at, updated_at)
values
    (1,  'Renovacion anual Acme',        1, '{1,2}',   'other',          'in-negociation', 'Renovacion del contrato marco con ampliacion de licencias.', 120000, 3, 1, 0, current_date + 25, now() - interval '150 days', now() - interval '20 days'),
    (2,  'Implantacion ERP Bravo',       2, '{3,17}',  'other',          'proposal-sent',  'Sustitucion del ERP heredado en tres almacenes.',            85000,  3, 1, 0, current_date + 40, now() - interval '120 days', now() - interval '14 days'),
    (3,  'Migracion cloud Ceres',        3, '{5,15}',  'other',          'opportunity',    'Salida del datacenter propio hacia cloud gestionada.',       45000,  4, 1, 0, current_date + 70, now() - interval '30 days',  now() - interval '30 days'),
    (4,  'Portal de clientes Delta',     4, '{6,7}',   'website-design', 'won',            'Portal de autoservicio para asegurados.',                    210000, 4, 1, 0, current_date - 8,  now() - interval '200 days', now() - interval '8 days'),
    (5,  'Soporte premium Everest',      5, '{8}',     'other',          'in-negociation', 'Soporte 24x7 para tres clinicas.',                           64000,  5, 2, 0, current_date + 18, now() - interval '95 days',  now() - interval '11 days'),
    (6,  'Rediseno web Fenix',           6, '{10,11}', 'website-design', 'proposal-sent',  'Rediseno del ecommerce y del portal de tienda.',             32000,  5, 2, 1, current_date + 33, now() - interval '80 days',  now() - interval '18 days'),
    (7,  'Licencias Gamma',              7, '{12,18}', 'other',          'lost',           'Renovacion de licencias perdida frente a un competidor.',     28000,  6, 2, 0, current_date - 25, now() - interval '110 days', now() - interval '25 days'),
    (8,  'Automatizacion Helios',        8, '{13}',    'other',          'opportunity',    'Automatizacion del ciclo de facturacion.',                   51000,  6, 2, 0, current_date + 60, now() - interval '40 days',  now() - interval '40 days'),
    (9,  'Expansion LatAm Iris',         1, '{1}',     'other',          'in-negociation', 'Extension del contrato a las filiales de LatAm.',            175000, 3, 1, 1, current_date + 45, now() - interval '70 days',  now() - interval '6 days'),
    (10, 'CRM para Jupiter',             3, '{15}',    'other',          'delayed',        'Proyecto aplazado a la espera del cierre del ejercicio.',     39000,  4, 1, 0, current_date + 120,now() - interval '160 days', now() - interval '35 days'),
    (11, 'Kiosco digital Kappa',         6, '{10}',    'ui-design',      'won',            'Kioscos de autoconsulta para veinte tiendas.',               96000,  5, 2, 1, current_date - 21, now() - interval '175 days', now() - interval '21 days'),
    (12, 'Integracion Lumen',            8, '{13,14}', 'other',          'opportunity',    'Integracion con el sistema de medicion de consumo.',         73000,  6, 2, 1, current_date + 90, now() - interval '55 days',  now() - interval '12 days'),
    (13, 'Analitica Mercurio',           4, '{6}',     'other',          'proposal-sent',  'Cuadro de mando de siniestralidad para direccion.',          145000, 2, 1, 2, current_date + 28, now() - interval '65 days',  now() - interval '9 days'),
    (14, 'Onboarding Nova',              2, '{17}',    'copywriting',    'opportunity',    'Contenidos de onboarding para el equipo de almacen.',        22000,  3, 1, 2, current_date + 50, now() - interval '3 days',   now() - interval '3 days');
select setval(pg_get_serial_sequence('public.deals', 'id'), 100, false);

--
-- 8. Tasks.
--
-- `done_date` is what drives `completed_at` and the completed status through
-- `tasks_defaults_on_insert`, so a finished task is one line here.
--
-- Tasks tied to a DEAL leave `contact_id` null: the insert trigger would create
-- a primary contact link, and a task may only have one primary link.
--
insert into public.tasks
    (id, title, description, type, contact_id, due_date, done_date,
     owner_sales_id, created_by, priority_id, created_at)
select
    t.id, t.title, t.description, t.type, t.contact_id, t.due_date, t.done_date,
    t.owner, t.owner,
    (select id from public.task_priorities where key = t.priority),
    t.created_at
from (values
    -- Deal 1 (in-negociation since -20d): finished work AFTER that, so it moves.
    (1,  'Llamada de cierre con Marta Gil',        'Repasar el descuento por volumen antes de firmar.', 'call',    null::bigint, now() + interval '2 days',  now() - interval '5 days',  3, 'high',   now() - interval '25 days'),
    (2,  'Enviar borrador de adenda',              'Adenda de licencias adicionales.',                  'email',   null::bigint, now() + interval '6 days',  null::timestamptz,          3, 'normal', now() - interval '4 days'),
    -- Deal 2 (proposal-sent since -14d): nothing finished since. Blocked.
    (3,  'Preparar la propuesta ERP',              'Alcance de los tres almacenes.',                    'email',   null::bigint, now() - interval '16 days', now() - interval '16 days', 3, 'high',   now() - interval '30 days'),
    (4,  'Reunion de seguimiento con Elena',       'Pendiente de agendar desde hace dos semanas.',      'meeting', null::bigint, now() - interval '3 days',  null::timestamptz,          3, 'urgent', now() - interval '13 days'),
    -- Deal 3 (opportunity since creation, -30d): nothing finished. Blocked.
    (5,  'Cualificar la migracion de Ceres',       'Inventario de servidores actuales.',                'call',    null::bigint, now() + interval '4 days',  null::timestamptz,          4, 'normal', now() - interval '28 days'),
    -- Deal 4 (won since -8d)
    (6,  'Kick-off del portal Delta',              'Sesion de arranque con IT y negocio.',              'meeting', null::bigint, now() - interval '6 days',  now() - interval '6 days',  4, 'high',   now() - interval '20 days'),
    (7,  'Enviar contrato firmado a Alberto',      null,                                                'email',   null::bigint, now() - interval '9 days',  now() - interval '9 days',  4, 'high',   now() - interval '15 days'),
    -- Deal 5 (in-negociation since -11d)
    (8,  'Demo del SLA 24x7',                      'Con el director medico y su equipo.',               'demo',    null::bigint, now() - interval '4 days',  now() - interval '4 days',  5, 'high',   now() - interval '18 days'),
    (9,  'Ajustar precio del soporte premium',     null,                                                'call',    null::bigint, now() + interval '3 days',  null::timestamptz,          5, 'normal', now() - interval '5 days'),
    -- Deal 6 (proposal-sent since -18d): nothing finished since. Blocked.
    (10, 'Enviar propuesta de rediseno',           null,                                                'email',   null::bigint, now() - interval '19 days', now() - interval '19 days', 5, 'normal', now() - interval '25 days'),
    (11, 'Reclamar respuesta a Fenix',             'Sin noticias desde el envio de la propuesta.',      'follow-up',null::bigint,now() - interval '5 days',  null::timestamptz,          5, 'high',   now() - interval '12 days'),
    -- Deal 7 (lost since -25d)
    (12, 'Post-mortem de la perdida de Gamma',     'Precio un 30% por debajo del nuestro.',             'meeting', null::bigint, now() - interval '22 days', now() - interval '22 days', 6, 'normal', now() - interval '30 days'),
    -- Deal 8 (opportunity since -40d): nothing finished. Blocked.
    (13, 'Mapear el circuito de facturacion',      null,                                                'meeting', null::bigint, now() + interval '8 days',  null::timestamptz,          6, 'normal', now() - interval '35 days'),
    -- Deal 9 (in-negociation since -6d)
    (14, 'Revisar condiciones LatAm con legal',    'Fiscalidad de Mexico y Colombia.',                  'meeting', null::bigint, now() - interval '2 days',  now() - interval '2 days',  3, 'urgent', now() - interval '10 days'),
    (15, 'Preparar comparativa de monedas',        null,                                                'email',   null::bigint, now() + interval '5 days',  null::timestamptz,          3, 'normal', now() - interval '3 days'),
    -- Deal 10 (delayed since -35d): nothing finished. Blocked.
    (16, 'Retomar Jupiter tras el cierre',         'Recordatorio para el proximo trimestre.',           'follow-up',null::bigint,now() + interval '30 days', null::timestamptz,          4, 'low',    now() - interval '34 days'),
    -- Deal 11 (won since -21d, moved with an admin override)
    (17, 'Instalacion piloto de dos kioscos',      null,                                                'ship',    null::bigint, now() - interval '30 days', now() - interval '30 days', 5, 'high',   now() - interval '45 days'),
    -- Deal 12 (opportunity since -12d)
    (18, 'Taller tecnico de integracion',          'Con Beatriz Cano y su equipo de sistemas.',         'meeting', null::bigint, now() - interval '7 days',  now() - interval '7 days',  6, 'normal', now() - interval '20 days'),
    -- Deal 13 (proposal-sent since -9d)
    (19, 'Presentar el cuadro de mando a direccion',null,                                               'demo',    null::bigint, now() - interval '5 days',  now() - interval '5 days',  2, 'high',   now() - interval '14 days'),
    (20, 'Recoger feedback de siniestralidad',     null,                                                'call',    null::bigint, now() + interval '4 days',  null::timestamptz,          2, 'normal', now() - interval '4 days'),
    -- Deal 14 (opportunity since -3d): nothing finished. Blocked.
    (21, 'Cualificar el alcance de Nova',          null,                                                'call',    null::bigint, now() + interval '1 day',   null::timestamptz,          3, 'normal', now() - interval '2 days'),

    -- Contact-level work: these get their primary link on the contact.
    (22, 'Felicitar a Marta por el aniversario',   null,                                                'thank-you', 1,          now() + interval '9 days',  null::timestamptz,          3, 'low',    now() - interval '2 days'),
    (23, 'Comida con Ruben Castro',                'Pendiente desde antes del verano.',                 'lunch',     2,          now() - interval '12 days', null::timestamptz,          3, 'low',    now() - interval '30 days'),
    (24, 'Actualizar el organigrama de Delta',     null,                                                'none',      7,          now() + interval '14 days', null::timestamptz,          4, 'low',    now() - interval '6 days'),
    (25, 'Llamar a Clara sobre el presupuesto',    'Bloquea la firma de Everest.',                      'call',      9,          now() - interval '1 day',   null::timestamptz,          5, 'urgent', now() - interval '9 days'),
    (26, 'Enviar caso de exito a Hugo',            null,                                                'email',    10,          now() + interval '3 days',  null::timestamptz,          5, 'normal', now() - interval '3 days'),
    (27, 'Cerrar la ficha de Oscar Lozano',        'Se marcho a un competidor, dejar constancia.',      'none',     12,          now() - interval '20 days', now() - interval '20 days', 6, 'low',    now() - interval '26 days'),
    (28, 'Preparar licitacion con Raul Ferrer',    null,                                                'meeting',  14,          now() + interval '11 days', null::timestamptz,          6, 'high',   now() - interval '8 days'),
    (29, 'Repasar la cuenta de Acme con Sergio',   null,                                                'meeting',  16,          now() - interval '2 days',  null::timestamptz,          3, 'normal', now() - interval '15 days'),
    (30, 'Enviar acta a Alicia Vega',              null,                                                'email',    17,          now() - interval '4 days',  now() - interval '4 days',  3, 'normal', now() - interval '10 days'),
    (31, 'Revision trimestral con Ivan Roldan',    null,                                                'meeting',   8,          now() + interval '20 days', null::timestamptz,          5, 'normal', now() - interval '1 day'),
    (32, 'Recordar la propuesta a Nuria Vidal',    null,                                                'follow-up', 5,          now() - interval '6 days',  null::timestamptz,          4, 'high',   now() - interval '18 days')
) as t(id, title, description, type, contact_id, due_date, done_date, owner, priority, created_at);
select setval(pg_get_serial_sequence('public.tasks', 'id'), 100, false);

-- Deal links. `is_primary` because these tasks hang off nothing else.
insert into public.task_links (task_id, entity_type, entity_id, is_primary, linked_by, entity_label, linked_at)
select l.task_id, 'deal', l.deal_id, true, t.created_by, d.name, t.created_at
from (values
    (1,1),(2,1),(3,2),(4,2),(5,3),(6,4),(7,4),(8,5),(9,5),(10,6),(11,6),
    (12,7),(13,8),(14,9),(15,9),(16,10),(17,11),(18,12),(19,13),(20,13),(21,14)
) as l(task_id, deal_id)
join public.tasks t on t.id = l.task_id
join public.deals d on d.id = l.deal_id;

--
-- 9. Stage history.
--
-- Written directly rather than through `move_deal_stage()`: the RPC enforces
-- the very rule this dataset is built to exercise, so seeding through it would
-- mean inventing a completed task for every hop just to get the fixture in.
--
-- `changed_at` for the LAST row of each deal is what the rule reads as "when it
-- entered its current stage".
--
insert into public.deal_stage_changes
    (deal_id, from_stage, to_stage, reason, sales_id, changed_at, override_reason)
values
    (1,  'opportunity',    'proposal-sent',  'Propuesta enviada tras la visita a planta.',            3, now() - interval '60 days', null),
    (1,  'proposal-sent',  'in-negociation', 'Aceptan el alcance, negociamos el descuento.',          3, now() - interval '20 days', null),
    (2,  'opportunity',    'proposal-sent',  'Enviada la propuesta de los tres almacenes.',           3, now() - interval '14 days', null),
    (4,  'opportunity',    'proposal-sent',  'Propuesta del portal presentada a direccion.',          4, now() - interval '90 days', null),
    (4,  'proposal-sent',  'in-negociation', 'Negociando plazos de entrega.',                         4, now() - interval '40 days', null),
    (4,  'in-negociation', 'won',            'Contrato firmado por el director financiero.',          4, now() - interval '8 days',  null),
    (5,  'opportunity',    'proposal-sent',  'Enviada la propuesta de soporte 24x7.',                 5, now() - interval '45 days', null),
    (5,  'proposal-sent',  'in-negociation', 'Piden ajustar el precio por clinica.',                  5, now() - interval '11 days', null),
    (6,  'opportunity',    'proposal-sent',  'Propuesta de rediseno enviada a marketing.',            5, now() - interval '18 days', null),
    (7,  'opportunity',    'proposal-sent',  'Propuesta de renovacion de licencias.',                 6, now() - interval '70 days', null),
    (7,  'proposal-sent',  'lost',           'Perdida frente a un competidor un 30% mas barato.',     6, now() - interval '25 days', null),
    (9,  'opportunity',    'in-negociation', 'Saltamos propuesta: reutilizan el contrato marco.',     3, now() - interval '6 days',  null),
    (10, 'opportunity',    'proposal-sent',  'Propuesta enviada antes del cierre de ejercicio.',      4, now() - interval '100 days',null),
    (10, 'proposal-sent',  'delayed',        'El cliente aplaza la decision al proximo ejercicio.',   4, now() - interval '35 days', null),
    (11, 'opportunity',    'proposal-sent',  'Propuesta de los veinte kioscos.',                      5, now() - interval '120 days',null),
    (11, 'proposal-sent',  'in-negociation', 'Negociando el calendario de instalacion.',              5, now() - interval '60 days', null),
    -- The one move that skipped the rule, and the record of who allowed it.
    (11, 'in-negociation', 'won',            'Pedido firmado en el congreso, sin tarea registrada.',  1, now() - interval '21 days',
         'Firma recogida en mano durante el congreso; la tarea de cierre se registra manana.'),
    (12, 'proposal-sent',  'opportunity',    'Vuelve a fase inicial: cambian el interlocutor tecnico.',6, now() - interval '12 days', null),
    (13, 'opportunity',    'proposal-sent',  'Cuadro de mando presentado a direccion.',               2, now() - interval '9 days',  null);

--
-- 10. Make the rule visible.
--
-- The migration seeds `enforced_from` at deploy time, which grandfathers every
-- deal already on the board -- correct in production, useless in a demo, where
-- it would mean no card is ever refused. Pushed back so the whole dataset is
-- governed.
--
update public.deal_stage_requirements
   set enforced_from = now() - interval '2 years';

--
-- 11. Notes, so the timelines are not empty.
--
insert into public.contact_notes (contact_id, text, date, sales_id, status) values
    (1,  'Confirma que la renovacion se decide en el comite del dia 15.', now() - interval '4 days',  3, 'hot'),
    (3,  'Quiere ver referencias de otro operador logistico.',            now() - interval '6 days',  3, 'hot'),
    (6,  'Firmado. Pide factura a nombre de la matriz.',                  now() - interval '2 days',  4, 'in-contract'),
    (8,  'Insiste en el tiempo de respuesta nocturno.',                   now() - interval '3 days',  5, 'hot'),
    (9,  'No hay presupuesto hasta el proximo ejercicio.',                now() - interval '35 days', 5, 'cold'),
    (12, 'Comunica que se van con otro proveedor.',                       now() - interval '30 days', 6, 'cold'),
    (13, 'Pide una prueba de concepto de dos semanas.',                   now() - interval '5 days',  6, 'warm');

insert into public.deal_notes (deal_id, text, type, date, sales_id) values
    (1,  'Comite del dia 15. Aprobado el alcance, falta el precio.', 'other', now() - interval '4 days',  3),
    (2,  'Sin respuesta desde el envio de la propuesta.',            'other', now() - interval '6 days',  3),
    (4,  'Cerrado. Arranque previsto para el mes que viene.',        'other', now() - interval '8 days',  4),
    (5,  'Piden bajar el precio un 8% por clinica.',                 'other', now() - interval '4 days',  5),
    (7,  'Perdido por precio. Revisar la politica de descuentos.',   'other', now() - interval '25 days', 6),
    (9,  'Legal revisa la fiscalidad de las filiales.',              'other', now() - interval '2 days',  3),
    (11, 'Instalacion piloto completada sin incidencias.',           'other', now() - interval '28 days', 5);

commit;

--
-- What the demo looks like from here.
--
select 'usuarios' as que, count(*)::text as cuantos from public.sales
union all select 'equipos',      count(*)::text from public.teams
union all select 'empresas',     count(*)::text from public.companies
union all select 'contactos',    count(*)::text from public.contacts
union all select 'leads',        count(*)::text from public.leads
union all select 'oportunidades',count(*)::text from public.deals
union all select 'tareas',       count(*)::text from public.tasks
union all select 'tareas hechas',count(*)::text from public.tasks where completed_at is not null
union all select 'cambios de etapa', count(*)::text from public.deal_stage_changes;
