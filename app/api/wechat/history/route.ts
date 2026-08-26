import { errorResponse, getSyncHistory } from "@/lib/wechat";

export async function GET() {
  try {
    return Response.json({ ok: true, records: await getSyncHistory() });
  } catch (error) {
    return errorResponse(error);
  }
}
