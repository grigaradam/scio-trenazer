import { ImageResponse } from "next/og";
import { AppIcon } from "@/lib/appIcon";

const SIZES = [192, 512];

export function generateStaticParams() {
  return SIZES.map((size) => ({ size: String(size) }));
}

// PNG icons for the web app manifest (/icons/192, /icons/512).
export async function GET(_req: Request, ctx: RouteContext<"/icons/[size]">) {
  const size = Number((await ctx.params).size);
  if (!SIZES.includes(size)) return new Response("Not found", { status: 404 });
  return new ImageResponse(<AppIcon size={size} />, { width: size, height: size });
}
