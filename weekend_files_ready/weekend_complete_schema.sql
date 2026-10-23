-- =====================================================================
--  منصة Weekend — السيكما الموحّدة والمحصّنة بالكامل (الإصدار النهائي)
--  تعمل بأمان (Idempotent) دون مسح الحجوزات الحقيقية عند إعادة التشغيل
--  تشمل مجلد التخزين المستقل (weekend-media) للصور والفيديوهات ووصولات CliQ
-- =====================================================================

begin;

-- 1) تفعيل الامتداد اللازم لقيد منع تعارض الحجوزات (Exclusion Constraint)
create extension if not exists btree_gist;
drop trigger if exists trg_facilities_normalize on public.facilities;
drop function if exists public.trg_normalize_facility_fields();
drop function if exists public.normalize_youtube_embed(text);

-- =====================================================================
-- 2) دوال مساعدة أمنية: التحقق من الأدمن، استخراج IP، فحص الصور/الروابط
-- =====================================================================

-- أ) التحقق من هوية الأدمن عبر جدول auth.users مباشرة (يتطلب تأكيد الإيميل)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = auth.uid()
      and (
        lower(u.email) in ('bdabab90@gmail.com', 'admin@weekend.jo')
        or u.id = '6a9ba7fc-32a5-4a05-be3c-e49191383cbf'::uuid
      )
      and u.email_confirmed_at is not null
  );
$$;

-- حذف حساب الاختبار الذي أُنشئ أثناء التجارب السابقة
delete from auth.users where lower(email) = 'attacker.check99@gmail.com';

-- تأكيد حساب الأدمن المسجّل في Supabase Auth دون تخزين أي كلمة مرور نصية داخل ملف السيكما
update auth.users
set
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
where id = '6a9ba7fc-32a5-4a05-be3c-e49191383cbf'::uuid
   or lower(email) in ('bdabab90@gmail.com', 'admin@weekend.jo');

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ب) استخراج عنوان الـ IP الحقيقي للزائر من ترويسات الطلب في Supabase / Cloudflare
create or replace function public.get_request_ip()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_headers jsonb;
    v_ip      text;
begin
    begin
        v_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
    exception when others then
        v_headers := '{}'::jsonb;
    end;

    v_ip := btrim(coalesce(
        v_headers ->> 'cf-connecting-ip',
        split_part(v_headers ->> 'x-forwarded-for', ',', 1),
        v_headers ->> 'x-real-ip',
        'unknown'
    ));

    if v_ip = '' then
        return 'unknown';
    end if;
    return left(v_ip, 64);
end;
$$;

-- ج) فحص صورة وصل تحويل CliQ: يقبل رابط ملف الصورة في مجلد التخزين المستقل (weekend-media) أو صورة Base64 حقيقية كـ Fallback
create or replace function public.is_valid_image_data_uri(p_data text)
returns boolean
language plpgsql
immutable
as $$
declare
    v_b64  text;
    v_head bytea;
    v_trim text := btrim(coalesce(p_data, ''));
begin
    if v_trim = '' then
        return false;
    end if;

    -- 1) قبول رابط الصورة المرفوعة في مجلد التخزين المستقل (Supabase Storage Bucket: weekend-media)
    if v_trim ~* '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/weekend-media/[^\s<>"]+\.(jpg|jpeg|png|webp)(\?.*)?$' then
        return char_length(v_trim) <= 1000;
    end if;

    -- 2) أو فحص البصمة الثنائية الحقيقية (Magic Bytes) لصورة Base64 في حال استخدام الوضع الاحتياطي
    if octet_length(v_trim) < 200 or octet_length(v_trim) > 800000 then
        return false;
    end if;

    if v_trim !~ '^data:image/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$' then
        return false;
    end if;

    v_b64 := split_part(v_trim, ',', 2);
    if char_length(v_b64) < 120 then
        return false;
    end if;

    begin
        v_head := decode(substr(v_b64, 1, 24), 'base64');
    exception when others then
        return false;
    end;

    if (v_trim like 'data:image/jpeg;base64,%' or v_trim like 'data:image/jpg;base64,%') then
        return get_byte(v_head, 0) = 255
           and get_byte(v_head, 1) = 216
           and get_byte(v_head, 2) = 255;
    end if;

    if v_trim like 'data:image/png;base64,%' then
        return get_byte(v_head, 0) = 137
           and get_byte(v_head, 1) = 80
           and get_byte(v_head, 2) = 78
           and get_byte(v_head, 3) = 71;
    end if;

    if v_trim like 'data:image/webp;base64,%' then
        return substr(v_head, 1, 4) = '\x52494646'::bytea
           and substr(v_head, 9, 4) = '\x57454250'::bytea;
    end if;

    return false;
end;
$$;

-- د) التحقق من حقول مواقع الانطلاق والوصول: نص عادي أو رابط خرائط Google حصراً
create or replace function public.is_safe_location_text(p_loc text)
returns boolean
language plpgsql
immutable
as $$
declare
    v_clean text := btrim(coalesce(p_loc, ''));
begin
    if v_clean = '' then
        return true;
    end if;
    if char_length(v_clean) < 2 or char_length(v_clean) > 300 then
        return false;
    end if;
    if v_clean ~* '(https?://|www\.|[a-z0-9-]+\.(com|net|org|io|me|ly|gl)/)' then
        return v_clean ~ '^https://(www\.google\.com/maps|maps\.google\.com|maps\.app\.goo\.gl|goo\.gl/maps)[^\s<>"]*$';
    end if;
    return true;
end;
$$;

-- =====================================================================
-- 2.5) إنشاء مجلد التخزين المستقل (Supabase Storage Bucket: weekend-media)
--      لحفظ صور المنشآت، الفيديوهات، وصور تحويل CliQ بعيداً عن ملف الموقع
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'weekend-media',
    'weekend-media',
    true,
    52428800, -- 50 MB (يسمح برفع الفيديوهات والصور بجودة ممتازة)
    array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update set
    public = true,
    file_size_limit = 52428800,
    allowed_mime_types = array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'];

drop policy if exists "weekend_media_public_read" on storage.objects;
drop policy if exists "weekend_media_receipts_insert" on storage.objects;
drop policy if exists "weekend_media_admin_insert" on storage.objects;
drop policy if exists "weekend_media_admin_update" on storage.objects;
drop policy if exists "weekend_media_admin_delete" on storage.objects;

-- السماح للعامة بقراءة مجلد المنشآت (facilities) فقط، ومنع استعراض مجلد وصولات الزبائن (cliq-receipts) لغير الأدمن
create policy "weekend_media_public_read" on storage.objects
    for select using (
        bucket_id = 'weekend-media'
        and (
            (storage.foldername(name))[1] = 'facilities'
            or public.is_admin()
        )
    );

-- السماح للزوار برفع صور وصل تحويل CliQ فقط داخل مجلد cliq-receipts (صور حصراً وبحجم محدود لمنع رفع فيديوهات أو ملفات ضارة)
create policy "weekend_media_receipts_insert" on storage.objects
    for insert to anon, authenticated
    with check (
        bucket_id = 'weekend-media'
        and (storage.foldername(name))[1] = 'cliq-receipts'
        and array_length(storage.foldername(name), 1) = 1
        and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
        and coalesce((metadata->>'size')::bigint, 0) <= 2097152
    );

-- السماح للأدمن برفع وتعديل وحذف صور وفيديوهات المنشآت في جميع المجلدات
create policy "weekend_media_admin_insert" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'weekend-media' and public.is_admin());

create policy "weekend_media_admin_update" on storage.objects
    for update to authenticated
    using (bucket_id = 'weekend-media' and public.is_admin())
    with check (bucket_id = 'weekend-media' and public.is_admin());

create policy "weekend_media_admin_delete" on storage.objects
    for delete to authenticated
    using (bucket_id = 'weekend-media' and public.is_admin());

-- =====================================================================
-- 3) جدول المنشآت والخدمات (facilities)
-- =====================================================================
create table if not exists public.facilities (
    id                  bigint generated by default as identity primary key,
    category            text not null,
    name_ar             text not null,
    name_en             text,
    location_ar         text not null,
    location_en         text,
    price_day           numeric(10,2),
    price_night         numeric(10,2),
    price_full          numeric(10,2),
    hourly_rate         numeric(10,2),
    price_per_km        numeric(10,2),
    price_per_person    numeric(10,2),
    capacity            integer,
    specs_ar            text not null default '',
    specs_en            text,
    images              jsonb not null default '[]'::jsonb,
    video_url           text,
    lat                 double precision,
    lng                 double precision,
    cancel_policy_ar    text,
    cancel_policy_en    text,
    amenities           jsonb not null default '[]'::jsonb,
    seasons             jsonb not null default '["summer", "winter"]'::jsonb,
    rating              numeric(3,1) not null default 5.0,
    active              boolean not null default true,
    created_at          timestamptz not null default now()
);

alter table public.facilities
    add column if not exists seasons jsonb not null default '["summer", "winter"]'::jsonb,
    add column if not exists capacity integer,
    add column if not exists video_url text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'facilities'
      and column_name = 'id' and is_identity = 'NO'
  ) then
    alter table public.facilities alter column id add generated by default as identity;
  end if;
  perform setval(
    pg_get_serial_sequence('public.facilities', 'id'),
    coalesce((select max(id) from public.facilities), 0) + 1,
    false
  );
