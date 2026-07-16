import { createEnvironment, deleteEnvironment, listEnvironments, reorderEnvironments, updateEnvironment } from "@/lib/environments";
import { NextRequest, NextResponse } from "next/server";

function validInput(value: unknown): value is { name: string; storeHash: string; accessToken?: string } {
  return Boolean(value && typeof value === "object" && typeof (value as Record<string, unknown>).name === "string" && typeof (value as Record<string, unknown>).storeHash === "string");
}

export async function GET() {
  return NextResponse.json({ environments: listEnvironments() });
}

export async function POST(request: NextRequest) {
  try {
    const input = await request.json();
    if (!validInput(input) || !input.name.trim() || !input.storeHash.trim() || !input.accessToken?.trim()) {
      return NextResponse.json({ error: "Name, store hash, and access token are required." }, { status: 400 });
    }
    const environment = createEnvironment({ name: input.name, storeHash: input.storeHash, accessToken: input.accessToken });
    return NextResponse.json({ environment }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create environment." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const id = Number(request.nextUrl.searchParams.get("id"));
    const input = await request.json();
    if (!Number.isInteger(id) || !validInput(input) || !input.name.trim() || !input.storeHash.trim()) {
      return NextResponse.json({ error: "A valid environment is required." }, { status: 400 });
    }
    const environment = updateEnvironment(id, input);
    return environment ? NextResponse.json({ environment }) : NextResponse.json({ error: "Environment not found." }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update environment." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) return NextResponse.json({ error: "A valid environment is required." }, { status: 400 });
  return deleteEnvironment(id) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Environment not found." }, { status: 404 });
}

export async function PUT(request: NextRequest) {
  const input = await request.json() as { ids?: unknown };
  if (!Array.isArray(input.ids) || !input.ids.every((id) => Number.isInteger(id))) {
    return NextResponse.json({ error: "A valid environment order is required." }, { status: 400 });
  }
  return NextResponse.json({ environments: reorderEnvironments(input.ids as number[]) });
}
