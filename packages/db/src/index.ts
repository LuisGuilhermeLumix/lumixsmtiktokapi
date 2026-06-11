// @lsm/db — client Supabase tipado
//
// Dois modos de acesso:
//  • createServiceClient: service role (API/worker) — BYPASSA RLS.
//    Nunca expor essa key ao browser.
//  • createUserClient: anon key + JWT do usuário — RLS aplicado.
//    Usado quando a API age "em nome do usuário".

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types.js";

export type Db = SupabaseClient<Database>;

const baseOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
} as const;

export function createServiceClient(url: string, serviceRoleKey: string): Db {
  return createClient<Database>(url, serviceRoleKey, baseOptions);
}

export function createUserClient(
  url: string,
  anonKey: string,
  accessToken: string,
): Db {
  return createClient<Database>(url, anonKey, {
    ...baseOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export const POST_MEDIA_BUCKET = "post-media";

// path no Storage seguindo a convenção exigida pelas policies:
// {org_id}/{client_id}/{post_id}/{arquivo}
export function postMediaPath(
  orgId: string,
  clientId: string,
  postId: string,
  filename: string,
): string {
  return `${orgId}/${clientId}/${postId}/${filename}`;
}

export type {
  Database,
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
} from "./types.js";
