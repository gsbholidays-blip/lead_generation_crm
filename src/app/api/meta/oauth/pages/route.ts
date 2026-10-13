import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { handleApiError, jsonError } from "@/lib/api-response";
import { decryptToken } from "@/lib/meta/crypto";
import { getAccessiblePages, MetaGraphError } from "@/lib/meta/graph-client";
import { OAUTH_USER_TOKEN_COOKIE_NAME } from "@/lib/meta/oauth-state";

export async function GET(request: NextRequest) {
  try {
    await requireRole("ADMIN");

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

    const pageIds = pages.map((page) => page.id);
    const connected = await db.metaAccount.findMany({
      where: { metaPageId: { in: pageIds } },
      select: { metaPageId: true },
    });
    const connectedIds = new Set(connected.map((account) => account.metaPageId));

    return NextResponse.json({
      pages: pages.map((page) => ({
        id: page.id,
        name: page.name,
        hasInstagram: !!page.instagram_business_account,
        alreadyConnected: connectedIds.has(page.id),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
