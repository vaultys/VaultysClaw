import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden } from "@/lib/api-utils";
import { SettingsDAO } from "@/db";
import { getStorageConfig, setStorageConfig } from "@/db/settings.dao";

// GET /api/settings/storage
/**
 * @openapi
 * /api/settings/storage:
 *   get:
 *     summary: Retrieve the current storage configuration.
 *     tags: [Settings]
 *     responses:
 *       200:
 *         description: Successful response with storage configuration.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 storageType:
 *                   type: string
 *                 filesystem:
 *                   type: object
 *                   properties:
 *                     directory:
 *                       type: string
 *                 s3:
 *                   type: object
 *                   properties:
 *                     enabled:
 *                       type: boolean
 *                     region:
 *                       type: string
 *                     bucket:
 *                       type: string
 *                     endpoint:
 *                       type: string
 *                       nullable: true
 *                     accessKeyId:
 *                       type: string
 *                     configured:
 *                       type: boolean
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const cfg = await getStorageConfig();

  return NextResponse.json({
    storageType: cfg.storageType,
    filesystem: { directory: cfg.filesystemDir },
    s3: {
      enabled: cfg.s3Enabled,
      region: cfg.s3Region,
      bucket: cfg.s3Bucket,
      endpoint: cfg.s3Endpoint ?? null,
      // Return the access key ID (not secret) so the UI can show it
      accessKeyId: cfg.s3AccessKeyId ?? "",
      configured: !!(cfg.s3Bucket && cfg.s3AccessKeyId),
    },
  });
}

// PUT /api/settings/storage
/**
 * @openapi
 * /api/settings/storage:
 *   put:
 *     summary: Update storage configuration settings.
 *     tags: [Settings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               storageType:
 *                 type: string
 *                 enum: [filesystem, s3]
 *               filesystemDir:
 *                 type: string
 *               s3:
 *                 type: object
 *                 properties:
 *                   enabled:
 *                     type: boolean
 *                   region:
 *                     type: string
 *                   bucket:
 *                     type: string
 *                   endpoint:
 *                     type: string
 *                   accessKeyId:
 *                     type: string
 *                   secretAccessKey:
 *                     type: string
 *     responses:
 *       200:
 *         description: Storage configuration updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 storageType:
 *                   type: string
 *                 s3:
 *                   type: object
 *                   properties:
 *                     enabled:
 *                       type: boolean
 *                     bucket:
 *                       type: string
 *                     region:
 *                       type: string
 *                     accessKeyId:
 *                       type: string
 *                     configured:
 *                       type: boolean
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
export async function PUT(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const body = (await request.json()) as {
    storageType?: "filesystem" | "s3";
    filesystemDir?: string;
    s3?: {
      enabled?: boolean;
      region?: string;
      bucket?: string;
      endpoint?: string;
      accessKeyId?: string;
      secretAccessKey?: string;
    };
  };

  if (body.s3?.enabled) {
    const { region, bucket, accessKeyId, secretAccessKey } = body.s3;
    if (!region || !bucket) {
      return NextResponse.json(
        { error: "region and bucket are required when enabling S3" },
        { status: 400 }
      );
    }
    if (!accessKeyId) {
      return NextResponse.json(
        { error: "accessKeyId is required when enabling S3" },
        { status: 400 }
      );
    }
    // secretAccessKey is only required if not already saved
    if (!secretAccessKey && !await SettingsDAO.get("s3_secret_access_key_enc")) {
      return NextResponse.json(
        {
          error:
            "secretAccessKey is required when enabling S3 for the first time",
        },
        { status: 400 }
      );
    }
  }

  await setStorageConfig({
    storageType: body.storageType,
    filesystemDir: body.filesystemDir,
    s3Enabled: body.s3?.enabled,
    s3Region: body.s3?.region,
    s3Bucket: body.s3?.bucket,
    s3Endpoint: body.s3?.endpoint ?? "",
    s3AccessKeyId: body.s3?.accessKeyId,
    s3SecretAccessKey: body.s3?.secretAccessKey || undefined,
  });

  const updated = await getStorageConfig();
  return NextResponse.json({
    ok: true,
    storageType: updated.storageType,
    s3: {
      enabled: updated.s3Enabled,
      bucket: updated.s3Bucket,
      region: updated.s3Region,
      accessKeyId: updated.s3AccessKeyId ?? "",
      configured: !!(updated.s3Bucket && updated.s3AccessKeyId),
    },
  });
}
