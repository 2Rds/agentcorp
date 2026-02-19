import type { ProviderName, IntegrationProvider } from "./types.js";
import { quickbooksProvider } from "./quickbooks.js";
import { xeroProvider } from "./xero.js";
import { mercuryProvider } from "./mercury.js";
import { stripeProvider } from "./stripe.js";

export const providers: Record<ProviderName, IntegrationProvider> = {
  quickbooks: quickbooksProvider,
  xero: xeroProvider,
  mercury: mercuryProvider,
  stripe: stripeProvider,
};

export type {
  ProviderName,
  IntegrationProvider,
  OAuthProvider,
  ApiKeyProvider,
  TokenSet,
  OAuthCredentials,
  ApiKeyCredentials,
  Credentials,
  FinancialModelRow,
  SyncResult,
} from "./types.js";
