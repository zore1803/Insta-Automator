import { db, sql } from "@workspace/db";
import { logger } from "../lib/logger.js";

export async function ensureDatabaseSchema(): Promise<void> {
  try {
    await db.execute(sql`
      do $$
      begin
        if exists (select 1 from pg_type where typname = 'post_status')
           and not exists (
             select 1
             from pg_enum e
             join pg_type t on t.oid = e.enumtypid
             where t.typname = 'post_status' and e.enumlabel = 'failed'
           ) then
          alter type post_status add value 'failed';
        end if;
      end $$;
    `);

    await db.execute(sql`
      alter table if exists posts
        add column if not exists media_type text not null default 'image',
        add column if not exists video_url text,
        add column if not exists media_urls text[],
        add column if not exists publish_error text,
        add column if not exists created_at timestamp not null default now(),
        add column if not exists updated_at timestamp not null default now()
    `);

    await db.execute(sql`
      create table if not exists trending_niches (
        id serial primary key,
        title text not null,
        search_query text not null,
        image_query text not null,
        hashtags text not null default '',
        content_angle text not null default '',
        region text not null default 'global',
        source text not null default 'live',
        score integer not null default 0,
        cached_at timestamp not null default now()
      )
    `);

    await db.execute(sql`
      create unique index if not exists trending_niches_title_region_idx
      on trending_niches (title, region)
    `);
  } catch (err) {
    logger.error({ err }, "Database schema migration failed");
    throw err;
  }
}