end $$;

update public.facilities
set
    name_ar = coalesce(nullif(btrim(name_ar), ''), 'منشأة بدون اسم'),
    location_ar = coalesce(nullif(btrim(location_ar), ''), 'الأردن'),
    specs_ar = coalesce(specs_ar, ''),
    images = case when images is null or jsonb_typeof(images) <> 'array' then '[]'::jsonb else images end,
    amenities = case when amenities is null or jsonb_typeof(amenities) <> 'array' then '[]'::jsonb else amenities end,
    seasons = case when seasons is null or jsonb_typeof(seasons) <> 'array' or jsonb_array_length(seasons) = 0 then '["summer", "winter"]'::jsonb else seasons end,
    capacity = case when category = 'transport' and (capacity is null or capacity < 1) then 23 else capacity end,
    video_url = nullif(btrim(coalesce(video_url, '')), ''),
    rating = least(5.0, greatest(1.0, coalesce(rating, 5.0))),
    active = coalesce(active, true);

alter table public.facilities
    alter column name_ar set not null,
    alter column location_ar set not null,
    alter column specs_ar set not null,
    alter column images set not null,
    alter column amenities set not null,
    alter column seasons set not null,
    alter column rating set not null,
    alter column active set not null;

alter table public.facilities
    drop constraint if exists facilities_category_check,
    drop constraint if exists facilities_text_lengths_check,
    drop constraint if exists facilities_prices_check,
    drop constraint if exists facilities_coords_check,
    drop constraint if exists facilities_json_types_check,
    drop constraint if exists facilities_video_check,
    drop constraint if exists facilities_rating_check;

alter table public.facilities
    add constraint facilities_category_check check (category in ('farm', 'field', 'transport')),
    add constraint facilities_text_lengths_check check (
        char_length(btrim(name_ar)) between 2 and 120
        and (name_en is null or char_length(name_en) <= 120)
        and char_length(btrim(location_ar)) between 2 and 160
        and (location_en is null or char_length(location_en) <= 160)
        and char_length(specs_ar) <= 2500
        and (specs_en is null or char_length(specs_en) <= 2500)
        and (cancel_policy_ar is null or char_length(cancel_policy_ar) <= 1200)
        and (cancel_policy_en is null or char_length(cancel_policy_en) <= 1200)
        and (video_url is null or (char_length(video_url) <= 1000 and video_url ~* '^https://[^\s<>"]+$'))
    ),
    add constraint facilities_prices_check check (
        (price_day is null or (price_day > 0 and price_day <= 10000))
        and (price_night is null or (price_night > 0 and price_night <= 10000))
        and (price_full is null or (price_full > 0 and price_full <= 20000))
        and (hourly_rate is null or (hourly_rate > 0 and hourly_rate <= 1000))
        and (price_per_km is null or (price_per_km >= 0 and price_per_km <= 500))
        and (price_per_person is null or (price_per_person >= 0 and price_per_person <= 500))
        and (capacity is null or (capacity between 1 and 200))
    ),
    add constraint facilities_coords_check check (
        (lat is null or (lat between -90 and 90))
        and (lng is null or (lng between -180 and 180))
    ),
    add constraint facilities_json_types_check check (
        jsonb_typeof(images) = 'array'
        and jsonb_typeof(amenities) = 'array'
        and jsonb_typeof(seasons) = 'array'
        and jsonb_array_length(seasons) >= 1
    ),
    add constraint facilities_rating_check check (rating between 1.0 and 5.0);

-- =====================================================================
-- 4) جدول التقييمات (reviews) — مراجعة الأدمن + حماية من الإغراق (Rate Limit)
-- =====================================================================
create table if not exists public.reviews (
    id              bigint generated always as identity primary key,
    facility_id     bigint not null references public.facilities(id) on delete cascade,
    user_name       text not null,
    rating          numeric(2,1) not null,
    comment         text not null,
    status          text not null default 'pending',
    client_ip       text,
    created_at      timestamptz not null default now()
);

alter table public.reviews
    add column if not exists status text not null default 'approved',
    add column if not exists client_ip text;

alter table public.reviews
    alter column status set default 'pending';

delete from public.reviews
where facility_id is null
   or user_name is null or char_length(btrim(user_name)) < 2 or char_length(btrim(user_name)) > 80
   or comment is null or char_length(btrim(comment)) < 2 or char_length(btrim(comment)) > 1000
   or rating is null or rating < 1 or rating > 5;

update public.reviews
set status = 'approved'
where status not in ('pending', 'approved', 'rejected');

alter table public.reviews
    alter column facility_id set not null,
    alter column user_name set not null,
    alter column rating set not null,
    alter column comment set not null,
    alter column status set not null;

alter table public.reviews
    drop constraint if exists reviews_valid_check;

alter table public.reviews
    add constraint reviews_valid_check check (
        char_length(btrim(user_name)) between 2 and 80
        and char_length(btrim(comment)) between 2 and 1000
        and rating between 1.0 and 5.0
        and status in ('pending', 'approved', 'rejected')
    );

create or replace function public.sync_facility_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_target_id bigint := coalesce(new.facility_id, old.facility_id);
begin
    update public.facilities
    set rating = coalesce(
        (
            select round(avg(r.rating)::numeric, 1)
            from public.reviews r
            where r.facility_id = v_target_id
              and r.status = 'approved'
        ),
        5.0
    )
    where id = v_target_id;
    return null;
end;
$$;

drop trigger if exists trg_sync_facility_rating on public.reviews;
create trigger trg_sync_facility_rating
after insert or update or delete on public.reviews
for each row execute function public.sync_facility_rating();

create or replace function public.submit_review(
    p_facility_id bigint,
    p_user_name   text,
    p_rating      numeric,
    p_comment     text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_ip          text := public.get_request_ip();
    v_clean_name  text := btrim(coalesce(p_user_name, ''));
    v_clean_comm  text := btrim(coalesce(p_comment, ''));
    v_recent_cnt  integer;
    v_new_id      bigint;
begin
    if not exists (select 1 from public.facilities where id = p_facility_id and active = true) then
        raise exception 'المنشأة غير موجودة أو غير متاحة.';
    end if;

    if char_length(v_clean_name) < 2 or char_length(v_clean_name) > 80 then
        raise exception 'يرجى إدخال اسم صحيح (2 إلى 80 حرفاً).';
    end if;

    if char_length(v_clean_comm) < 2 or char_length(v_clean_comm) > 1000 then
        raise exception 'يرجى كتابة تعليق بين 2 و1000 حرف.';
    end if;

    if p_rating is null or p_rating < 1 or p_rating > 5 then
        raise exception 'التقييم يجب أن يكون بين 1 و5 نجوم.';
    end if;

    if v_ip <> 'unknown' then
        if exists (
            select 1 from public.reviews
            where facility_id = p_facility_id
              and client_ip = v_ip
              and created_at > now() - interval '24 hours'
        ) then
            raise exception 'لقد أرسلت تقييماً لهذه المنشأة مؤخراً. شكراً لمشاركتك!';
        end if;

        select count(*) into v_recent_cnt
        from public.reviews
        where client_ip = v_ip
          and created_at > now() - interval '24 hours';

        if v_recent_cnt >= 3 then
            raise exception 'تم تجاوز الحد اليومي المسموح لإرسال التقييمات.';
        end if;
    end if;

    insert into public.reviews (facility_id, user_name, rating, comment, status, client_ip)
    values (p_facility_id, v_clean_name, round(p_rating, 1), v_clean_comm, 'pending', v_ip)
    returning id into v_new_id;

    return jsonb_build_object(
        'id', v_new_id,
        'status', 'pending'
    );
end;
$$;

grant execute on function public.submit_review(bigint, text, numeric, text) to anon, authenticated;

-- =====================================================================
-- 5) جدول الحجوزات (bookings)
-- =====================================================================
create table if not exists public.bookings (
    id                  bigint generated by default as identity primary key,
    facility_id         bigint not null references public.facilities(id) on delete restrict,
    item_name_ar        text not null,
    item_name_en        text,
    client_name         text not null,
    phone               text not null,
    booking_date        date not null,
    hour_from           smallint not null,
    hour_to             smallint not null,
    shift_type          text,
    passengers          smallint,
    distance_km         numeric(7,2),
    is_round_trip       boolean not null default false,
    pickup_location     text,
    dropoff_location    text,
    details             text not null,
    total               numeric(10,2) not null,
    deposit             numeric(10,2) not null,
    receipt_data        text not null,
    status              text not null default 'pending',
    client_ip           text,
    created_at          timestamptz not null default now()
);

alter table public.bookings
    add column if not exists booking_date date,
    add column if not exists hour_from smallint,
    add column if not exists hour_to smallint,
    add column if not exists shift_type text,
    add column if not exists passengers smallint,
    add column if not exists distance_km numeric(7,2),
    add column if not exists is_round_trip boolean not null default false,
    add column if not exists client_ip text;

