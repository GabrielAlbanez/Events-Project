-- CreateTable
CREATE TABLE "EventChatMessage" (
    "id" SERIAL NOT NULL,
    "eventId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventChatMessage_eventId_id_idx" ON "EventChatMessage"("eventId", "id");

-- CreateIndex
CREATE INDEX "EventChatMessage_authorId_createdAt_idx" ON "EventChatMessage"("authorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EventChatMessage_eventId_authorId_clientId_key" ON "EventChatMessage"("eventId", "authorId", "clientId");

-- AddForeignKey
ALTER TABLE "EventChatMessage" ADD CONSTRAINT "EventChatMessage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventChatMessage" ADD CONSTRAINT "EventChatMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

