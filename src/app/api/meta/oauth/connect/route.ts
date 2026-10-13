import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { handleApiError, jsonError } from "@/lib/api-response";
import { decryptToken } from "@/lib/meta/crypto";
import { getAccessiblePages, subscribePageToWebhook, MetaGraphError } from "@/lib/meta/graph-client";
import { createMetaAccountFromToken, MetaAccountAlreadyConnectedError } from "@/lib/meta/connect";
import { connectMetaOAuthPageSchema } from "@/lib/validations/meta";
import { OAUTH_USER_TOKEN_COOKIE_NAME } from "@/lib/meta/oauth-state";

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    const { pageId } = connectMetaOAuthPageSchema.parse(await request.json());

    const encryptedUserToken = request.cookies.get(OAUTH_USER_TOKEN_COOKIE_NAME)?.value;
    if (!encryptedUserToken) {
      return jsonError("Session expired, please reconnect", 401);
    }

    let userToken: string;
    try {
      userToken = decryptToken(encryptedUserToken);
    } catch {
      return jsonError("Session expired, please reconnect", 401);
    }

    let pages;
    try {
      pages = await getAccessiblePages(userToken);
    } catch (error) {
      if (error instanceof MetaGraphError) {
        return jsonError(`Failed to load your Facebook Pages: ${error.message}`, 400);
      }
      throw error;
    }

    const page = pages.find((p) => p.id === pageId);
    if (!page) {
      return jsonError("Page not found or no longer accessible", 404);
    }

    let account;
    try {
      account = await createMetaAccountFromToken({
        pageId: page.id,
        name: page.name,
        instagramBusinessId: page.instagram_business_account?.id,
        accessToken: page.access_token,
        connectedById: session.sub,
      });
    } catch (error) {
      if (error instanceof MetaAccountAlreadyConnectedError) {
        return jsonError(error.message, 409);
      }
      throw error;
    }

    let webhookSubscribed = true;
    let warning: string | undefined;
    try {
      await subscribePageToWebhook(page.id, page.access_token);
    } catch (error) {
      webhookSubscribed = false;
      warning =
        "Page connected, but automatic webhook subscription failed — you can still use Sync Now, or check the Meta App webhook config.";
      console.error("Failed to subscribe page to webhook:", error);
    }

    return NextResponse.json({ account, webhookSubscribed, warning }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
