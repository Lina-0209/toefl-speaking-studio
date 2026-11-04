import { DEFAULT_MODELS, getCredential, saveCredential, type Models } from "../../../lib/provider";
import { assertSameOrigin, errorResponse, getBindings, HttpError, requireOwner } from "../../../lib/server";

export async function GET() {
  try {
    const ownerId = await requireOwner();
    try { const { models } = await getCredential(ownerId); return Response.json({ configured: true, models }); }
    catch (error) { if (error instanceof HttpError && error.message.includes("请先")) return Response.json({ configured: false, models: DEFAULT_MODELS }); throw error; }
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const ownerId = await requireOwner();
    const body = await request.json() as { key?: unknown; models?: Partial<Models> };
    if (body.key !== undefined && typeof body.key !== "string") throw new HttpError(400, "请输入有效的 ztoken API 密钥。");
    const models = { ...DEFAULT_MODELS, ...body.models };
    if (Object.values(models).some((value) => typeof value !== "string")) throw new HttpError(400, "模型名称无效。");
    const key = typeof body.key === "string" && body.key.trim() ? body.key.trim() : (await getCredential(ownerId)).key;
    await saveCredential(ownerId, key, models);
    return Response.json({ configured: true, models });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const ownerId = await requireOwner();
    await getBindings().db.prepare("DELETE FROM provider_credentials WHERE owner_id = ?").bind(ownerId).run();
    return Response.json({ configured: false, models: DEFAULT_MODELS });
  } catch (error) { return errorResponse(error); }
}
