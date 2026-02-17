/**
 * Clerk Webhook Handler — CFO Project
 *
 * Handles Clerk events to sync users, organizations, and memberships to Supabase.
 * Mirrors the pattern from BlockDrive's clerk-webhook Edge Function.
 *
 * Events handled:
 * - user.created     → Upsert profiles (user_id TEXT = Clerk user ID)
 * - user.updated     → Update profiles display_name
 * - organization.created → Insert organizations with clerk_org_id
 * - organizationMembership.created → Insert user_roles + update profiles.organization_id
 * - organizationMembership.deleted → Delete user_roles
 *
 * Required env vars:
 * - CLERK_WEBHOOK_SECRET: Webhook signing secret from Clerk dashboard
 * - SUPABASE_URL (automatic)
 * - SUPABASE_SERVICE_ROLE_KEY (automatic)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Webhook } from 'https://esm.sh/svix@1.41.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature',
};

// ─── Types ──────────────────────────────────────────────────────────────────

type ClerkEmailAddress = {
  email_address: string;
  id: string;
  verification: { status: string } | null;
};

type ClerkUser = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  primary_email_address_id: string | null;
  email_addresses: ClerkEmailAddress[];
  image_url: string | null;
};

type ClerkOrganization = {
  id: string;
  name: string;
  slug: string;
  created_at: number;
  created_by?: string;
};

type ClerkOrganizationMembership = {
  id: string;
  organization: { id: string; slug: string };
  public_user_data: { user_id: string };
  role: string;
  created_at: number;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractEmail(user: ClerkUser): string | null {
  if (!user.primary_email_address_id) return null;
  const primary = user.email_addresses.find(
    (e) => e.id === user.primary_email_address_id
  );
  return primary?.email_address ?? null;
}

function extractDisplayName(user: ClerkUser): string {
  if (user.first_name && user.last_name) return `${user.first_name} ${user.last_name}`;
  if (user.first_name) return user.first_name;
  if (user.username) return user.username;
  return extractEmail(user) ?? 'User';
}

/** Map Clerk org role to CFO app_role enum */
function mapRole(clerkRole: string): string {
  if (clerkRole === 'org:admin') return 'owner';
  return 'cofounder'; // org:member → cofounder
}

function getSupabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

// ─── User Handlers ──────────────────────────────────────────────────────────

async function handleUserCreated(data: ClerkUser) {
  const supabase = getSupabaseAdmin();
  const displayName = extractDisplayName(data);

  console.log(`[clerk-webhook] Creating profile for user ${data.id}`);

  const { error } = await supabase.from('profiles').upsert(
    {
      user_id: data.id,
      display_name: displayName,
      avatar_url: data.image_url ?? null,
    },
    { onConflict: 'user_id', ignoreDuplicates: false }
  );

  if (error) {
    console.error('[clerk-webhook] Profile upsert error:', error);
    throw error;
  }

  console.log(`[clerk-webhook] Profile created for ${data.id}`);
}

async function handleUserUpdated(data: ClerkUser) {
  const supabase = getSupabaseAdmin();
  const displayName = extractDisplayName(data);

  console.log(`[clerk-webhook] Updating profile for user ${data.id}`);

  const { error } = await supabase
    .from('profiles')
    .update({
      display_name: displayName,
      avatar_url: data.image_url ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', data.id);

  if (error) {
    console.error('[clerk-webhook] Profile update error:', error);
    throw error;
  }
}

// ─── Organization Handlers ──────────────────────────────────────────────────

async function handleOrganizationCreated(data: ClerkOrganization) {
  const supabase = getSupabaseAdmin();

  console.log(`[clerk-webhook] Creating organization ${data.id} (${data.name})`);

  // Check idempotency — org may already exist
  const { data: existing } = await supabase
    .from('organizations')
    .select('id')
    .eq('clerk_org_id', data.id)
    .maybeSingle();

  if (existing) {
    console.log(`[clerk-webhook] Organization ${data.id} already exists, skipping`);
    return;
  }

  const { error } = await supabase.from('organizations').insert({
    clerk_org_id: data.id,
    name: data.name,
  });

  if (error) {
    console.error('[clerk-webhook] Organization insert error:', error);
    throw error;
  }

  console.log(`[clerk-webhook] Organization created: ${data.name}`);
}

async function handleMembershipCreated(data: ClerkOrganizationMembership) {
  const supabase = getSupabaseAdmin();
  const clerkUserId = data.public_user_data.user_id;
  const clerkOrgId = data.organization.id;

  console.log(`[clerk-webhook] Adding member ${clerkUserId} to org ${clerkOrgId}`);

  // Look up the Supabase organization UUID
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id')
    .eq('clerk_org_id', clerkOrgId)
    .maybeSingle();

  if (orgError || !org) {
    console.error('[clerk-webhook] Organization not found for membership:', clerkOrgId, orgError);
    throw new Error(`Organization not found: ${clerkOrgId}`);
  }

  const role = mapRole(data.role);

  // Insert user_role (idempotent via unique constraint)
  const { error: roleError } = await supabase.from('user_roles').upsert(
    {
      user_id: clerkUserId,
      organization_id: org.id,
      role,
    },
    { onConflict: 'user_id,organization_id', ignoreDuplicates: true }
  );

  if (roleError) {
    console.error('[clerk-webhook] user_roles upsert error:', roleError);
    throw roleError;
  }

  // Update profiles.organization_id so get_user_org() works
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ organization_id: org.id })
    .eq('user_id', clerkUserId);

  if (profileError) {
    console.error('[clerk-webhook] Profile org update error:', profileError);
    // Non-fatal — the user_role is what matters for RLS
  }

  console.log(`[clerk-webhook] Member ${clerkUserId} added to org ${org.id} as ${role}`);
}

