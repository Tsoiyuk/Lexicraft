-- =====================================================================
-- LexiCraft 数据库结构 v1
-- 与「抱佛脚」共用同一个 Supabase 项目；所有对象以 lc_ 开头，互不干扰。
-- 在 Supabase 控制台 → SQL Editor 中整段执行。
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1. 表
-- ---------------------------------------------------------------------

-- 项目：闪卡（deck）或词典（dictionary）
create table public.lc_projects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('deck', 'dictionary')),
  name        text not null check (char_length(name) between 1 and 100),
  language    text,                       -- 学习语言 / 词典语言名称
  settings    jsonb not null default '{}', -- 翻面顺序、朗读语言、每日新词数、页面版式、字体等
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 邀请密钥只存哈希；此表不开放任何直接读写，只能通过下方函数访问
create table public.lc_project_secrets (
  project_id      uuid primary key references public.lc_projects(id) on delete cascade,
  key_hash        text not null,
  key_updated_at  timestamptz not null default now()
);

-- 成员
create table public.lc_project_members (
  project_id  uuid not null references public.lc_projects(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('owner', 'editor')),
  joined_at   timestamptz not null default now(),
  primary key (project_id, user_id)
);

-- 表格：闪卡项目有一张；词典项目可有多张（词汇表、字元表……）
create table public.lc_tables (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.lc_projects(id) on delete cascade,
  name        text not null,
  role        text not null default 'words' check (role in ('words', 'characters', 'other')),
  position    int  not null default 0,
  created_at  timestamptz not null default now()
);

-- 字段（= 表格的列）
create table public.lc_fields (
  id          uuid primary key default gen_random_uuid(),
  table_id    uuid not null references public.lc_tables(id) on delete cascade,
  project_id  uuid not null references public.lc_projects(id) on delete cascade, -- 由触发器自动填写
  key         text not null check (key ~ '^[a-z0-9_]{1,40}$'),                    -- 内部键名，entries.data 里的键
  label       text not null,                                                      -- 显示名称
  type        text not null check (type in (
                'short_text', 'long_text', 'select', 'multi_select',
                'number', 'entry_link', 'char_breakdown')),
  options     jsonb not null default '{}', -- 下拉选项、读法类型列表、页面位置等
  position    int  not null default 0,
  unique (table_id, key)
);

