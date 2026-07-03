import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { SettingsDAO } from "@/db";
import { getStorageConfig, setStorageConfig } from "@/db/settings.dao";
import {
  adminContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(adminContract.settings, {
  // ── GET /api/admin/settings/storage ─────────────────────────────────────────────
  getStorage: async ({ request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const cfg = await getStorageConfig();

    return {
      status: 200,
      body: {
        storageType: cfg.storageType as "filesystem" | "s3",
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
        locationLat: cfg.locationLat,
        locationLon: cfg.locationLon,
        locationLabel: cfg.locationLabel,
      },
    };
  },

  // ── PUT /api/admin/settings/storage ─────────────────────────────────────────────
  updateStorage: async ({ body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    if (body.s3?.enabled) {
      const { region, bucket, accessKeyId, secretAccessKey } = body.s3;
      if (!region || !bucket) {
        throw new APIException(
          "MALFORMED",
          "region and bucket are required when enabling S3"
        );
      }
      if (!accessKeyId) {
        throw new APIException(
          "MALFORMED",
          "accessKeyId is required when enabling S3"
        );
      }
      // secretAccessKey is only required if not already saved
      if (
        !secretAccessKey &&
        !(await SettingsDAO.get("s3_secret_access_key_enc"))
      ) {
        throw new APIException(
          "MALFORMED",
          "secretAccessKey is required when enabling S3 for the first time"
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
    return {
      status: 200,
      body: {
        ok: true,
        storageType: updated.storageType,
        s3: {
          enabled: updated.s3Enabled,
          bucket: updated.s3Bucket,
          region: updated.s3Region,
          accessKeyId: updated.s3AccessKeyId ?? "",
          configured: !!(updated.s3Bucket && updated.s3AccessKeyId),
        },
      },
    };
  },
});

export const GET = handlers.GET!;
export const PUT = handlers.PUT!;