delete from public.bookings
where facility_id is null
   or item_name_ar is null or char_length(btrim(item_name_ar)) < 1
   or client_name is null or char_length(btrim(client_name)) < 2
   or phone is null or regexp_replace(btrim(phone), '[\s\-()]', '', 'g') !~ '^\+?[0-9]{7,15}$'
   or booking_date is null
   or hour_from is null or hour_to is null
   or hour_from < 0 or hour_from >= 24 or hour_to <= 0 or hour_to > 24 or hour_to <= hour_from
   or details is null or char_length(btrim(details)) < 3
   or total is null or deposit is null or total <= 0 or total > 100000 or deposit <= 0 or deposit > total
   or not public.is_valid_image_data_uri(receipt_data)
   or not public.is_safe_location_text(pickup_location)
   or not public.is_safe_location_text(dropoff_location);

update public.bookings
set phone = regexp_replace(btrim(phone), '[\s\-()]', '', 'g')
where phone ~ '[\s\-()]';

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings'
      and column_name = 'id' and is_identity = 'NO'
  ) then
    alter table public.bookings alter column id add generated by default as identity;
  end if;
  perform setval(
    pg_get_serial_sequence('public.bookings', 'id'),
    coalesce((select max(id) from public.bookings), 0) + 1,
    false
  );
end $$;

alter table public.bookings
    drop constraint if exists bookings_facility_id_fkey;

alter table public.bookings
    add constraint bookings_facility_id_fkey
    foreign key (facility_id) references public.facilities(id) on delete restrict;

alter table public.bookings
    alter column facility_id set not null,
    alter column item_name_ar set not null,
    alter column client_name set not null,
    alter column phone set not null,
    alter column booking_date set not null,
    alter column hour_from set not null,
    alter column hour_to set not null,
    alter column details set not null,
    alter column total set not null,
    alter column deposit set not null,
    alter column receipt_data set not null,
    alter column status set not null;

drop index if exists public.unique_confirmed_booking_per_slot;

alter table public.bookings
    drop constraint if exists bookings_amounts_positive,
    drop constraint if exists bookings_status_check,
    drop constraint if exists bookings_hours_check,
    drop constraint if exists bookings_fields_check,
    drop constraint if exists bookings_no_overlap;

alter table public.bookings
    add constraint bookings_status_check check (status in ('pending', 'confirmed', 'rejected', 'expired')),
    add constraint bookings_hours_check check (
        hour_from >= 0
        and hour_from < 24
        and hour_to > 0
        and hour_to <= 24
        and hour_to > hour_from
        and (shift_type is null or shift_type in ('morning', 'evening', 'fullday'))
    ),
    add constraint bookings_amounts_positive check (
        total > 0
        and total <= 100000
        and deposit > 0
        and deposit <= total
    ),
    add constraint bookings_fields_check check (
        char_length(btrim(client_name)) between 2 and 100
        and char_length(btrim(item_name_ar)) between 1 and 150
        and (item_name_en is null or char_length(item_name_en) <= 150)
        and phone ~ '^\+?[0-9]{7,15}$'
        and char_length(btrim(details)) between 3 and 500
        and public.is_safe_location_text(pickup_location)
        and public.is_safe_location_text(dropoff_location)
        and (passengers is null or (passengers between 1 and 200))
        and (distance_km is null or (distance_km > 0 and distance_km <= 2000))
        and public.is_valid_image_data_uri(receipt_data)
    ),
    add constraint bookings_no_overlap exclude using gist (
        facility_id with =,
        booking_date with =,
        int4range(hour_from, hour_to, '[)') with &&
    ) where (status in ('pending', 'confirmed'));

-- =====================================================================
-- 6) جدول المفضلة (favorites)
-- =====================================================================
create table if not exists public.favorites (
    device_id       text not null,
    facility_id     bigint not null references public.facilities(id) on delete cascade,
    created_at      timestamptz not null default now(),
    primary key (device_id, facility_id)
);

delete from public.favorites where char_length(btrim(device_id)) < 5 or char_length(device_id) > 100;

alter table public.favorites
    drop constraint if exists favorites_device_id_check;

alter table public.favorites
    add constraint favorites_device_id_check check (char_length(btrim(device_id)) between 5 and 100);

-- =====================================================================
-- 7) الـ View العام للمواعيد المحجوزة
-- =====================================================================
drop view if exists public.public_confirmed_slots;

create view public.public_confirmed_slots as
select
    facility_id,
    booking_date,
    hour_from,
    hour_to,
    shift_type,
    status,
    details
from public.bookings
where booking_date >= ((current_timestamp at time zone 'Asia/Amman')::date - 1)
  and (
      status = 'confirmed'
      or (status = 'pending' and created_at > now() - interval '2 hours')
  );

-- فهارس الأداء العالي وتحمّل الضغط (High-Concurrency Performance Indexes)
create index if not exists idx_facilities_active_cat on public.facilities (active, category, id);
create index if not exists idx_reviews_facility_status on public.reviews (facility_id, status, id desc);
create index if not exists idx_reviews_ip_created on public.reviews (client_ip, created_at desc);
create index if not exists idx_bookings_slot_lookup on public.bookings (facility_id, booking_date, status);
create index if not exists idx_bookings_pending_created on public.bookings (created_at) where status = 'pending';
create index if not exists idx_bookings_pending_phone on public.bookings (phone) where status = 'pending';
create index if not exists idx_bookings_pending_ip on public.bookings (client_ip, created_at) where status = 'pending';

grant select on public.public_confirmed_slots to anon, authenticated;

