import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden, malformed } from "@/lib/api/utils/api-utils";
import { decryptSecret } from "@/lib/vault";
import { SettingsDAO } from "@/db";
import { getStorageConfig } from "@/db/settings.dao";
import { withError } from "@/lib/api/handlers/with-error";

// POST /api/settings/storage/test
// Body fields are optional — omit any to fall back to the saved (DB) config.
// secretAccessKey must be supplied in the body if not yet saved.
/**
 * @openapi
 * /api/settings/storage/test:
 *   post:
 *     summary: Test storage settings with optional overrides.
 *     tags: [Settings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               region:
 *                 type: string
 *               bucket:
 *                 type: string
 *               endpoint:
 *                 type: string
 *               accessKeyId:
 *                 type: string
 *               secretAccessKey:
 *                 type: string
 *             required:
 *               - secretAccessKey
 *     responses:
 *       200:
 *         description: Storage settings tested successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 latency:
 *                   type: integer
 *                 bucket:
 *                   type: string
 *                 region:
 *                   type: string
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
export const POST = withError(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const body = (await request.json()) as {
    region?: string;
    bucket?: string;
    endpoint?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
  };

  const saved = await getStorageConfig();

  const region = body.region?.trim() || saved.s3Region || "us-east-1";
  const bucket = body.bucket?.trim() || saved.s3Bucket;
  const endpoint = body.endpoint?.trim() || saved.s3Endpoint || undefined;
  const accessKeyId = body.accessKeyId?.trim() || saved.s3AccessKeyId || "";

  // Secret key is never returned by GET — accept from body or decrypt from DB
  let secretAccessKey = body.secretAccessKey ?? "";
  if (!secretAccessKey) {
    const enc = await SettingsDAO.get("s3_secret_access_key_enc");
    if (enc) {
      try {
        secretAccessKey = await decryptSecret(enc);
      } catch {
        /* will fail below */
      }
    }
  }

  if (!bucket || !accessKeyId || !secretAccessKey) {
    return malformed("bucket, accessKeyId and secretAccessKey are required");
  }

  const start = Date.now();
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { S3Client, HeadBucketCommand } = require("@aws-sdk/client-s3");

    const s3Cfg: Record<string, unknown> = {
      region,
      credentials: { accessKeyId, secretAccessKey },
    };
    if (endpoint) {
      s3Cfg.endpoint = endpoint;
      s3Cfg.forcePathStyle = true; // required for MinIO
    }

    const client = new S3Client(s3Cfg);
    await client.send(new HeadBucketCommand({ Bucket: bucket }));

    return NextResponse.json({
      ok: true,
      latency: Date.now() - start,
      bucket,
      region,
    });
  } catch (err: any) {
    const latency = Date.now() - start;
    const status = err.$metadata?.httpStatusCode;

    // 403 → credentials are valid but missing s3:HeadBucket permission
    if (status === 403) {
      return NextResponse.json({
        ok: false,
        latency,
        error: "Connected but access denied — check bucket permissions",
      });
    }
    // 404 → credentials valid, bucket missing
    if (status === 404) {
      return NextResponse.json({
        ok: false,
        latency,
        error: `Bucket "${bucket}" not found`,
      });
    }

    return NextResponse.json({
      ok: false,
      latency,
      error: err.message ?? String(err),
    });
  }
});
