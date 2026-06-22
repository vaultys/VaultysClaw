import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { decryptSecret } from "@/lib/vault";
import { SettingsDAO } from "@/db";
import { getStorageConfig } from "@/db/settings.dao";
import { settingsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

// Body fields are optional — omit any to fall back to the saved (DB) config.
// secretAccessKey is decrypted from the DB when not supplied in the body.
const handlers = createNextRoute(settingsContract, {
  testStorage: async ({ body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

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
      throw new APIException(
        "MALFORMED",
        "bucket, accessKeyId and secretAccessKey are required"
      );
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

      return {
        status: 200,
        body: { ok: true, latency: Date.now() - start, bucket, region },
      };
    } catch (err) {
      const latency = Date.now() - start;
      const status = (err as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;

      // 403 → credentials are valid but missing s3:HeadBucket permission
      if (status === 403) {
        return {
          status: 200,
          body: {
            ok: false,
            latency,
            error: "Connected but access denied — check bucket permissions",
          },
        };
      }
      // 404 → credentials valid, bucket missing
      if (status === 404) {
        return {
          status: 200,
          body: { ok: false, latency, error: `Bucket "${bucket}" not found` },
        };
      }

      return {
        status: 200,
        body: {
          ok: false,
          latency,
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
  },
});

export const POST = handlers.POST!;