-- 词条（= 表格的行）
create table public.lc_entries (
  id          uuid primary key default gen_random_uuid(),
  table_id    uuid not null references public.lc_tables(id) on delete cascade,
  project_id  uuid not null references public.lc_projects(id) on delete cascade, -- 由触发器自动填写
  data        jsonb not null default '{}',
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 标签（颜色取预设色票的键名，如 'red'、'teal'）
create table public.lc_tags (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.lc_projects(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  color       text not null default 'gray',
  unique (project_id, name)
);

create table public.lc_entry_tags (
  entry_id    uuid not null references public.lc_entries(id) on delete cascade,
  tag_id      uuid not null references public.lc_tags(id) on delete cascade,
  project_id  uuid not null references public.lc_projects(id) on delete cascade, -- 由触发器自动填写
  primary key (entry_id, tag_id)
);

-- 读法模板：编写者为有规律的读法定义模板，规则存于 rule
create table public.lc_reading_templates (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.lc_projects(id) on delete cascade,
  name        text not null,
  rule        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

-- 复习进度：每个人各自一份
create table public.lc_reviews (
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_id       uuid not null references public.lc_entries(id) on delete cascade,
  project_id     uuid not null references public.lc_projects(id) on delete cascade, -- 由触发器自动填写
  due            timestamptz not null default now(),
  interval_days  int  not null default 0,
  ease           real not null default 2.5,
  reps           int  not null default 0,
  lapses         int  not null default 0,
  first_seen     timestamptz,
  last_review    timestamptz,
  primary key (user_id, entry_id)
);

create index on public.lc_project_members (user_id);
create index on public.lc_tables (project_id);
create index on public.lc_fields (table_id);
create index on public.lc_entries (table_id);
create index on public.lc_entries (project_id);
create index on public.lc_entry_tags (tag_id);
create index on public.lc_reviews (user_id, project_id, due);

-- ---------------------------------------------------------------------
-- 2. 辅助函数与触发器
-- ---------------------------------------------------------------------

create or replace function public.lc_is_member(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from lc_project_members where project_id = p and user_id = auth.uid());
$$;

create or replace function public.lc_is_owner(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from lc_projects where id = p and owner_id = auth.uid());
$$;

-- 新建项目时，自动把创建者加为 owner
create or replace function public.lc_after_project_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into lc_project_members (project_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end $$;
create trigger lc_projects_after_insert after insert on public.lc_projects
  for each row execute function public.lc_after_project_insert();

-- 禁止修改项目的创建者
create or replace function public.lc_protect_owner()
returns trigger language plpgsql as $$
begin
  if new.owner_id <> old.owner_id then raise exception 'owner_id cannot be changed'; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger lc_projects_before_update before update on public.lc_projects
  for each row execute function public.lc_protect_owner();

-- 根据所属表格 / 词条自动填写 project_id，保证数据不会挂错项目
create or replace function public.lc_fill_project_from_table()
returns trigger language plpgsql as $$
begin
  select project_id into new.project_id from public.lc_tables where id = new.table_id;
  if new.project_id is null then raise exception 'table not found'; end if;
  return new;
end $$;
create trigger lc_fields_fill before insert or update of table_id on public.lc_fields
  for each row execute function public.lc_fill_project_from_table();
create trigger lc_entries_fill before insert or update of table_id on public.lc_entries
  for each row execute function public.lc_fill_project_from_table();

create or replace function public.lc_fill_project_from_entry()
returns trigger language plpgsql as $$
begin
  select project_id into new.project_id from public.lc_entries where id = new.entry_id;
  if new.project_id is null then raise exception 'entry not found'; end if;
  return new;
end $$;
create trigger lc_reviews_fill before insert on public.lc_reviews
  for each row execute function public.lc_fill_project_from_entry();

create or replace function public.lc_fill_entry_tag()
returns trigger language plpgsql as $$
begin
  select project_id into new.project_id from public.lc_entries where id = new.entry_id;
  if not exists (select 1 from public.lc_tags where id = new.tag_id and project_id = new.project_id) then
    raise exception 'tag and entry belong to different projects';
  end if;
  return new;
end $$;
create trigger lc_entry_tags_fill before insert on public.lc_entry_tags
  for each row execute function public.lc_fill_entry_tag();

-- 词条修改时记录修改者与时间
create or replace function public.lc_touch_entry()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger lc_entries_touch before update on public.lc_entries
  for each row execute function public.lc_touch_entry();

-- ---------------------------------------------------------------------
-- 3. 行级权限（RLS）
-- ---------------------------------------------------------------------

alter table public.lc_projects          enable row level security;
alter table public.lc_project_secrets   enable row level security; -- 不建任何 policy = 完全禁止直接访问
alter table public.lc_project_members   enable row level security;
alter table public.lc_tables            enable row level security;
alter table public.lc_fields            enable row level security;
alter table public.lc_entries           enable row level security;
alter table public.lc_tags              enable row level security;
alter table public.lc_entry_tags        enable row level security;
alter table public.lc_reading_templates enable row level security;
alter table public.lc_reviews           enable row level security;

-- 项目：成员可读可改；只有创建者可删除
create policy "lc_projects_select" on public.lc_projects for select
  using (owner_id = auth.uid() or public.lc_is_member(id));
create policy "lc_projects_insert" on public.lc_projects for insert
  with check (owner_id = auth.uid());
create policy "lc_projects_update" on public.lc_projects for update
  using (public.lc_is_member(id)) with check (public.lc_is_member(id));
create policy "lc_projects_delete" on public.lc_projects for delete
  using (owner_id = auth.uid());

-- 成员：成员之间互相可见；创建者可移除编辑者；编辑者可自行退出
create policy "lc_members_select" on public.lc_project_members for select
  using (public.lc_is_member(project_id));
create policy "lc_members_delete" on public.lc_project_members for delete
  using (role = 'editor' and (public.lc_is_owner(project_id) or user_id = auth.uid()));
-- 加入只能通过 lc_join_project()，所以不开放 insert / update

-- 项目内容：所有成员都能增删改查
create policy "lc_tables_all" on public.lc_tables for all
  using (public.lc_is_member(project_id)) with check (public.lc_is_member(project_id));
create policy "lc_fields_all" on public.lc_fields for all
  using (public.lc_is_member(project_id)) with check (public.lc_is_member(project_id));
create policy "lc_entries_all" on public.lc_entries for all
  using (public.lc_is_member(project_id)) with check (public.lc_is_member(project_id));
create policy "lc_tags_all" on public.lc_tags for all
  using (public.lc_is_member(project_id)) with check (public.lc_is_member(project_id));
create policy "lc_entry_tags_all" on public.lc_entry_tags for all
  using (public.lc_is_member(project_id)) with check (public.lc_is_member(project_id));
create policy "lc_templates_all" on public.lc_reading_templates for all
  using (public.lc_is_member(project_id)) with check (public.lc_is_member(project_id));

-- 复习进度：只能看、改自己的
create policy "lc_reviews_own" on public.lc_reviews for all
  using (user_id = auth.uid() and public.lc_is_member(project_id))
  with check (user_id = auth.uid() and public.lc_is_member(project_id));

-- ---------------------------------------------------------------------
-- 4. 邀请密钥与成员管理（服务器端函数）
-- ---------------------------------------------------------------------

-- 生成或刷新密钥（仅创建者）。明文只在此刻返回一次，数据库只存哈希。
-- 格式如 K7QM-3XRP-W9TD：12 位，去掉易混淆的 0/O/1/I，约 60 位熵，无法暴力猜测。
create or replace function public.lc_rotate_join_key(p uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := gen_random_bytes(12);
  raw   text := '';
  i     int;
begin
  if not lc_is_owner(p) then raise exception 'only the project owner can change the key'; end if;
  for i in 0..11 loop
    raw := raw || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  insert into lc_project_secrets (project_id, key_hash, key_updated_at)
    values (p, crypt(raw, gen_salt('bf')), now())
  on conflict (project_id) do update set key_hash = excluded.key_hash, key_updated_at = now();
  return substr(raw, 1, 4) || '-' || substr(raw, 5, 4) || '-' || substr(raw, 9, 4);
end $$;

-- 凭链接中的项目 id + 密钥加入项目（需登录）。已是成员时直接返回 true。
-- 输入时大小写、空格和横线都会被忽略。
create or replace function public.lc_join_project(p uuid, join_key text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare
  h text;
  normalized text := upper(regexp_replace(coalesce(join_key, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if lc_is_member(p) then return true; end if;
  select key_hash into h from lc_project_secrets where project_id = p;
  if h is null or crypt(normalized, h) <> h then
    return false; -- 项目不存在和密钥错误返回同样的结果，不泄露项目是否存在
  end if;
  insert into lc_project_members (project_id, user_id, role)
    values (p, auth.uid(), 'editor') on conflict do nothing;
  return true;
end $$;

-- 列出成员（含邮箱，用于「移除成员」和显示「最后修改者」）
create or replace function public.lc_list_members(p uuid)
returns table (user_id uuid, email text, role text, joined_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.user_id, u.email::text, m.role, m.joined_at
  from lc_project_members m join auth.users u on u.id = m.user_id
  where m.project_id = p and lc_is_member(p)
  order by m.role desc, m.joined_at;
$$;

-- ---------------------------------------------------------------------
-- 5. 协作编辑辅助函数（以调用者身份执行，RLS 照常生效）
-- ---------------------------------------------------------------------

-- 只改某个词条的某一格，避免两人同时编辑时整行被覆盖
create or replace function public.lc_set_entry_field(e uuid, field_key text, value jsonb)
returns void language sql security invoker set search_path = public as $$
  update lc_entries
     set data = case when value is null or value = 'null'::jsonb
                     then data - field_key
                     else jsonb_set(data, array[field_key], value, true) end
   where id = e;
$$;

-- 删除一列时，顺便清掉所有词条里该列的内容
create or replace function public.lc_delete_field(f uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare t uuid; k text;
begin
  select table_id, key into t, k from lc_fields where id = f;
  if t is null then return; end if;
  update lc_entries set data = data - k where table_id = t and data ? k;
  delete from lc_fields where id = f;
end $$;

-- 函数权限：只开放给已登录用户
revoke all on function public.lc_rotate_join_key(uuid)                 from public, anon;
revoke all on function public.lc_join_project(uuid, text)              from public, anon;
revoke all on function public.lc_list_members(uuid)                    from public, anon;
revoke all on function public.lc_set_entry_field(uuid, text, jsonb)    from public, anon;
revoke all on function public.lc_delete_field(uuid)                    from public, anon;
grant execute on function public.lc_rotate_join_key(uuid)              to authenticated;
grant execute on function public.lc_join_project(uuid, text)           to authenticated;
grant execute on function public.lc_list_members(uuid)                 to authenticated;
grant execute on function public.lc_set_entry_field(uuid, text, jsonb) to authenticated;
grant execute on function public.lc_delete_field(uuid)                 to authenticated;

-- ---------------------------------------------------------------------
-- 6. 实时同步（多人同时编辑时画面即时更新；Realtime 同样遵守 RLS）
-- ---------------------------------------------------------------------

alter publication supabase_realtime add table
  public.lc_entries, public.lc_fields, public.lc_tables, public.lc_tags, public.lc_entry_tags;

-- ---------------------------------------------------------------------
-- 7. 自定义字体存储（私有，仅项目成员可读写；路径格式：<项目id>/<文件名>）
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lc-fonts', 'lc-fonts', false, 10485760,
        array['font/ttf', 'font/otf', 'font/woff', 'font/woff2', 'application/octet-stream'])
on conflict (id) do nothing;

-- 先把路径第一段解析成项目 id；解析失败（例如其他存储桶的文件）一律返回 false，不会报错
create or replace function public.lc_can_access_font(obj_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare p uuid;
begin
  begin
    p := split_part(obj_name, '/', 1)::uuid;
  exception when others then
    return false;
  end;
  return lc_is_member(p);
end $$;

create policy "lc_fonts_select" on storage.objects for select to authenticated
  using (bucket_id = 'lc-fonts' and public.lc_can_access_font(name));
create policy "lc_fonts_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'lc-fonts' and public.lc_can_access_font(name));
create policy "lc_fonts_update" on storage.objects for update to authenticated
  using (bucket_id = 'lc-fonts' and public.lc_can_access_font(name))
  with check (bucket_id = 'lc-fonts' and public.lc_can_access_font(name));
create policy "lc_fonts_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'lc-fonts' and public.lc_can_access_font(name));
