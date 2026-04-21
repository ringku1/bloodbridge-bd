// services/s3Service.js
//
// Generates AWS S3 presigned URLs for NID photo uploads.
//
// Why presigned URLs instead of uploading through the backend?
//   If the mobile app sent the photo to our backend first, the backend would then
//   upload it to S3. This wastes bandwidth — the file travels twice.
//   With a presigned URL:
//     1. Backend generates a special temporary URL (valid 10 minutes)
//     2. Mobile app uploads DIRECTLY to S3 using that URL
//     3. Backend never handles the file bytes — just the S3 key (file path)
//
// How to get AWS credentials:
//   1. AWS Console → IAM → Create User → attach policy "AmazonS3FullAccess" (or scoped)
//   2. Generate access key → put in .env (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
//   3. Create an S3 bucket in region ap-southeast-1 (Singapore, closest to Bangladesh)
//   4. Set bucket name in .env (AWS_S3_BUCKET)

const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { PutObjectCommand }           = require('@aws-sdk/client-s3');
const { getSignedUrl }               = require('@aws-sdk/s3-request-presigner');
const { randomUUID }                 = require('crypto');

const s3 = new S3Client({
  region:      process.env.AWS_REGION || 'ap-southeast-1',
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.AWS_S3_BUCKET;

// Generate a presigned PUT URL so the mobile app can upload directly to S3.
// Returns: { uploadUrl, s3Key }
//   uploadUrl — the mobile app sends an HTTP PUT request to this URL with the file
//   s3Key     — the file's path in S3 (saved to User.nidPhotoUrl after upload)
async function generateUploadUrl(userId) {
  // Unique key per upload: nid-photos/<userId>/<uuid>.jpg
  // Including userId in the path makes it easy to find a user's NID photo later.
  const s3Key = `nid-photos/${userId}/${randomUUID()}.jpg`;

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
// Not exposed as a public API — only used internally by the admin route.
async function generateViewUrl(s3Key) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: s3Key });
  // View URL expires in 15 minutes
  return getSignedUrl(s3, command, { expiresIn: 900 });
}

module.exports = { generateUploadUrl, generateViewUrl };
