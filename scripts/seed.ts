/**
 * Dev-only seed script for the Argento demo data.
 *
 * Creates 3 fixed demo users (auth + profile + avatar) and their posts in the
 * live Supabase project: 1 recent active post per user (shows in the feed) and
 * 3 older expired ones (excluded by the feed filter). Re-runs replace the demo
 * data instead of duplicating it.
 *
 * SECURITY: requires SUPABASE_SERVICE_ROLE_KEY from `.env`, read via
 * `process.env` ONLY. The service role key bypasses ALL row-level security:
 * this script must never be imported by app code, the key must never use the
 * `EXPO_PUBLIC_` prefix, and neither the key nor full project URLs are ever
 * logged.
 *
 * Usage: pnpm seed
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Dev-only credential shared by the demo accounts (documented in the README). */
const DEMO_PASSWORD = 'argento-demo-123';

const HOUR_MS = 60 * 60 * 1000;
/** README `Posts System`: a post lives for 24 hours from its creation. */
const POST_TTL_MS = 24 * HOUR_MS;
const AVATAR_COUNT = 3;
const POSTS_PER_USER = 4;

/**
 * Fixed identities make the seed idempotent: existing demo accounts are
 * reused (lookup by email) and their data is replaced, never duplicated.
 */
const DEMO_USERS = [
  {
    id: '823d92c1-3477-4282-9cab-37140c70020e',
    email: 'demo1@argento.dev',
    name: 'Alex Rivera',
    username: 'alex',
  },
  {
    id: 'ade53826-88e2-4b0a-beaa-f42b57f5359a',
    email: 'demo2@argento.dev',
    name: 'Maya Chen',
    username: 'maya',
  },
  {
    id: 'ba015b61-cc7a-46ab-8a93-650b58136639',
    email: 'demo3@argento.dev',
    name: 'Leo Torres',
    username: 'leo',
  },
] as const;

type DemoUser = (typeof DEMO_USERS)[number];

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGES_DIR = join(ROOT, 'assets', 'post', 'imag');

const POST_DESCRIPTIONS = [
  'Morning light through the window',
  'Found this on my walk',
  'Lunch break snapshot',
  'Old frame from the archive',
];

function fail(message: string): never {
  console.error(`[seed] failed: ${message}`);
  process.exit(1);
}

/**
 * `assets/post/imag/` holds ~70 jpgs with many byte-identical duplicates, so
 * files are deduped by content hash first: every avatar and post then renders
 * a distinct image instead of repeating the same photo across the feed.
 * Sorted file names keep the assignment deterministic across runs.
 */
function loadUniqueImages(): string[] {
  const files = readdirSync(IMAGES_DIR)
    .filter((file) => file.toLowerCase().endsWith('.jpg'))
    .sort();

  const byHash = new Map<string, string>();
  for (const file of files) {
    const hash = createHash('sha256').update(readFileSync(join(IMAGES_DIR, file))).digest('hex');
    if (!byHash.has(hash)) byHash.set(hash, file);
  }

  const unique = [...byHash.values()];
  const needed = AVATAR_COUNT + DEMO_USERS.length * POSTS_PER_USER;
  if (unique.length < needed) {
    throw new Error(
      `only ${unique.length} unique images in assets/post/imag/ (need ${needed})`,
    );
  }
  return unique;
}

