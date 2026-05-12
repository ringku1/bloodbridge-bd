-- Add mutual phone-reveal flags to DonorResponse
-- When both parties reveal, each can see the other's real phone number.
ALTER TABLE "DonorResponse" ADD COLUMN "donorRevealed"     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DonorResponse" ADD COLUMN "requesterRevealed" BOOLEAN NOT NULL DEFAULT false;
