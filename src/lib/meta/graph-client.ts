import "server-only";

export const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || "v21.0";
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export class MetaGraphError extends Error {
  code?: number;
  type?: string;
  constructor(message: string, code?: number, type?: string) {
    super(message);
    this.code = code;
    this.type = type;
  }
}

async function graphFetch<T>(
  path: string,
  accessToken: string,
  params: Record<string, string> = {}
): Promise<T> {
  const url = new URL(`${GRAPH_BASE_URL}${path}`);
  url.searchParams.set("access_token", accessToken);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString());
  const data = await res.json();

  if (!res.ok || data.error) {
    throw new MetaGraphError(
      data.error?.message ?? `Meta Graph API request failed (${res.status})`,
      data.error?.code,
      data.error?.type
    );
  }

  return data as T;
}

async function graphPost<T>(
  path: string,
  accessToken: string,
  params: Record<string, string> = {}
): Promise<T> {
  const url = new URL(`${GRAPH_BASE_URL}${path}`);
  url.searchParams.set("access_token", accessToken);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), { method: "POST" });
  const data = await res.json();

  if (!res.ok || data.error) {
    throw new MetaGraphError(
      data.error?.message ?? `Meta Graph API request failed (${res.status})`,
      data.error?.code,
      data.error?.type
    );
  }

  return data as T;
}

/** Raw (non-accessToken-keyed) GET for the OAuth code/token exchange endpoints. */
async function graphOAuthGet<T>(params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH_BASE_URL}/oauth/access_token`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString());
  const data = await res.json();

  if (!res.ok || data.error) {
    throw new MetaGraphError(
      data.error?.message ?? `Meta OAuth request failed (${res.status})`,
      data.error?.code,
      data.error?.type
    );
  }

  return data as T;
}

function getAppCredentials(): { appId: string; appSecret: string } {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId) throw new Error("META_APP_ID is not set");
  if (!appSecret) throw new Error("META_APP_SECRET is not set");
  return { appId, appSecret };
}

export type MetaOAuthTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number; // seconds
};

export function exchangeCodeForToken(
  code: string,
  redirectUri: string
): Promise<MetaOAuthTokenResponse> {
  const { appId, appSecret } = getAppCredentials();
  return graphOAuthGet<MetaOAuthTokenResponse>({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  });
}

export function exchangeForLongLivedToken(
  shortLivedToken: string
): Promise<MetaOAuthTokenResponse> {
  const { appId, appSecret } = getAppCredentials();
  return graphOAuthGet<MetaOAuthTokenResponse>({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  });
}

/**
 * Exchanges the authorization code from WhatsApp Embedded Signup (JS SDK popup,
 * not a redirect flow) for an access token. No redirect_uri — Embedded Signup
 * codes are single-use and already tied to the app via client_id/client_secret.
 */
export function exchangeEmbeddedSignupCode(code: string): Promise<MetaOAuthTokenResponse> {
  const { appId, appSecret } = getAppCredentials();
  return graphOAuthGet<MetaOAuthTokenResponse>({
    client_id: appId,
    client_secret: appSecret,
    code,
  });
}

export type MetaManagedPage = {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string };
};

export function getManagedPages(userAccessToken: string) {
  return graphFetch<{ data: MetaManagedPage[] }>("/me/accounts", userAccessToken, {
    fields: "id,name,instagram_business_account,access_token",
    limit: "200",
  });
}

export type MetaDebugTokenScope = {
  scope: string;
  target_ids?: string[];
};

export type MetaDebugTokenData = {
  app_id: string;
  type: string;
  is_valid: boolean;
  scopes?: string[];
  granular_scopes?: MetaDebugTokenScope[];
  user_id?: string;
};

/** Inspects a user token to recover Page IDs granted via Business Login's
 * granular scopes — these Pages don't show up in /me/accounts when they're
 * owned by a Business Portfolio rather than the user's personal account. */
export function debugToken(inputToken: string) {
  const { appId, appSecret } = getAppCredentials();
  return graphFetch<{ data: MetaDebugTokenData }>("/debug_token", `${appId}|${appSecret}`, {
    input_token: inputToken,
  });
}

export function getPageById(pageId: string, userAccessToken: string) {
  return graphFetch<MetaManagedPage>(`/${pageId}`, userAccessToken, {
    fields: "id,name,instagram_business_account,access_token",
  });
}

/**
 * Returns every Page the user token can manage, merging /me/accounts with
 * Pages recovered from the token's granular_scopes target_ids (Business
 * Portfolio-owned Pages granted via Facebook Login for Business). Deduped by
 * Page ID, preferring the /me/accounts entry when a Page appears in both.
 */
export async function getAccessiblePages(userAccessToken: string): Promise<MetaManagedPage[]> {
  const byId = new Map<string, MetaManagedPage>();

  try {
    const direct = await getManagedPages(userAccessToken);
    for (const page of direct.data) byId.set(page.id, page);
  } catch (error) {
    if (!(error instanceof MetaGraphError)) throw error;
  }

  const debug = await debugToken(userAccessToken);
  const targetIds = Array.from(
    new Set((debug.data.granular_scopes ?? []).flatMap((s) => s.target_ids ?? []))
  );

  const missingIds = targetIds.filter((id) => !byId.has(id));
  const fetched = await Promise.allSettled(
    missingIds.map((id) => getPageById(id, userAccessToken))
  );
  for (let i = 0; i < fetched.length; i++) {
    const result = fetched[i];
    if (result.status === "fulfilled") {
      byId.set(result.value.id, result.value);
    } else {
      console.error(
        `Failed to fetch Facebook Page ${missingIds[i]}:`,
        result.reason instanceof Error ? result.reason.message : result.reason
      );
    }
  }

  return Array.from(byId.values());
}

export function subscribePageToWebhook(pageId: string, pageAccessToken: string) {
  return graphPost<{ success: boolean }>(`/${pageId}/subscribed_apps`, pageAccessToken, {
    subscribed_fields: "leadgen",
  });
}

export type MetaPageInfo = {
  id: string;
  name: string;
  instagram_business_account?: { id: string };
};

export function getPageInfo(accessToken: string) {
  return graphFetch<MetaPageInfo>("/me", accessToken, {
    fields: "id,name,instagram_business_account",
  });
}

export type MetaLeadForm = {
  id: string;
  name: string;
  status: string;
};

export function getLeadForms(pageId: string, accessToken: string) {
  return graphFetch<{ data: MetaLeadForm[] }>(`/${pageId}/leadgen_forms`, accessToken, {
    fields: "id,name,status",
    limit: "100",
  });
}

export type MetaLeadFieldData = { name: string; values: string[] };

export type MetaLead = {
  id: string;
  created_time: string;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
  platform?: string; // "fb" | "ig" — not present on all API versions
  field_data: MetaLeadFieldData[];
};

export function getFormLeads(formId: string, accessToken: string, after?: string) {
  return graphFetch<{ data: MetaLead[]; paging?: { cursors?: { after?: string }; next?: string } }>(
    `/${formId}/leads`,
    accessToken,
    {
      fields:
        "id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,platform,field_data",
      limit: "100",
      ...(after ? { after } : {}),
    }
  );
}

export function getSingleLead(leadgenId: string, accessToken: string) {
  return graphFetch<MetaLead>(`/${leadgenId}`, accessToken, {
    fields:
      "id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,platform,field_data",
  });
}