-- =====================================================================
-- 8) الدالة المحمية لإنشاء الحجز من السيرفر (create_booking RPC)
-- =====================================================================
create or replace function public.create_booking(
    p_facility_id       bigint,
    p_client_name       text,
    p_phone             text,
    p_booking_date      date,
    p_receipt_data      text,
    p_shift_type        text default null,
    p_start_hour        integer default null,
    p_hours             integer default null,
    p_passengers        integer default null,
    p_distance_km       numeric default null,
    p_is_round_trip     boolean default false,
    p_pickup_location   text default null,
    p_dropoff_location  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_fac               public.facilities%rowtype;
    v_ip                text := public.get_request_ip();
    v_amman_now         timestamp := (current_timestamp at time zone 'Asia/Amman');
    v_today             date := v_amman_now::date;
    v_now_hour          integer := extract(hour from v_amman_now)::integer;
    v_clean_name        text;
    v_clean_phone       text;
    v_clean_pickup      text := null;
    v_clean_dropoff     text := null;
    v_hour_from         smallint;
    v_hour_to           smallint;
    v_shift             text := null;
    v_dow               integer;
    v_mult              numeric(4,2) := 1.00;
    v_base_price        numeric(10,2);
    v_total             numeric(10,2);
    v_deposit           numeric(10,2);
    v_details           text;
    v_start_label       text;
    v_pending_for_phone integer;
    v_pending_for_ip    integer;
    v_new_id            bigint;
begin
    update public.bookings
    set status = 'expired'
    where status = 'pending'
      and created_at <= now() - interval '2 hours';

    v_clean_name := btrim(coalesce(p_client_name, ''));
    if char_length(v_clean_name) < 2 or char_length(v_clean_name) > 100 then
        raise exception 'يرجى إدخال الاسم الكامل بشكل صحيح (2 إلى 100 حرف).';
    end if;

    v_clean_phone := regexp_replace(btrim(coalesce(p_phone, '')), '[\s\-()]', '', 'g');
    if v_clean_phone !~ '^\+?[0-9]{7,15}$' then
        raise exception 'يرجى إدخال رقم هاتف صحيح (7 إلى 15 رقماً).';
    end if;

    if p_booking_date is null then
        raise exception 'يرجى اختيار تاريخ الحجز.';
    end if;
    if p_booking_date < v_today then
        raise exception 'لا يمكن الحجز في تاريخ ماضٍ.';
    end if;
    if p_booking_date > (v_today + 365) then
        raise exception 'تاريخ الحجز يتجاوز الحد المسموح به (سنة واحدة).';
    end if;

    if not public.is_valid_image_data_uri(p_receipt_data) then
        raise exception 'ملف إيصال التحويل غير صالح. يرجى إرفاق صورة حقيقية (JPEG أو PNG أو WebP).';
    end if;

    select count(*) into v_pending_for_phone
    from public.bookings
    where phone = v_clean_phone and status = 'pending';

    if v_pending_for_phone >= 2 then
        raise exception 'لديك طلبا حجز قيد المراجعة حالياً. يرجى انتظار تأكيد الأدمن قبل إرسال طلبات إضافية.';
    end if;

    if v_ip <> 'unknown' then
        select count(*) into v_pending_for_ip
        from public.bookings
        where client_ip = v_ip
          and status = 'pending'
          and created_at > now() - interval '2 hours';

        if v_pending_for_ip >= 2 then
            raise exception 'يوجد طلبان قيد المراجعة من نفس الشبكة حالياً. يرجى الانتظار لحين مراجعتهما من الإدارة.';
        end if;
    end if;

    select * into v_fac
    from public.facilities
    where id = p_facility_id and active = true;

    if not found then
        raise exception 'هذه المنشأة غير متاحة للحجز حالياً.';
    end if;

    if v_fac.category = 'farm' then
        if p_shift_type not in ('morning', 'evening', 'fullday') then
            raise exception 'يرجى اختيار الشفت (صباحي / مسائي / يوم كامل).';
        end if;

        if p_booking_date = v_today then
            if p_shift_type in ('morning', 'fullday') and v_now_hour >= 11 then
                raise exception 'انتهى وقت حجز الشفت الصباحي أو اليوم الكامل لهذا اليوم، يرجى اختيار الشفت المسائي أو تاريخ الغد.';
            end if;
            if p_shift_type = 'evening' and v_now_hour >= 22 then
                raise exception 'انتهى وقت الحجز لهذا اليوم، يرجى اختيار تاريخ الغد.';
            end if;
        end if;

        v_shift := p_shift_type;
        v_hour_from := case when p_shift_type = 'evening' then 12 else 0 end;
        v_hour_to   := case when p_shift_type = 'morning' then 12 else 24 end;

        v_base_price := case p_shift_type
            when 'morning' then v_fac.price_day
            when 'evening' then v_fac.price_night
            when 'fullday' then v_fac.price_full
        end;

        if v_base_price is null or v_base_price <= 0 then
            raise exception 'سعر هذا الشفت غير محدد للمنشأة.';
        end if;

        v_dow := extract(dow from p_booking_date)::integer;
        if v_dow in (4, 5, 6) then
            v_mult := 1.15;
        end if;

        v_total   := round(v_base_price * v_mult, 2);
        v_deposit := round(v_total * 0.15, 2);
        v_details := to_char(p_booking_date, 'YYYY-MM-DD') || ' (' || p_shift_type || ')';

    elsif v_fac.category = 'field' then
        if p_start_hour is null or p_start_hour < 6 or p_start_hour > 22 then
            raise exception 'ساعة البدء للملعب يجب أن تكون بين 06:00 صباحاً و10:00 مساءً.';
        end if;
        if p_hours is null or p_hours < 2 or p_hours > 18 then
            raise exception 'الحد الأدنى لحجز الملعب ساعتان.';
        end if;
        if (p_start_hour + p_hours) > 24 then
            raise exception 'وقت الحجز لا يمكن أن يتجاوز منتصف الليل (12:00 ص) لنفس اليوم.';
        end if;
        if p_booking_date = v_today and p_start_hour <= v_now_hour then
            raise exception 'لا يمكن حجز ساعة مضت أو بدأت من اليوم الحالي.';
        end if;
        if v_fac.hourly_rate is null or v_fac.hourly_rate <= 0 then
            raise exception 'سعر الساعة لهذا الملعب غير محدد.';
        end if;

        v_hour_from := p_start_hour::smallint;
        v_hour_to   := (p_start_hour + p_hours)::smallint;
        v_total     := round(p_hours * v_fac.hourly_rate, 2);
        v_deposit   := least(5.00, v_total);

        v_start_label := case
            when p_start_hour < 12 then p_start_hour::text || ':00ص'
            when p_start_hour = 12 then '12:00ظ'
            else (p_start_hour - 12)::text || ':00م'
        end;
        v_details := to_char(p_booking_date, 'YYYY-MM-DD') || ' — ' || p_hours::text || ' ساعة بدءاً من ' || v_start_label || ' (' || p_hours::text || ' × ' || v_fac.hourly_rate::text || ' JOD)';

    elsif v_fac.category = 'transport' then
        if p_booking_date = v_today and v_now_hour >= 21 then
            raise exception 'انتهى وقت حجز رحلات النقل لهذا اليوم، يرجى اختيار تاريخ الغد.';
        end if;
        if p_passengers is null or p_passengers < 1 then
            raise exception 'يرجى تحديد عدد الركاب (راكب واحد على الأقل).';
        end if;
        if p_passengers > coalesce(v_fac.capacity, 23) then
            raise exception 'عدد الركاب يتجاوز السعة القصوى للحافلة (% راكب).', coalesce(v_fac.capacity, 23);
        end if;
        if p_distance_km is null or p_distance_km <= 0 or p_distance_km > 2000 then
            raise exception 'يرجى إدخال مسافة صحيحة بالكيلومتر (1 إلى 2000 كم).';
        end if;

        v_clean_pickup  := btrim(coalesce(p_pickup_location, ''));
        v_clean_dropoff := btrim(coalesce(p_dropoff_location, ''));
        if char_length(v_clean_pickup) < 2 or char_length(v_clean_pickup) > 300 then
            raise exception 'يرجى إدخال موقع الانطلاق بشكل صحيح.';
        end if;
        if char_length(v_clean_dropoff) < 2 or char_length(v_clean_dropoff) > 300 then
            raise exception 'يرجى إدخال موقع الوصول بشكل صحيح.';
        end if;
        if not public.is_safe_location_text(v_clean_pickup) or not public.is_safe_location_text(v_clean_dropoff) then
            raise exception 'الروابط المسموحة في حقول الموقع هي روابط خرائط Google فقط، أو اكتب اسم الموقع نصاً.';
        end if;

        v_hour_from := 0;
        v_hour_to   := 24;
        v_total     := round(
            (p_distance_km * coalesce(v_fac.price_per_km, 0) + p_passengers * coalesce(v_fac.price_per_person, 0))
            * (case when coalesce(p_is_round_trip, false) then 2 else 1 end),
            2
        );
        if v_total <= 0 then
            raise exception 'تعذر احتساب تكلفة الرحلة، يرجى التحقق من تسعير المركبة.';
        end if;
        v_deposit := round(v_total * 0.15, 2);
        v_details := to_char(p_booking_date, 'YYYY-MM-DD') || ' — ' || p_passengers::text || ' راكب، ' || round(p_distance_km, 1)::text || ' كم، ' || (case when coalesce(p_is_round_trip, false) then 'ذهاب وإياب' else 'ذهاب فقط' end);

    else
        raise exception 'نوع المنشأة غير معروف.';
    end if;

    insert into public.bookings (
        facility_id,
        item_name_ar,
        item_name_en,
        client_name,
        phone,
        booking_date,
        hour_from,
        hour_to,
        shift_type,
        passengers,
        distance_km,
        is_round_trip,
        pickup_location,
        dropoff_location,
        details,
        total,
        deposit,
        receipt_data,
        status,
        client_ip
    ) values (
        v_fac.id,
        v_fac.name_ar,
        coalesce(nullif(btrim(v_fac.name_en), ''), v_fac.name_ar),
        v_clean_name,
        v_clean_phone,
        p_booking_date,
        v_hour_from,
        v_hour_to,
        v_shift,
        case when v_fac.category = 'transport' then p_passengers::smallint else null end,
        case when v_fac.category = 'transport' then round(p_distance_km, 2) else null end,
        coalesce(p_is_round_trip, false),
        v_clean_pickup,
        v_clean_dropoff,
        v_details,
        v_total,
        v_deposit,
        btrim(p_receipt_data),
        'pending',
        v_ip
    )
    returning id into v_new_id;

    return jsonb_build_object(
        'id', v_new_id,
        'facility_id', v_fac.id,
        'booking_date', to_char(p_booking_date, 'YYYY-MM-DD'),
        'hour_from', v_hour_from,
        'hour_to', v_hour_to,
        'shift_type', v_shift,
        'details', v_details,
        'total', v_total,
        'deposit', v_deposit,
        'phone', v_clean_phone
    );
end;
$$;

grant execute on function public.create_booking(
    bigint, text, text, date, text, text, integer, integer, integer, numeric, boolean, text, text
) to anon, authenticated;

-- =====================================================================
-- 9) سياسات الحماية (RLS Policies) المشدّدة
-- =====================================================================
alter table public.facilities enable row level security;
alter table public.reviews    enable row level security;
alter table public.bookings   enable row level security;
alter table public.favorites  enable row level security;

drop policy if exists "facilities_select_all" on public.facilities;
drop policy if exists "facilities_admin_write" on public.facilities;
drop policy if exists "facilities_admin_update" on public.facilities;
drop policy if exists "facilities_admin_delete" on public.facilities;

create policy "facilities_select_all" on public.facilities
    for select using (active = true or public.is_admin());
create policy "facilities_admin_write" on public.facilities
    for insert to authenticated with check (public.is_admin());
create policy "facilities_admin_update" on public.facilities
    for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "facilities_admin_delete" on public.facilities
    for delete to authenticated using (public.is_admin());

drop policy if exists "reviews_select_all" on public.reviews;
drop policy if exists "reviews_public_insert" on public.reviews;
drop policy if exists "reviews_admin_update" on public.reviews;
drop policy if exists "reviews_admin_delete" on public.reviews;

create policy "reviews_select_all" on public.reviews
    for select using (status = 'approved' or public.is_admin());
create policy "reviews_admin_update" on public.reviews
    for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "reviews_admin_delete" on public.reviews
    for delete to authenticated using (public.is_admin());

-- منع الزوار العامين (anon) من قراءة عمود عنوان الشبكة (client_ip) في جدول التقييمات نهائياً حفاظاً على الخصوصية
revoke select (client_ip) on public.reviews from anon;

