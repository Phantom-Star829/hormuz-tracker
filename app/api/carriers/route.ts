import { NextResponse } from "next/server";
import data from "@/data/carriers.json";

export const revalidate = 300;

export async function GET() {
  return NextResponse.json(data);
}
