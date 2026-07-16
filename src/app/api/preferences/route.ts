import { getPreferences, updatePreferences, type AppPreferences } from "@/lib/environments";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const environmentId = Number(request.nextUrl.searchParams.get("environmentId"));
  return NextResponse.json({ preferences: getPreferences(Number.isInteger(environmentId) && environmentId > 0 ? environmentId : undefined) });
}

export async function PATCH(request: NextRequest) {
  const input = await request.json() as Partial<AppPreferences>;
  if (input.layout && input.layout !== "grid" && input.layout !== "list") {
    return NextResponse.json({ error: "Invalid layout." }, { status: 400 });
  }
  if (input.density !== undefined && (!Number.isInteger(input.density) || input.density < 2 || input.density > 6)) {
    return NextResponse.json({ error: "Invalid density." }, { status: 400 });
  }
  if (input.sidebarWidth !== undefined && (!Number.isInteger(input.sidebarWidth) || input.sidebarWidth < 220 || input.sidebarWidth > 420)) {
    return NextResponse.json({ error: "Invalid sidebar width." }, { status: 400 });
  }
  if (input.drawerWidth !== undefined && (!Number.isInteger(input.drawerWidth) || input.drawerWidth < 380 || input.drawerWidth > 900)) {
    return NextResponse.json({ error: "Invalid drawer width." }, { status: 400 });
  }
  return NextResponse.json({ preferences: updatePreferences(input) });
}