/** Admin API has no lookup-by-email here, so paginate until the email shows up. */
async function findUserByEmail(
  client: SupabaseClient,
  email: string,
): Promise<{ id: string } | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listing auth users: ${error.message}`);
    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < 1000) return null;
  }
}

async function ensureAuthUser(
  client: SupabaseClient,
  user: DemoUser,
): Promise<'created' | 'existing'> {
  const existing = await findUserByEmail(client, user.email);
  if (existing) return 'existing';

  const { error } = await client.auth.admin.createUser({
    email: user.email,
    password: DEMO_PASSWORD,
    id: user.id,
    email_confirm: true,
  });
  if (error) throw new Error(`creating ${user.email}: ${error.message}`);
  return 'created';
}

/**
 * Avatar at the README path convention `{userId}/profile.jpg` (fixed path +
 * upsert rewrites it on every run), then the profiles row. The upsert targets
 * the primary key because the signup trigger already created an empty row.
 */
async function seedProfile(client: SupabaseClient, user: DemoUser, imageFile: string) {
  const avatarPath = `${user.id}/profile.jpg`;
  const { error: uploadError } = await client.storage
    .from('profiles')
    .upload(avatarPath, readFileSync(join(IMAGES_DIR, imageFile)), {
      contentType: 'image/jpeg',
      upsert: true,
    });
  if (uploadError) throw new Error(`uploading avatar for ${user.email}: ${uploadError.message}`);

  const { error } = await client.from('profiles').upsert(
    {
      id: user.id,
      name: user.name,
      username: user.username,
      profile_image_url: avatarPath,
      onboarding_completed: true,
    },
    { onConflict: 'id' },
  );
  if (error) throw new Error(`upserting profile for ${user.email}: ${error.message}`);
}

/**
 * Reset route for idempotency: delete the user's post rows first, then clear
 * their `posts/{userId}/` storage folder. Rows go before objects so a partial
 * failure can never leave row-less images that the next run would orphan.
 */
async function resetPosts(client: SupabaseClient, userId: string): Promise<void> {
  const { error: deleteError } = await client.from('posts').delete().eq('user_id', userId);
  if (deleteError) throw new Error(`deleting old posts: ${deleteError.message}`);

  const { data: objects, error: listError } = await client.storage
    .from('posts')
    .list(userId, { limit: 1000 });
  if (listError) throw new Error(`listing posts/${userId}: ${listError.message}`);

  const paths = (objects ?? []).map((object) => `${userId}/${object.name}`);
  if (paths.length > 0) {
    const { error: removeError } = await client.storage.from('posts').remove(paths);
    if (removeError) throw new Error(`removing old post images: ${removeError.message}`);
  }
}

/**
 * 1 recent active post (created ~1.5h ago → expires in ~22.5h, visible in the
 * feed) + 3 expired ones (created >24h ago → `expires_at` in the past,
 * `is_active = false`). Only the active non-expired row survives the feed
 * filter, exactly like the real app; the expired rows prove the filter.
 */
async function seedPosts(
  client: SupabaseClient,
  user: DemoUser,
  imageFiles: string[],
): Promise<void> {
  await resetPosts(client, user.id);

  const now = Date.now();
  const agesMs = [1.5 * HOUR_MS, 30 * HOUR_MS, 46 * HOUR_MS, 70 * HOUR_MS];
  const rows = [];

  for (let index = 0; index < agesMs.length; index++) {
    const createdAt = new Date(now - agesMs[index]);
    const path = `${user.id}/seed-${index}.jpg`;
    const { error: uploadError } = await client.storage
      .from('posts')
      .upload(path, readFileSync(join(IMAGES_DIR, imageFiles[index])), {
        contentType: 'image/jpeg',
        upsert: true,
      });
    if (uploadError) throw new Error(`uploading post image for ${user.email}: ${uploadError.message}`);

    rows.push({
      user_id: user.id,
      image_url: path,
      description: POST_DESCRIPTIONS[index],
      created_at: createdAt.toISOString(),
      expires_at: new Date(createdAt.getTime() + POST_TTL_MS).toISOString(),
      is_active: index === 0,
    });
  }

  const { error } = await client.from('posts').insert(rows);
  if (error) throw new Error(`inserting posts for ${user.email}: ${error.message}`);
}

async function main(): Promise<void> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) fail('EXPO_PUBLIC_SUPABASE_URL is missing from .env');
  if (!serviceRoleKey) fail('SUPABASE_SERVICE_ROLE_KEY is missing from .env');

  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const images = loadUniqueImages();
  console.log(
    `[seed] ${DEMO_USERS.length} demo users, images deduped: ${images.length} unique files`,
  );

  let created = 0;
  for (let index = 0; index < DEMO_USERS.length; index++) {
    const user = DEMO_USERS[index];
    const status = await ensureAuthUser(client, user);
    if (status === 'created') created++;

    await seedProfile(client, user, images[index]);
    const postImages = images.slice(
      AVATAR_COUNT + index * POSTS_PER_USER,
      AVATAR_COUNT + (index + 1) * POSTS_PER_USER,
    );
    await seedPosts(client, user, postImages);

    console.log(
      `[seed] ${user.username} (${user.email}): user ${status}, avatar set, ` +
        `${POSTS_PER_USER} posts (1 active, ${POSTS_PER_USER - 1} expired)`,
    );
  }

  console.log(
    `[seed] done: ${created} created, ${DEMO_USERS.length - created} existing, ` +
      `${DEMO_USERS.length * POSTS_PER_USER} posts`,
  );
}

main().catch((cause) => fail(cause instanceof Error ? cause.message : String(cause)));