drop policy if exists "bookings_public_insert" on public.bookings;
drop policy if exists "bookings_admin_select" on public.bookings;
drop policy if exists "bookings_admin_update" on public.bookings;
drop policy if exists "bookings_admin_delete" on public.bookings;

create policy "bookings_admin_select" on public.bookings
    for select to authenticated using (public.is_admin());
create policy "bookings_admin_update" on public.bookings
    for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "bookings_admin_delete" on public.bookings
    for delete to authenticated using (public.is_admin());

drop policy if exists "favorites_select_all" on public.favorites;
drop policy if exists "favorites_public_insert" on public.favorites;
drop policy if exists "favorites_public_delete" on public.favorites;
drop policy if exists "favorites_admin_all" on public.favorites;

-- قفل الوصول المباشر لجدول المفضلة لغير الأدمن لمنع المسح الجماعي أو كشف معرفات أجهزة الزوار
create policy "favorites_admin_all" on public.favorites
    for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- دوال محمية (RPC) لإدارة مفضلة جهاز الزائر الواحد فقط بأمان
create or replace function public.get_my_favorites(p_device_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_dev text := btrim(coalesce(p_device_id, ''));
begin
    if char_length(v_dev) < 5 or char_length(v_dev) > 100 then
        return '[]'::jsonb;
    end if;
    return coalesce(
        (select jsonb_agg(f.facility_id) from public.favorites f where f.device_id = v_dev),
        '[]'::jsonb
    );
end;
$$;

create or replace function public.toggle_my_favorite(
    p_device_id   text,
    p_facility_id bigint,
    p_add         boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_dev text := btrim(coalesce(p_device_id, ''));
begin
    if char_length(v_dev) < 5 or char_length(v_dev) > 100 or p_facility_id is null then
        raise exception 'معرّف الجهاز أو المنشأة غير صالح.';
    end if;
    if coalesce(p_add, true) then
        insert into public.favorites (device_id, facility_id)
        values (v_dev, p_facility_id)
        on conflict (device_id, facility_id) do nothing;
    else
        delete from public.favorites
        where device_id = v_dev and facility_id = p_facility_id;
    end if;
    return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.get_my_favorites(text) to anon, authenticated;
grant execute on function public.toggle_my_favorite(text, bigint, boolean) to anon, authenticated;

-- =====================================================================
-- 10) نظام كوبونات الخصم والعروض المرن (promo_codes)
--     يدعم تحديد الأيام المسموحة، أكواد الأعياد، الإيقاف الفوري، والاستثناءات
-- =====================================================================
create table if not exists public.promo_codes (
    id                      bigint generated by default as identity primary key,
    code                    text not null unique,
    title_ar                text not null,
    discount_type           text not null default 'percent',
    discount_value          numeric(10,2) not null,
    allowed_days            jsonb not null default '[0,1,2,3,4,5,6]'::jsonb,
    valid_from              date,
    valid_until             date,
    excluded_dates          jsonb not null default '[]'::jsonb,
    excluded_facility_ids   jsonb not null default '[]'::jsonb,
    auto_apply              boolean not null default false,
    active                  boolean not null default true,
    created_at              timestamptz not null default now(),
    constraint promo_codes_type_check check (discount_type in ('percent', 'fixed')),
    constraint promo_codes_val_check check (
        (discount_type = 'percent' and discount_value > 0 and discount_value <= 90)
        or (discount_type = 'fixed' and discount_value > 0 and discount_value <= 5000)
    ),
    constraint promo_codes_json_check check (
        jsonb_typeof(allowed_days) = 'array'
        and jsonb_typeof(excluded_dates) = 'array'
        and jsonb_typeof(excluded_facility_ids) = 'array'
    )
);

alter table public.promo_codes enable row level security;

drop policy if exists "promo_codes_select_all" on public.promo_codes;
drop policy if exists "promo_codes_admin_insert" on public.promo_codes;
drop policy if exists "promo_codes_admin_update" on public.promo_codes;
drop policy if exists "promo_codes_admin_delete" on public.promo_codes;

create policy "promo_codes_select_all" on public.promo_codes
    for select using ((active = true and upper(code) <> '__TG_CFG__') or public.is_admin());
create policy "promo_codes_admin_insert" on public.promo_codes
    for insert to authenticated with check (public.is_admin());
create policy "promo_codes_admin_update" on public.promo_codes
    for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "promo_codes_admin_delete" on public.promo_codes
    for delete to authenticated using (public.is_admin());

-- إضافة أعمدة كود الخصم وقيمة الخصم في جدول الحجوزات
alter table public.bookings
    add column if not exists promo_code text,
    add column if not exists discount_amount numeric(10,2) not null default 0;

-- دالة مساعدة لحساب الخصم والتحقق من الكود والأيام المسموحة والاستثناءات
create or replace function public.calculate_promo_discount(
    p_facility_id   bigint,
    p_booking_date  date,
    p_subtotal      numeric,
    p_promo_code    text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_promo         public.promo_codes%rowtype;
    v_clean_code    text := upper(btrim(coalesce(p_promo_code, '')));
    v_dow           integer := extract(dow from p_booking_date)::integer;
    v_date_str      text := to_char(p_booking_date, 'YYYY-MM-DD');
    v_discount      numeric(10,2) := 0;
begin
    if p_subtotal is null or p_subtotal <= 0 or p_booking_date is null then
        return jsonb_build_object('discount', 0, 'code', null);
    end if;

    if v_clean_code <> '' then
        select * into v_promo
        from public.promo_codes
        where upper(code) = v_clean_code;

        if not found or v_promo.active = false then
            raise exception 'كود الخصم (%) غير صالح أو متوقف حالياً.', v_clean_code;
        end if;

        if v_promo.valid_from is not null and p_booking_date < v_promo.valid_from then
            raise exception 'كود الخصم (%) يبدأ تفعيله بتاريخ %.', v_clean_code, to_char(v_promo.valid_from, 'YYYY-MM-DD');
        end if;

        if v_promo.valid_until is not null and p_booking_date > v_promo.valid_until then
            raise exception 'انتهت صلاحية كود الخصم (%) بتاريخ %.', v_clean_code, to_char(v_promo.valid_until, 'YYYY-MM-DD');
        end if;

        if not (v_promo.allowed_days @> to_jsonb(v_dow)) then
            raise exception 'كود الخصم (%) غير مفعّل في هذا اليوم من الأسبوع.', v_clean_code;
        end if;

        if v_promo.excluded_dates @> to_jsonb(v_date_str) then
            raise exception 'التاريخ المختار (%) مستثنى من كود الخصم (%).', v_date_str, v_clean_code;
        end if;

        if v_promo.excluded_facility_ids @> to_jsonb(p_facility_id) then
            raise exception 'هذه المنشأة مستثناة من كود الخصم (%).', v_clean_code;
        end if;
    else
        -- البحث عن عرض خصم تلقائي (auto_apply) سارٍ لهذا اليوم وغير مستثنى
        select * into v_promo
        from public.promo_codes
        where active = true
          and auto_apply = true
          and (valid_from is null or p_booking_date >= valid_from)
          and (valid_until is null or p_booking_date <= valid_until)
          and (allowed_days @> to_jsonb(v_dow))
          and not (excluded_dates @> to_jsonb(v_date_str))
          and not (excluded_facility_ids @> to_jsonb(p_facility_id))
        order by discount_value desc, id desc
        limit 1;

        if not found then
            return jsonb_build_object('discount', 0, 'code', null);
        end if;
    end if;

    if v_promo.discount_type = 'percent' then
        v_discount := round(p_subtotal * (v_promo.discount_value / 100.0), 2);
    else
        v_discount := least(round(v_promo.discount_value, 2), greatest(0, p_subtotal - 1));
    end if;

    return jsonb_build_object(
        'discount', v_discount,
        'code', v_promo.code,
        'title_ar', v_promo.title_ar
    );
end;
$$;

grant execute on function public.calculate_promo_discount(bigint, date, numeric, text) to anon, authenticated;

-- تحديث دالة إنشاء الحجز لدعم كود الخصم والعروض اليومية والاستثناءات
drop function if exists public.create_booking(bigint, text, text, date, text, text, integer, integer, integer, numeric, boolean, text, text);

create or replace function public.create_booking(
    p_facility_id       bigint,
    p_client_name       text,
    p_phone             text,
    p_booking_date      date,
    p_receipt_data      text,
    p_shift_type        text default null,
    p_start_hour        integer default null,
    p_hours             integer default null,
    p_passengers        integer default null,
    p_distance_km       numeric default null,
    p_is_round_trip     boolean default false,
    p_pickup_location   text default null,
    p_dropoff_location  text default null,
    p_promo_code        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_fac               public.facilities%rowtype;
    v_ip                text := public.get_request_ip();
    v_amman_now         timestamp := (current_timestamp at time zone 'Asia/Amman');
    v_today             date := v_amman_now::date;
    v_now_hour          integer := extract(hour from v_amman_now)::integer;
    v_clean_name        text;
    v_clean_phone       text;
    v_clean_pickup      text := null;
    v_clean_dropoff     text := null;
    v_hour_from         smallint;
    v_hour_to           smallint;
    v_shift             text := null;
    v_dow               integer;
    v_mult              numeric(4,2) := 1.00;
    v_base_price        numeric(10,2);
    v_subtotal          numeric(10,2);
    v_promo_res         jsonb;
    v_discount          numeric(10,2) := 0;
    v_applied_code      text := null;
    v_total             numeric(10,2);
    v_deposit           numeric(10,2);
    v_details           text;
    v_start_label       text;
    v_pending_for_phone integer;
    v_pending_for_ip    integer;
    v_new_id            bigint;
begin
    update public.bookings
    set status = 'expired'
    where status = 'pending'
      and created_at <= now() - interval '2 hours';

    v_clean_name := btrim(coalesce(p_client_name, ''));
    if char_length(v_clean_name) < 2 or char_length(v_clean_name) > 100 then
        raise exception 'يرجى إدخال الاسم الكامل بشكل صحيح (2 إلى 100 حرف).';
    end if;

    v_clean_phone := regexp_replace(btrim(coalesce(p_phone, '')), '[\s\-()]', '', 'g');
    if v_clean_phone !~ '^\+?[0-9]{7,15}$' then
        raise exception 'يرجى إدخال رقم هاتف صحيح (7 إلى 15 رقماً).';
    end if;

    if p_booking_date is null then
        raise exception 'يرجى اختيار تاريخ الحجز.';
    end if;
    if p_booking_date < v_today then
        raise exception 'لا يمكن الحجز في تاريخ ماضٍ.';
    end if;
    if p_booking_date > (v_today + 365) then
        raise exception 'تاريخ الحجز يتجاوز الحد المسموح به (سنة واحدة).';
    end if;

    if not public.is_valid_image_data_uri(p_receipt_data) then
        raise exception 'ملف إيصال التحويل غير صالح. يرجى إرفاق صورة حقيقية (JPEG أو PNG أو WebP).';
    end if;

    select count(*) into v_pending_for_phone
    from public.bookings
    where phone = v_clean_phone and status = 'pending';

    if v_pending_for_phone >= 2 then
        raise exception 'لديك طلبا حجز قيد المراجعة حالياً. يرجى انتظار تأكيد الأدمن قبل إرسال طلبات إضافية.';
    end if;

    if v_ip <> 'unknown' then
        select count(*) into v_pending_for_ip
        from public.bookings
        where client_ip = v_ip
          and status = 'pending'
          and created_at > now() - interval '2 hours';

        if v_pending_for_ip >= 2 then
            raise exception 'يوجد طلبان قيد المراجعة من نفس الشبكة حالياً. يرجى الانتظار لحين مراجعتهما من الإدارة.';
        end if;
    end if;

    select * into v_fac
    from public.facilities
    where id = p_facility_id and active = true;

    if not found then
        raise exception 'هذه المنشأة غير متاحة للحجز حالياً.';
    end if;

    if v_fac.category = 'farm' then
        if p_shift_type not in ('morning', 'evening', 'fullday') then
            raise exception 'يرجى اختيار الشفت (صباحي / مسائي / يوم كامل).';
        end if;

        if p_booking_date = v_today then
            if p_shift_type in ('morning', 'fullday') and v_now_hour >= 11 then
                raise exception 'انتهى وقت حجز الشفت الصباحي أو اليوم الكامل لهذا اليوم، يرجى اختيار الشفت المسائي أو تاريخ الغد.';
            end if;
            if p_shift_type = 'evening' and v_now_hour >= 22 then
                raise exception 'انتهى وقت الحجز لهذا اليوم، يرجى اختيار تاريخ الغد.';
            end if;
        end if;

        v_shift := p_shift_type;
        v_hour_from := case when p_shift_type = 'evening' then 12 else 0 end;
        v_hour_to   := case when p_shift_type = 'morning' then 12 else 24 end;

        v_base_price := case p_shift_type
            when 'morning' then v_fac.price_day
            when 'evening' then v_fac.price_night
            when 'fullday' then v_fac.price_full
        end;

        if v_base_price is null or v_base_price <= 0 then
            raise exception 'سعر هذا الشفت غير محدد للمنشأة.';
        end if;

        v_dow := extract(dow from p_booking_date)::integer;
        if v_dow in (4, 5, 6) then
            v_mult := 1.15;
        end if;

        v_subtotal := round(v_base_price * v_mult, 2);
        v_promo_res := public.calculate_promo_discount(v_fac.id, p_booking_date, v_subtotal, p_promo_code);
        v_discount := coalesce((v_promo_res ->> 'discount')::numeric, 0);
        v_applied_code := v_promo_res ->> 'code';
        v_total   := greatest(1.00, round(v_subtotal - v_discount, 2));
        v_deposit := round(v_total * 0.15, 2);
        v_details := to_char(p_booking_date, 'YYYY-MM-DD') || ' (' || p_shift_type || ')'
                     || case when v_applied_code is not null then ' [خصم ' || v_applied_code || ': -' || v_discount::text || ' JOD]' else '' end;

    elsif v_fac.category = 'field' then
        if p_start_hour is null or p_start_hour < 6 or p_start_hour > 22 then
            raise exception 'ساعة البدء للملعب يجب أن تكون بين 06:00 صباحاً و10:00 مساءً.';
        end if;
        if p_hours is null or p_hours < 2 or p_hours > 18 then
            raise exception 'الحد الأدنى لحجز الملعب ساعتان.';
        end if;
        if (p_start_hour + p_hours) > 24 then
            raise exception 'وقت الحجز لا يمكن أن يتجاوز منتصف الليل (12:00 ص) لنفس اليوم.';
        end if;
        if p_booking_date = v_today and p_start_hour <= v_now_hour then
            raise exception 'لا يمكن حجز ساعة مضت أو بدأت من اليوم الحالي.';
        end if;
        if v_fac.hourly_rate is null or v_fac.hourly_rate <= 0 then
            raise exception 'سعر الساعة لهذا الملعب غير محدد.';
        end if;

        v_hour_from := p_start_hour::smallint;
        v_hour_to   := (p_start_hour + p_hours)::smallint;
        v_subtotal  := round(p_hours * v_fac.hourly_rate, 2);
        v_promo_res := public.calculate_promo_discount(v_fac.id, p_booking_date, v_subtotal, p_promo_code);
        v_discount  := coalesce((v_promo_res ->> 'discount')::numeric, 0);
        v_applied_code := v_promo_res ->> 'code';
        v_total     := greatest(1.00, round(v_subtotal - v_discount, 2));
        v_deposit   := least(5.00, v_total);

        v_start_label := case
            when p_start_hour < 12 then p_start_hour::text || ':00ص'
            when p_start_hour = 12 then '12:00ظ'
            else (p_start_hour - 12)::text || ':00م'
        end;
        v_details := to_char(p_booking_date, 'YYYY-MM-DD') || ' — ' || p_hours::text || ' ساعة بدءاً من ' || v_start_label || ' (' || p_hours::text || ' × ' || v_fac.hourly_rate::text || ' JOD)'
                     || case when v_applied_code is not null then ' [خصم ' || v_applied_code || ': -' || v_discount::text || ' JOD]' else '' end;

    elsif v_fac.category = 'transport' then
        if p_booking_date = v_today and v_now_hour >= 21 then
            raise exception 'انتهى وقت حجز رحلات النقل لهذا اليوم، يرجى اختيار تاريخ الغد.';
        end if;
        if p_passengers is null or p_passengers < 1 then
            raise exception 'يرجى تحديد عدد الركاب (راكب واحد على الأقل).';
        end if;
        if p_passengers > coalesce(v_fac.capacity, 23) then
            raise exception 'عدد الركاب يتجاوز السعة القصوى للحافلة (% راكب).', coalesce(v_fac.capacity, 23);
        end if;
        if p_distance_km is null or p_distance_km <= 0 or p_distance_km > 2000 then
            raise exception 'يرجى إدخال مسافة صحيحة بالكيلومتر (1 إلى 2000 كم).';
        end if;

        v_clean_pickup  := btrim(coalesce(p_pickup_location, ''));
        v_clean_dropoff := btrim(coalesce(p_dropoff_location, ''));
        if char_length(v_clean_pickup) < 2 or char_length(v_clean_pickup) > 300 then
            raise exception 'يرجى إدخال موقع الانطلاق بشكل صحيح.';
        end if;
        if char_length(v_clean_dropoff) < 2 or char_length(v_clean_dropoff) > 300 then
            raise exception 'يرجى إدخال موقع الوصول بشكل صحيح.';
        end if;
        if not public.is_safe_location_text(v_clean_pickup) or not public.is_safe_location_text(v_clean_dropoff) then
            raise exception 'الروابط المسموحة في حقول الموقع هي روابط خرائط Google فقط، أو اكتب اسم الموقع نصاً.';
        end if;

        v_hour_from := 0;
        v_hour_to   := 24;
        v_subtotal  := round(
            (p_distance_km * coalesce(v_fac.price_per_km, 0) + p_passengers * coalesce(v_fac.price_per_person, 0))
            * (case when coalesce(p_is_round_trip, false) then 2 else 1 end),
            2
        );
        if v_subtotal <= 0 then
            raise exception 'تعذر احتساب تكلفة الرحلة، يرجى التحقق من تسعير المركبة.';
        end if;
        v_promo_res := public.calculate_promo_discount(v_fac.id, p_booking_date, v_subtotal, p_promo_code);
        v_discount  := coalesce((v_promo_res ->> 'discount')::numeric, 0);
        v_applied_code := v_promo_res ->> 'code';
        v_total     := greatest(1.00, round(v_subtotal - v_discount, 2));
        v_deposit   := round(v_total * 0.15, 2);
        v_details   := to_char(p_booking_date, 'YYYY-MM-DD') || ' — ' || p_passengers::text || ' راكب، ' || round(p_distance_km, 1)::text || ' كم، ' || (case when coalesce(p_is_round_trip, false) then 'ذهاب وإياب' else 'ذهاب فقط' end)
                       || case when v_applied_code is not null then ' [خصم ' || v_applied_code || ': -' || v_discount::text || ' JOD]' else '' end;

    else
        raise exception 'نوع المنشأة غير معروف.';
    end if;

    insert into public.bookings (
        facility_id,
        item_name_ar,
        item_name_en,
        client_name,
        phone,
        booking_date,
        hour_from,
        hour_to,
        shift_type,
        passengers,
        distance_km,
        is_round_trip,
        pickup_location,
        dropoff_location,
        details,
        total,
        deposit,
        promo_code,
        discount_amount,
        receipt_data,
        status,
        client_ip
    ) values (
        v_fac.id,
        v_fac.name_ar,
        coalesce(nullif(btrim(v_fac.name_en), ''), v_fac.name_ar),
        v_clean_name,
        v_clean_phone,
        p_booking_date,
        v_hour_from,
        v_hour_to,
        v_shift,
        case when v_fac.category = 'transport' then p_passengers::smallint else null end,
        case when v_fac.category = 'transport' then round(p_distance_km, 2) else null end,
        coalesce(p_is_round_trip, false),
        v_clean_pickup,
        v_clean_dropoff,
        v_details,
        v_total,
        v_deposit,
        v_applied_code,
        v_discount,
        btrim(p_receipt_data),
        'pending',
        v_ip
    )
    returning id into v_new_id;

    return jsonb_build_object(
        'id', v_new_id,
        'facility_id', v_fac.id,
        'booking_date', to_char(p_booking_date, 'YYYY-MM-DD'),
        'hour_from', v_hour_from,
        'hour_to', v_hour_to,
        'shift_type', v_shift,
        'details', v_details,
        'subtotal', v_subtotal,
        'discount_amount', v_discount,
        'promo_code', v_applied_code,
        'total', v_total,
        'deposit', v_deposit,
        'phone', v_clean_phone
    );
end;
$$;

grant execute on function public.create_booking(
    bigint, text, text, date, text, text, integer, integer, integer, numeric, boolean, text, text, text
) to anon, authenticated;

-- =====================================================================
-- 11) دالة تتبّع الحجز الآمنة للزبون (track_my_bookings RPC)
--     تعيد بيانات التذكرة وحالة الحجز فقط عند مطابقة رقم الهاتف دون كشف الوصل أو IP
-- =====================================================================
create or replace function public.track_my_bookings(
    p_phone         text,
    p_booking_id    bigint default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_clean_phone text := regexp_replace(btrim(coalesce(p_phone, '')), '[\s\-()]', '', 'g');
    v_amman_now   timestamp := (current_timestamp at time zone 'Asia/Amman');
    v_today       date := v_amman_now::date;
    v_now_hour    integer := extract(hour from v_amman_now)::integer;
    v_rows        jsonb;
begin
    if v_clean_phone !~ '^\+?[0-9]{7,15}$' then
        raise exception 'يرجى إدخال رقم هاتف صحيح للاستعلام عن الحجز.';
    end if;

    -- حماية خصوصية الزبائن: يشترط إدخال رقم التذكرة مع رقم الهاتف لغير الأدمن لمنع تخمين أرقام الهواتف
    if (p_booking_id is null or p_booking_id <= 0) and not public.is_admin() then
        raise exception 'يرجى إدخال رقم التذكرة (مثال: 15 أو WKND-15) مع رقم الهاتف للتحقق الآمن.';
    end if;

    -- إعادة التذاكر الفعالة فقط (التي لم يُحذف حجزها ولم ينتهِ موعدها الزمني بتوقيت الأردن)
    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    into v_rows
    from (
        select
            b.id,
            b.facility_id,
            b.item_name_ar,
            b.item_name_en,
            b.client_name,
            b.phone,
            to_char(b.booking_date, 'YYYY-MM-DD') as booking_date,
            b.hour_from,
            b.hour_to,
            b.shift_type,
            b.details,
            b.total,
            b.deposit,
            b.promo_code,
            b.discount_amount,
            b.pickup_location,
            b.dropoff_location,
            b.status,
            b.created_at,
            f.location_ar,
            f.location_en,
            f.lat,
            f.lng
        from public.bookings b
        left join public.facilities f on f.id = b.facility_id
        where (
            b.phone = v_clean_phone
            or right(regexp_replace(b.phone, '[^0-9]', '', 'g'), 9) = right(regexp_replace(v_clean_phone, '[^0-9]', '', 'g'), 9)
        )
          and (p_booking_id is null or b.id = p_booking_id)
          and b.status in ('pending', 'confirmed')
          and (
              b.booking_date > v_today
              or (b.booking_date = v_today and coalesce(b.hour_to, 24) > v_now_hour)
          )
        order by b.id desc
        limit 5
    ) t;

    return v_rows;
end;
$$;

grant execute on function public.track_my_bookings(text, bigint) to anon, authenticated;

-- السماح للأدمن بإدراج قفل تاريخ مباشر في جدول الحجوزات
drop policy if exists "bookings_admin_insert" on public.bookings;
create policy "bookings_admin_insert" on public.bookings
    for insert to authenticated with check (public.is_admin());

-- =====================================================================
-- 12) دالة قفل التواريخ السريع للأدمن (admin_block_slot RPC)
--     تتيح للأدمن قفل أي يوم أو شفت أو ساعات ملعب فوراً لحجز خارجي أو صيانة
-- =====================================================================
create or replace function public.admin_block_slot(
    p_facility_id   bigint,
    p_booking_date  date,
    p_shift_type    text default 'fullday',
    p_start_hour    integer default null,
    p_hours         integer default null,
    p_note          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_fac       public.facilities%rowtype;
    v_h_from    smallint := 0;
    v_h_to      smallint := 24;
    v_shift     text := null;
    v_note      text := btrim(coalesce(p_note, ''));
    v_details   text;
    v_new_id    bigint;
begin
    if not public.is_admin() then
        raise exception 'غير مصرح لك بتنفيذ هذا الإجراء (صلاحيات الإدارة فقط).';
    end if;

    select * into v_fac from public.facilities where id = p_facility_id;
    if not found then
        raise exception 'المنشأة غير موجودة.';
    end if;

    if p_booking_date is null then
        raise exception 'يرجى تحديد التاريخ المراد قفله.';
    end if;

    if v_fac.category = 'farm' then
        v_shift := case when p_shift_type in ('morning', 'evening', 'fullday') then p_shift_type else 'fullday' end;
        v_h_from := case when v_shift = 'evening' then 12 else 0 end;
        v_h_to   := case when v_shift = 'morning' then 12 else 24 end;
        v_details := to_char(p_booking_date, 'YYYY-MM-DD') || ' (' || v_shift || ') [قفل إداري' || case when v_note <> '' then ': ' || v_note else '' end || ']';
    elsif v_fac.category = 'field' then
        if p_start_hour is not null and p_hours is not null and p_start_hour >= 6 and p_hours >= 2 and (p_start_hour + p_hours) <= 24 then
            v_h_from := p_start_hour::smallint;
            v_h_to   := (p_start_hour + p_hours)::smallint;
            v_details := to_char(p_booking_date, 'YYYY-MM-DD') || ' — قفل ساعات (' || v_h_from::text || ':00 إلى ' || v_h_to::text || ':00) [قفل إداري' || case when v_note <> '' then ': ' || v_note else '' end || ']';
        else
            v_h_from := 6;
            v_h_to   := 24;
            v_details := to_char(p_booking_date, 'YYYY-MM-DD') || ' — اليوم بالكامل [قفل إداري' || case when v_note <> '' then ': ' || v_note else '' end || ']';
        end if;
    else
        v_h_from := 0;
        v_h_to   := 24;
        v_details := to_char(p_booking_date, 'YYYY-MM-DD') || ' — طوال اليوم [قفل إداري' || case when v_note <> '' then ': ' || v_note else '' end || ']';
    end if;

    insert into public.bookings (
        facility_id, item_name_ar, item_name_en, client_name, phone,
        booking_date, hour_from, hour_to, shift_type, details,
        total, deposit, receipt_data, status, client_ip
    ) values (
        v_fac.id, v_fac.name_ar, coalesce(nullif(btrim(v_fac.name_en), ''), v_fac.name_ar),
        '🔒 قفل إداري' || case when v_note <> '' then ' (' || left(v_note, 60) || ')' else ' (حجز خارجي)' end,
        '0781929509', p_booking_date, v_h_from, v_h_to, v_shift, left(v_details, 490),
        1.00, 1.00, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAABE0lEQVR4AQEIAff+AA0oGP/Uo1n/DSgY/9SjWf8NKBj/1KNZ/w0oGP/Uo1n/ANSjWf8NKBj/1KNZ/w0oGP/Uo1n/DSgY/9SjWf8NKBj/AA0oGP/Uo1n/DSgY/9SjWf8NKBj/1KNZ/w0oGP/Uo1n/ANSjWf8NKBj/1KNZ/w0oGP/Uo1n/DSgY/9SjWf8NKBj/AA0oGP/Uo1n/DSgY/9SjWf8NKBj/1KNZ/w0oGP/Uo1n/ANSjWf8NKBj/1KNZ/w0oGP/Uo1n/DSgY/9SjWf8NKBj/AA0oGP/Uo1n/DSgY/9SjWf8NKBj/1KNZ/w0oGP/Uo1n/ANSjWf8NKBj/1KNZ/w0oGP/Uo1n/DSgY/9SjWf8NKBj/kqWDYZCsew8AAAAASUVORK5CYII=', 'confirmed', 'admin'
    )
    returning id into v_new_id;

    return jsonb_build_object('id', v_new_id, 'status', 'confirmed');
end;
$$;

grant execute on function public.admin_block_slot(bigint, date, text, integer, integer, text) to authenticated;

-- =====================================================================
-- 13) جدول إعدادات إشعارات تيليجرام المحمي للأدمن فقط (admin_settings)
--     + إرسال الإشعارات من السيرفر (Server-Side) دون كشف Bot Token للزوار
-- =====================================================================
create extension if not exists pg_net;

create table if not exists public.admin_settings (
    key         text primary key,
    value_json  jsonb not null default '{}'::jsonb,
    updated_at  timestamptz not null default now()
);

-- ترحيل أي إعدادات تيليجرام قديمة كانت مخزنة في promo_codes إلى admin_settings المحمي ثم حذفها من promo_codes
do $$
declare
    v_old_title text;
    v_parts     text[];
begin
    select title_ar into v_old_title
    from public.promo_codes
    where upper(code) = '__TG_CFG__'
    limit 1;

    if v_old_title is not null and position('|' in v_old_title) > 0 then
        v_parts := string_to_array(v_old_title, '|');
        if coalesce(v_parts[1], '') <> '' and coalesce(v_parts[2], '') <> '' then
            insert into public.admin_settings (key, value_json, updated_at)
            values (
                'telegram_notify',
                jsonb_build_object(
                    'botToken', btrim(v_parts[1]),
                    'chatId', btrim(v_parts[2]),
                    'enabled', (coalesce(v_parts[3], '1') <> '0')
                ),
                now()
            )
            on conflict (key) do nothing;
        end if;
    end if;

    delete from public.promo_codes where upper(code) = '__TG_CFG__';
end $$;

alter table public.admin_settings enable row level security;

drop policy if exists "admin_settings_select_all" on public.admin_settings;
drop policy if exists "admin_settings_admin_select" on public.admin_settings;
drop policy if exists "admin_settings_admin_write" on public.admin_settings;
drop policy if exists "admin_settings_admin_update" on public.admin_settings;
drop policy if exists "admin_settings_admin_delete" on public.admin_settings;

-- قفل القراءة والكتابة في admin_settings على الأدمن حصراً (يمنع أي زائر من رؤية Bot Token نهائياً)
create policy "admin_settings_admin_select" on public.admin_settings
    for select to authenticated using (public.is_admin());
create policy "admin_settings_admin_write" on public.admin_settings
    for insert to authenticated with check (public.is_admin());
create policy "admin_settings_admin_update" on public.admin_settings
    for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_settings_admin_delete" on public.admin_settings
    for delete to authenticated using (public.is_admin());

-- دالة آمنة على السيرفر لإرسال إشعار التيليجرام (لحجز جديد أو تقييم جديد) دون كشف التوكن للمتصفح
create or replace function public.send_telegram_alert(
    p_booking_id bigint default null,
    p_facility_name text default null,
    p_reviewer_name text default null,
    p_rating numeric default null,
    p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_cfg       jsonb;
    v_token     text;
    v_chat_id   text;
    v_enabled   boolean;
    v_b         public.bookings%rowtype;
    v_rem       numeric(10,2);
    v_wa_phone  text;
    v_text      text;
begin
    select value_json into v_cfg
    from public.admin_settings
    where key = 'telegram_notify';

    if v_cfg is null then
        return jsonb_build_object('sent', false, 'reason', 'not_configured');
    end if;

    v_token   := btrim(coalesce(v_cfg ->> 'botToken', ''));
    v_chat_id := btrim(coalesce(v_cfg ->> 'chatId', ''));
    v_enabled := coalesce((v_cfg ->> 'enabled')::boolean, false);

    if not v_enabled or v_token = '' or v_chat_id = '' then
        return jsonb_build_object('sent', false, 'reason', 'disabled');
    end if;

    if p_booking_id is not null then
        select * into v_b
        from public.bookings
        where id = p_booking_id
          and created_at > now() - interval '15 minutes';

        if not found then
            return jsonb_build_object('sent', false, 'reason', 'booking_not_found');
        end if;

        v_rem := greatest(0, round(v_b.total - v_b.deposit, 2));
        v_wa_phone := regexp_replace(v_b.phone, '^\+', '');
        if v_wa_phone ~ '^07[789][0-9]{7}$' then
            v_wa_phone := '962' || substr(v_wa_phone, 2);
        end if;

        v_text := '🔔 طلب حجز جديد — منصة Weekend!' || chr(10)
               || '━━━━━━━━━━━━━━━━━━' || chr(10)
               || '🎫 رقم التذكرة: #WKND-' || v_b.id::text || chr(10)
               || '🏡 المنشأة: ' || coalesce(v_b.item_name_ar, 'منشأة') || chr(10)
               || '👤 العميل: ' || coalesce(v_b.client_name, '') || chr(10)
               || '📞 الهاتف: ' || coalesce(v_b.phone, '') || chr(10)
               || '📅 التفاصيل: ' || coalesce(v_b.details, '') || chr(10)
               || case when coalesce(v_b.pickup_location, '') <> '' or coalesce(v_b.dropoff_location, '') <> ''
                       then '📌 الانطلاق: ' || coalesce(v_b.pickup_location, '—') || chr(10) || '🏁 الوصول: ' || coalesce(v_b.dropoff_location, '—') || chr(10)
                       else '' end
               || '💰 الإجمالي: ' || to_char(v_b.total, 'FM999990.00') || ' JOD' || chr(10)
               || '💳 العربون (CliQ): ' || to_char(v_b.deposit, 'FM999990.00') || ' JOD' || chr(10)
               || '💵 المتبقي عند الوصول: ' || to_char(v_rem, 'FM999990.00') || ' JOD' || chr(10)
               || case when v_b.receipt_data ~* '^https://' then '🖼️ صورة وصل CliQ:' || chr(10) || v_b.receipt_data || chr(10) else '' end
               || '💬 مراسلة الزبون على واتساب:' || chr(10) || 'https://wa.me/' || v_wa_phone;
    elsif coalesce(btrim(p_reviewer_name), '') <> '' then
        v_text := '⭐ تقييم جديد بانتظار المراجعة — منصة Weekend' || chr(10)
               || '━━━━━━━━━━━━━━━━━━' || chr(10)
               || '🏡 المنشأة: ' || left(coalesce(p_facility_name, 'منشأة'), 120) || chr(10)
               || '👤 الزائر: ' || left(btrim(p_reviewer_name), 80) || chr(10)
               || '🌟 التقييم: ' || coalesce(p_rating::text, '5') || ' / 5' || chr(10)
               || '💬 التعليق: ' || left(btrim(coalesce(p_comment, '')), 500);
    else
        return jsonb_build_object('sent', false, 'reason', 'empty_payload');
    end if;

    begin
        perform net.http_post(
            url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
            headers := '{"Content-Type": "application/json"}'::jsonb,
            body := jsonb_build_object(
                'chat_id', v_chat_id,
                'text', v_text,
                'disable_web_page_preview', false
            )
        );
        return jsonb_build_object('sent', true);
    exception when others then
        return jsonb_build_object('sent', false, 'reason', 'pg_net_unavailable');
    end;
end;
$$;

grant execute on function public.send_telegram_alert(bigint, text, text, numeric, text) to anon, authenticated;

-- دالة تنظيف الطلبات المعلقة المنتهية تلقائياً عند فتح لوحة الأدمن
create or replace function public.clean_expired_bookings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_cnt integer;
begin
    if not public.is_admin() then
        return 0;
    end if;

    update public.bookings
    set status = 'expired'
    where status = 'pending'
      and created_at <= now() - interval '2 hours';

    get diagnostics v_cnt = row_count;
    return v_cnt;
end;
$$;

grant execute on function public.clean_expired_bookings() to authenticated;

commit;