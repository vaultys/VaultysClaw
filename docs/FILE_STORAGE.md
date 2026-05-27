# File Storage Configuration

VaultysClaw supports multiple file storage backends for knowledge files: **Filesystem** (default) and **S3-compatible storage** (AWS S3, MinIO, etc.).

## Architecture

Knowledge files are stored externally (filesystem or S3) with metadata and paths tracked in the SQLite database:

```
Knowledge Files Table:
┌─────────────────────────────────────────────┐
│ id      │ source_id │ name  │ file_path     │
├─────────────────────────────────────────────┤
│ kf-123  │ ks-456    │ doc.pdf │ sources/ks-456/kf-123_doc.pdf │
└─────────────────────────────────────────────┘
           ↓
     [File Storage]
     ┌──────────────────────────────────────┐
     │ Filesystem: /data/knowledge-files/   │
     │ or S3 Bucket: vaultysclaw-knowledge  │
     └──────────────────────────────────────┘
```

## Default: Filesystem Storage

Files are stored on the local filesystem with metadata tracked in the database.

### Configuration

**Environment Variables:**
```bash
VAULTYS_STORAGE_TYPE=filesystem      # Default
VAULTYS_STORAGE_DIR=./data/knowledge-files
```

### Usage

No additional setup required. Files are automatically stored in `VAULTYS_STORAGE_DIR`.

```bash
# Default data directory structure:
data/
├── vaultysclaw.db
└── knowledge-files/
    └── sources/
        ├── ks-abc123/
        │   ├── kf-001_document.pdf
        │   └── kf-002_spreadsheet.xlsx
        └── ks-def456/
            └── kf-003_image.png
```

## S3-Compatible Storage

Store files in AWS S3, MinIO, or other S3-compatible services.

### Quick Start with MinIO (Docker)

MinIO is an S3-compatible object storage server ideal for development.

**1. Start MinIO:**

```bash
docker run -d \
  --name minio \
  -p 9000:9000 \
  -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio:latest \
  minio server /data --console-address :9001
```

Or with Docker Compose:

```yaml
version: '3.8'

services:
  minio:
    image: minio/minio:latest
    container_name: vaultysclaw-minio
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    command: minio server /data --console-address :9001
    volumes:
      - minio-data:/data

volumes:
  minio-data:
```

**2. Create bucket:**

Access MinIO console at `http://localhost:9001` (credentials: `minioadmin` / `minioadmin`)

- Create a new bucket named `vaultysclaw-knowledge`

**3. Configure environment:**

```bash
VAULTYS_STORAGE_TYPE=s3
VAULTYS_S3_REGION=us-east-1
VAULTYS_S3_BUCKET=vaultysclaw-knowledge
VAULTYS_S3_ENDPOINT=http://localhost:9000
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
```

**4. Configure via API:**

```bash
curl -X PUT http://localhost:3000/api/settings/storage \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "s3": {
      "enabled": true,
      "region": "us-east-1",
      "bucket": "vaultysclaw-knowledge",
      "endpoint": "http://localhost:9000"
    }
  }'
```

### AWS S3 Configuration

For production AWS S3:

**1. Create S3 bucket:**

```bash
aws s3api create-bucket \
  --bucket vaultysclaw-knowledge \
  --region us-east-1
```

**2. Create IAM user with S3 permissions:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:HeadObject"
      ],
      "Resource": "arn:aws:s3:::vaultysclaw-knowledge/*"
    }
  ]
}
```

**3. Set environment variables:**

```bash
VAULTYS_STORAGE_TYPE=s3
VAULTYS_S3_REGION=us-east-1
VAULTYS_S3_BUCKET=vaultysclaw-knowledge
AWS_ACCESS_KEY_ID=<IAM user access key>
AWS_SECRET_ACCESS_KEY=<IAM user secret key>
# VAULTYS_S3_ENDPOINT is omitted for AWS S3
```

## Managing Storage Configuration

### Get Current Configuration

```bash
curl http://localhost:3000/api/settings/storage \
  -H "Authorization: Bearer <admin-token>"
