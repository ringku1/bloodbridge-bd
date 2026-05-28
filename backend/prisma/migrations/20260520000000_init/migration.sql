-- CreateEnum
CREATE TYPE "BloodGroup" AS ENUM ('A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'O_POS', 'O_NEG', 'AB_POS', 'AB_NEG');

-- CreateEnum
CREATE TYPE "VerifiedStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('OPEN', 'MATCHED', 'FULFILLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ResponseStatus" AS ENUM ('NOTIFIED', 'ACCEPTED', 'REJECTED', 'DONATED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "passwordHash" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT,
    "nidPhotoUrl" TEXT,
    "verifiedStatus" "VerifiedStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "bloodGroup" "BloodGroup",
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "district" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "lastDonatedAt" TIMESTAMP(3),
    "eligibleAgainAt" TIMESTAMP(3),
    "fcmToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BloodRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "bloodGroup" "BloodGroup" NOT NULL,
    "hospitalName" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "unitsNeeded" INTEGER NOT NULL DEFAULT 1,
    "status" "RequestStatus" NOT NULL DEFAULT 'OPEN',
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "escalatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BloodRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DonorResponse" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "donorId" TEXT NOT NULL,
    "status" "ResponseStatus" NOT NULL DEFAULT 'NOTIFIED',
    "notifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "donatedConfirmedAt" TIMESTAMP(3),

    CONSTRAINT "DonorResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Caregiver" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Caregiver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favourite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "favouriteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favourite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_verifiedStatus_idx" ON "User"("verifiedStatus");

-- CreateIndex
CREATE INDEX "User_isAvailable_verifiedStatus_idx" ON "User"("isAvailable", "verifiedStatus");

-- CreateIndex
CREATE INDEX "BloodRequest_status_idx" ON "BloodRequest"("status");

-- CreateIndex
CREATE INDEX "BloodRequest_requesterId_idx" ON "BloodRequest"("requesterId");

-- CreateIndex
CREATE INDEX "BloodRequest_status_escalationLevel_idx" ON "BloodRequest"("status", "escalationLevel");

-- CreateIndex
CREATE INDEX "DonorResponse_donorId_idx" ON "DonorResponse"("donorId");

-- CreateIndex
CREATE INDEX "DonorResponse_requestId_idx" ON "DonorResponse"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "DonorResponse_requestId_donorId_key" ON "DonorResponse"("requestId", "donorId");

-- CreateIndex
CREATE UNIQUE INDEX "Caregiver_userId_phone_key" ON "Caregiver"("userId", "phone");

-- CreateIndex
CREATE INDEX "Favourite_userId_idx" ON "Favourite"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Favourite_userId_favouriteId_key" ON "Favourite"("userId", "favouriteId");

-- AddForeignKey
ALTER TABLE "BloodRequest" ADD CONSTRAINT "BloodRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonorResponse" ADD CONSTRAINT "DonorResponse_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "BloodRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonorResponse" ADD CONSTRAINT "DonorResponse_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Caregiver" ADD CONSTRAINT "Caregiver_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favourite" ADD CONSTRAINT "Favourite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favourite" ADD CONSTRAINT "Favourite_favouriteId_fkey" FOREIGN KEY ("favouriteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