async function handleMembershipDeleted(data: ClerkOrganizationMembership) {
  const supabase = getSupabaseAdmin();
  const clerkUserId = data.public_user_data.user_id;
  const clerkOrgId = data.organization.id;

  console.log(`[clerk-webhook] Removing member ${clerkUserId} from org ${clerkOrgId}`);

  // Look up the Supabase organization UUID
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('clerk_org_id', clerkOrgId)
    .maybeSingle();

  if (!org) {
    console.log(`[clerk-webhook] Organization ${clerkOrgId} not found (already deleted?)`);
    return;
  }

  const { error } = await supabase
    .from('user_roles')
    .delete()
    .eq('user_id', clerkUserId)
    .eq('organization_id', org.id);

  if (error) {
    console.error('[clerk-webhook] user_roles delete error:', error);
    throw error;
  }

  // Clear organization_id on profile
  await supabase
    .from('profiles')
    .update({ organization_id: null })
    .eq('user_id', clerkUserId)
    .eq('organization_id', org.id);

  console.log(`[clerk-webhook] Member ${clerkUserId} removed from org ${org.id}`);
}

// ─── Server ─────────────────────────────────────────────────────────────────

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Health check
  if (req.method === 'GET') {
    return new Response('OK', { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const secret = Deno.env.get('CLERK_WEBHOOK_SECRET');
    if (!secret) {
      console.error('[clerk-webhook] CLERK_WEBHOOK_SECRET not configured');
      return new Response('CLERK_WEBHOOK_SECRET not configured', {
        status: 500,
        headers: corsHeaders,
      });
    }

    // Get raw body for signature verification
    const payload = await req.text();

    // Get Svix headers
    const svixId = req.headers.get('svix-id');
    const svixTimestamp = req.headers.get('svix-timestamp');
    const svixSignature = req.headers.get('svix-signature');

    if (!svixId || !svixTimestamp || !svixSignature) {
      console.error('[clerk-webhook] Missing Svix headers');
      return new Response('Missing Svix headers', { status: 400, headers: corsHeaders });
    }

    // Verify webhook signature
    const wh = new Webhook(secret);
    let event: { type: string; data: any };

    try {
      event = wh.verify(payload, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as { type: string; data: any };
    } catch (e) {
      console.error('[clerk-webhook] Signature verification failed:', e);
      return new Response('Bad signature', { status: 400, headers: corsHeaders });
    }

    console.log(`[clerk-webhook] Received event: ${event.type}`);
    const { type, data } = event;

    if (type === 'user.created') {
      await handleUserCreated(data as ClerkUser);
    } else if (type === 'user.updated') {
      await handleUserUpdated(data as ClerkUser);
    } else if (type === 'organization.created') {
      await handleOrganizationCreated(data as ClerkOrganization);
    } else if (type === 'organizationMembership.created') {
      await handleMembershipCreated(data as ClerkOrganizationMembership);
    } else if (type === 'organizationMembership.deleted') {
      await handleMembershipDeleted(data as ClerkOrganizationMembership);
    } else {
      console.log(`[clerk-webhook] Ignoring event type: ${type}`);
      return new Response('Ignored', { status: 200, headers: corsHeaders });
    }

    return new Response('OK', { status: 200, headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[clerk-webhook] Unhandled error:', message, err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
