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

const s3Config = {
  region:      process.env.AWS_REGION || 'ap-southeast-1',
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
};

if (process.env.AWS_ENDPOINT) {
  s3Config.endpoint       = process.env.AWS_ENDPOINT;
  s3Config.forcePathStyle = true; // MinIO requires path-style URLs (not virtual-hosted)
}

const s3     = new S3Client(s3Config);
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

  // URL expires in 10 minutes — enough time for the mobile app to upload
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 600 });
  return { uploadUrl, s3Key };
}

// Generate a presigned GET URL so admins can view the NID photo.
// Used internally by the admin route only — not exposed as a public endpoint.
async function generateViewUrl(s3Key) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: s3Key });
  return getSignedUrl(s3, command, { expiresIn: 900 }); // 15 minutes
}

module.exports = { ensureBucketExists, generateUploadUrl, generateViewUrl };