```

Response:
```json
{
  "storageType": "filesystem",
  "filesystem": {
    "directory": "/data/knowledge-files"
  },
  "s3": {
    "enabled": false,
    "configured": false
  }
}
```

### Update S3 Configuration

```bash
curl -X PUT http://localhost:3000/api/settings/storage \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "s3": {
      "enabled": true,
      "region": "us-east-1",
      "bucket": "my-bucket",
      "endpoint": "http://minio:9000"  // optional
    }
  }'
```

### Disable S3 (Revert to Filesystem)

```bash
curl -X PUT http://localhost:3000/api/settings/storage \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "s3": {
      "enabled": false
    }
  }'
```

## Migrating Existing Files

If upgrading from the old BLOB storage:

### Automatic Migration on Upload

New files uploaded after the update will automatically use the new storage system.

### Manual Migration of Existing Files

Run the migration endpoint to move existing BLOB files to filesystem/S3:

```bash
curl -X POST http://localhost:3000/api/settings/storage/migrate \
  -H "Authorization: Bearer <admin-token>"
```

The endpoint migrates files in batches (100 at a time):

```json
{
  "success": true,
  "migratedCount": 100,
  "errorCount": 0,
  "hasMore": true,
  "message": "Migrated 100 file(s)"
}
```

Repeat the request until `hasMore` is `false`.

## File Path Structure

Files are organized by source in both filesystem and S3:

```
sources/{sourceId}/{fileId}_{filename}

Example:
sources/ks-abc123/kf-001_document.pdf
sources/ks-abc123/kf-002_image.png
sources/ks-def456/kf-003_data.csv
```

This structure:
- Prevents name collisions across sources
- Makes file cleanup easier (delete all files for a source)
- Is compatible with both filesystem and S3 (S3 treats `/` as hierarchy)

## Backward Compatibility

The system supports mixed storage during migration:

- **Old BLOB files** (content in database): Read from database on-the-fly
- **New files** (file_path set): Read from storage backend

This allows gradual migration without downtime.

## Performance Notes

### Filesystem Storage
- Lowest latency for local development
- Files on the same disk as database
- No network overhead
- Suitable for single-machine deployments

### S3 Storage
- Slightly higher latency (network round-trip)
- Scales to unlimited storage
- Data replicated across availability zones (AWS)
- Cost per GB (roughly $0.023/GB/month on S3)
- Better for multi-machine deployments

## Cleanup

### Remove Old BLOB Data

After migrating all files to filesystem/S3 and verifying:

```sql
-- Check if any files still have content BLOBs
SELECT COUNT(*) FROM knowledge_files WHERE content IS NOT NULL;

-- Clear old BLOB data (CAREFUL: verify migration first)
UPDATE knowledge_files SET content = NULL WHERE file_path IS NOT NULL;
```

### Reclaim Disk Space

For SQLite:

```bash
# Compact the database
sqlite3 data/vaultysclaw.db "VACUUM;"
```

For filesystem:

```bash
# Check storage usage
du -sh data/knowledge-files/

# Example: Remove a specific source's files
rm -rf data/knowledge-files/sources/ks-{sourceId}/
```

## Troubleshooting

### Files not found after storage change

Ensure all files have been migrated before switching storage backends. Check the file_path column:

```sql
SELECT COUNT(*) FROM knowledge_files WHERE file_path IS NULL AND content IS NOT NULL;
```

If non-zero, run the migration endpoint.

### S3 connection errors

Verify credentials and endpoint:
- AWS credentials are set in environment or IAM role
- MinIO endpoint is reachable
- Bucket exists and is accessible
- Check application logs for detailed error messages

### Large file uploads slow

For uploads >10MB:
- Increase NextRequest timeout in server configuration
- Consider uploading directly to S3 via presigned URLs (future enhancement)
- Check network bandwidth between client and storage

## Future Enhancements

- [ ] Presigned S3 URLs for direct client uploads
- [ ] Multi-part upload for large files
- [ ] Storage quota per realm
- [ ] Automatic cleanup of orphaned files
- [ ] Encryption at rest (S3 server-side encryption)
- [ ] Bandwidth throttling
