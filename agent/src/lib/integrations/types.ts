export type ProviderName = "quickbooks" | "xero" | "mercury" | "stripe";

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface OAuthCredentials {
  type: "oauth2";
  accessToken: string;
  metadata?: Record<string, unknown>;
}

export interface ApiKeyCredentials {
  type: "api_key";
  apiKey: string;
  metadata?: Record<string, unknown>;
}

export type Credentials = OAuthCredentials | ApiKeyCredentials;

export interface FinancialModelRow {
  organization_id: string;
  category: string;
  subcategory: string;
  month: string;
  amount: number;
  scenario: string;
}

export interface SyncResult {
  rowsImported: number;
  categories: Record<string, number>;
  period: { start: string; end: string };
}

interface BaseProvider {
  name: ProviderName;
  syncFinancials(credentials: Credentials, organizationId: string): Promise<SyncResult>;
}

export interface OAuthProvider extends BaseProvider {
  authType: "oauth2";
  getAuthorizationUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<TokenSet>;
  refreshAccessToken(refreshToken: string): Promise<TokenSet>;
}

export interface ApiKeyProvider extends BaseProvider {
  authType: "api_key";
  validateApiKey(apiKey: string): Promise<{ valid: boolean; metadata?: Record<string, unknown> }>;
}

export type IntegrationProvider = OAuthProvider | ApiKeyProvider;
