/**
 * Tests for pure helper functions from supabase/functions/clerk-webhook/index.ts.
 *
 * These functions are replicated here because the edge function uses Deno imports
 * that aren't compatible with Vitest. Keep in sync with the source.
 */
import { describe, it, expect } from "vitest";

// ─── Types (mirrored from clerk-webhook/index.ts) ───────────────────────────

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

// ─── Functions under test (mirrored from clerk-webhook/index.ts) ────────────

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
  return extractEmail(user) ?? "User";
}

function mapRole(clerkRole: string): string {
  if (clerkRole === "org:admin") return "owner";
  return "cofounder";
}

// ─── Tests ──────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<ClerkUser> = {}): ClerkUser {
  return {
    id: "user_test123",
    first_name: null,
    last_name: null,
    username: null,
    primary_email_address_id: null,
    email_addresses: [],
    image_url: null,
    ...overrides,
  };
}

describe("extractEmail", () => {
  it("returns primary email when primary_email_address_id matches", () => {
    const user = makeUser({
      primary_email_address_id: "em_1",
      email_addresses: [
        { id: "em_1", email_address: "test@example.com", verification: null },
        { id: "em_2", email_address: "other@example.com", verification: null },
      ],
    });
    expect(extractEmail(user)).toBe("test@example.com");
  });

  it("returns null when primary_email_address_id is null", () => {
    const user = makeUser({
      primary_email_address_id: null,
      email_addresses: [
        { id: "em_1", email_address: "test@example.com", verification: null },
      ],
    });
    expect(extractEmail(user)).toBeNull();
  });

  it("returns null when no email matches the primary ID", () => {
    const user = makeUser({
      primary_email_address_id: "em_nonexistent",
      email_addresses: [
        { id: "em_1", email_address: "test@example.com", verification: null },
      ],
    });
    expect(extractEmail(user)).toBeNull();
  });

  it("returns null for user with no email addresses", () => {
    const user = makeUser({
      primary_email_address_id: "em_1",
      email_addresses: [],
    });
    expect(extractEmail(user)).toBeNull();
  });
});

describe("extractDisplayName", () => {
  it("returns 'first last' when both names exist", () => {
    const user = makeUser({ first_name: "John", last_name: "Doe" });
    expect(extractDisplayName(user)).toBe("John Doe");
  });

  it("returns first name only when last name is null", () => {
    const user = makeUser({ first_name: "John", last_name: null });
    expect(extractDisplayName(user)).toBe("John");
  });

  it("falls back to username when no names", () => {
    const user = makeUser({ username: "johndoe" });
    expect(extractDisplayName(user)).toBe("johndoe");
  });

  it("falls back to email when no username", () => {
    const user = makeUser({
      primary_email_address_id: "em_1",
      email_addresses: [
        { id: "em_1", email_address: "john@example.com", verification: null },
      ],
    });
    expect(extractDisplayName(user)).toBe("john@example.com");
  });

  it("returns 'User' as last resort", () => {
    const user = makeUser();
    expect(extractDisplayName(user)).toBe("User");
  });

  it("prefers first+last over username", () => {
    const user = makeUser({
      first_name: "John",
      last_name: "Doe",
      username: "johndoe",
    });
    expect(extractDisplayName(user)).toBe("John Doe");
  });
});

describe("mapRole", () => {
  it("maps org:admin to owner", () => {
    expect(mapRole("org:admin")).toBe("owner");
  });

  it("maps org:member to cofounder", () => {
    expect(mapRole("org:member")).toBe("cofounder");
  });

  it("maps unknown roles to cofounder", () => {
    expect(mapRole("org:viewer")).toBe("cofounder");
    expect(mapRole("org:billing")).toBe("cofounder");
    expect(mapRole("random_string")).toBe("cofounder");
  });
});
