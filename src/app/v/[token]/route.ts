import { NextResponse, type NextRequest } from "next/server";
import { siteOrigin } from "@/lib/origin";

/** Короткий адрес ссылки привязки TeamSpeak: бот шлёт её во всплывающем предупреждении, куда помещается 100 знаков */
export async function GET(_request: NextRequest, ctx: RouteContext<"/v/[token]">) {
  const { token } = await ctx.params;
  return NextResponse.redirect(`${await siteOrigin()}/voice/link?t=${encodeURIComponent(token)}`);
}
