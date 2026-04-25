// services/s3Service.js
//
// Generates AWS S3 presigned URLs for NID photo uploads.
//
// Why presigned URLs instead of uploading through the backend?
//   The mobile app uploads directly to S3 — the file never passes through
//   our server. This saves bandwidth and keeps the backend fast.
//
//   Flow:
//     1. Backend generates a presigned PUT URL (valid 10 minutes)
//     2. Mobile uploads the photo directly to S3/MinIO using that URL
//     3. Mobile sends just the S3 key (a short string) to the backend
//     4. Backend stores the key in User.nidPhotoUrl
//
// In development: AWS_ENDPOINT points the SDK at MinIO (local S3 in Docker).
// In production:  Remove AWS_ENDPOINT — the SDK routes to real AWS automatically.

const { S3Client, GetObjectCommand, PutObjectCommand,
        CreateBucketCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { randomUUID }   = require('crypto');

const baseCredentials = {
  region:      process.env.AWS_REGION || 'ap-southeast-1',
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
};

// Internal client — used for backend→MinIO operations (bucket creation, direct puts).
// Uses Docker-internal endpoint (http://minio:9000).
const s3Config = { ...baseCredentials };
if (process.env.AWS_ENDPOINT) {
  s3Config.endpoint       = process.env.AWS_ENDPOINT;
  s3Config.forcePathStyle = true;
}
const s3 = new S3Client(s3Config);

// Public client — used ONLY for generating presigned upload URLs returned to mobile.
// Presigned URLs embed the host in the HMAC signature; if the URL's host doesn't match
// the host the mobile device will connect to, MinIO rejects with SignatureDoesNotMatch.
// Using MINIO_PUBLIC_URL here ensures the signature is computed with the LAN-accessible
// host so the mobile PUT succeeds.
const s3PublicConfig = { ...baseCredentials };
if (process.env.MINIO_PUBLIC_URL) {
  s3PublicConfig.endpoint       = process.env.MINIO_PUBLIC_URL;
  s3PublicConfig.forcePathStyle = true;
} else if (process.env.AWS_ENDPOINT) {
  s3PublicConfig.endpoint       = process.env.AWS_ENDPOINT;
  s3PublicConfig.forcePathStyle = true;
}
const s3Public = new S3Client(s3PublicConfig);

const BUCKET = process.env.AWS_S3_BUCKET;

// Called once at server startup (from server.js).
// Creates the bucket if it doesn't exist — safe to call repeatedly (no-op if exists).
// In production (real AWS) the bucket is created manually; this mainly helps MinIO dev.
async function ensureBucketExists() {
  if (!BUCKET) return;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
    console.log(`[S3] Bucket "${BUCKET}" ready`);
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
      console.log(`[S3] Bucket "${BUCKET}" created`);
    } else {
      // Credentials missing or MinIO not yet reachable — log and continue.
      // The bucket check will happen again on the next request.
      console.warn(`[S3] Could not verify bucket: ${err.message}`);
    }
  }
}

// Generate a presigned PUT URL so the mobile app can upload directly to S3.
// Returns: { uploadUrl, s3Key }
async function generateUploadUrl(userId) {
  const s3Key  = `nid-photos/${userId}/${randomUUID()}.jpg`;
  const command = new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         s3Key,
    ContentType: 'image/jpeg',
  });

  // Use s3Public so the presigned URL is signed with the LAN-accessible host.
  // MinIO re-derives the expected signature from the incoming Host header, so the
  // client's Host must match the host used when signing — using s3Public ensures that.
  const uploadUrl = await getSignedUrl(s3Public, command, { expiresIn: 600 });
  return { uploadUrl, s3Key };
}

// Generate a presigned GET URL so admins can view the NID photo.
// Used internally by the admin route only — not exposed as a public endpoint.
async function generateViewUrl(s3Key) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: s3Key });
  return getSignedUrl(s3, command, { expiresIn: 900 }); // 15 minutes
}

module.exports = { ensureBucketExists, generateUploadUrl, generateViewUrl };
