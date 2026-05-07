-- DropForeignKey
ALTER TABLE "Caregiver" DROP CONSTRAINT "Caregiver_userId_fkey";

-- DropForeignKey
ALTER TABLE "DonorResponse" DROP CONSTRAINT "DonorResponse_donorId_fkey";

-- DropForeignKey
ALTER TABLE "DonorResponse" DROP CONSTRAINT "DonorResponse_requestId_fkey";

-- CreateIndex
CREATE INDEX "BloodRequest_status_idx" ON "BloodRequest"("status");

-- CreateIndex
CREATE INDEX "BloodRequest_requesterId_idx" ON "BloodRequest"("requesterId");

-- CreateIndex
CREATE INDEX "BloodRequest_status_escalationLevel_idx" ON "BloodRequest"("status", "escalationLevel");

-- CreateIndex
CREATE UNIQUE INDEX "Caregiver_userId_phone_key" ON "Caregiver"("userId", "phone");

-- CreateIndex
CREATE INDEX "DonorResponse_donorId_idx" ON "DonorResponse"("donorId");

-- CreateIndex
CREATE INDEX "DonorResponse_requestId_idx" ON "DonorResponse"("requestId");

-- CreateIndex
CREATE INDEX "User_verifiedStatus_idx" ON "User"("verifiedStatus");

-- CreateIndex
CREATE INDEX "User_isAvailable_verifiedStatus_idx" ON "User"("isAvailable", "verifiedStatus");

-- AddForeignKey
ALTER TABLE "DonorResponse" ADD CONSTRAINT "DonorResponse_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "BloodRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonorResponse" ADD CONSTRAINT "DonorResponse_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Caregiver" ADD CONSTRAINT "Caregiver_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
