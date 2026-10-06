-- CreateTable
CREATE TABLE "PartyProfile" (
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "displayName" TEXT NOT NULL,
    "photoUrl" TEXT NOT NULL DEFAULT '',
    "bio" TEXT NOT NULL DEFAULT '',
    "interests" TEXT[],
    "intent" TEXT NOT NULL,
    "adultDeclared" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartyProfile_pkey" PRIMARY KEY ("eventId","userId")
);

-- CreateTable
CREATE TABLE "PartyLike" (
    "eventId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartyLike_pkey" PRIMARY KEY ("eventId","fromId","toId")
);

-- CreateTable
CREATE TABLE "PartyMatch" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartyMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartyBlock" (
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,

    CONSTRAINT "PartyBlock_pkey" PRIMARY KEY ("fromId","toId")
);

-- CreateTable
CREATE TABLE "PartyMessage" (
    "id" SERIAL NOT NULL,
    "matchId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartyMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartyReport" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "PartyReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartyLike_fromId_createdAt_idx" ON "PartyLike"("fromId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PartyMatch_eventId_userAId_userBId_key" ON "PartyMatch"("eventId", "userAId", "userBId");

-- CreateIndex
CREATE INDEX "PartyMessage_matchId_id_idx" ON "PartyMessage"("matchId", "id");

-- CreateIndex
CREATE INDEX "PartyMessage_authorId_createdAt_idx" ON "PartyMessage"("authorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PartyMessage_matchId_authorId_clientId_key" ON "PartyMessage"("matchId", "authorId", "clientId");

-- CreateIndex
CREATE INDEX "PartyReport_status_createdAt_idx" ON "PartyReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PartyReport_reporterId_createdAt_idx" ON "PartyReport"("reporterId", "createdAt");

-- AddForeignKey
ALTER TABLE "PartyProfile" ADD CONSTRAINT "PartyProfile_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyProfile" ADD CONSTRAINT "PartyProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyLike" ADD CONSTRAINT "PartyLike_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyLike" ADD CONSTRAINT "PartyLike_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyLike" ADD CONSTRAINT "PartyLike_toId_fkey" FOREIGN KEY ("toId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyMatch" ADD CONSTRAINT "PartyMatch_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyMatch" ADD CONSTRAINT "PartyMatch_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyMatch" ADD CONSTRAINT "PartyMatch_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyBlock" ADD CONSTRAINT "PartyBlock_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyBlock" ADD CONSTRAINT "PartyBlock_toId_fkey" FOREIGN KEY ("toId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyMessage" ADD CONSTRAINT "PartyMessage_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "PartyMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyMessage" ADD CONSTRAINT "PartyMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyReport" ADD CONSTRAINT "PartyReport_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyReport" ADD CONSTRAINT "PartyReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyReport" ADD CONSTRAINT "PartyReport_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

