import { getAuth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export async function GET(request: Request) {
  const { GET: handleGet } = toNextJsHandler(getAuth());
  return handleGet(request);
}

export async function POST(request: Request) {
  const { POST: handlePost } = toNextJsHandler(getAuth());
  return handlePost(request);
}
