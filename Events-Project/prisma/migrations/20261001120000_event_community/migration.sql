-- CreateTable
CREATE TABLE "CommunityEntry" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityVote" (
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "option" INTEGER NOT NULL,

    CONSTRAINT "CommunityVote_pkey" PRIMARY KEY ("entryId","userId")
);

-- CreateTable
CREATE TABLE "CommunityQueueTicket" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityQueueTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityTeamMember" (
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CommunityTeamMember_pkey" PRIMARY KEY ("eventId","userId")
);

-- CreateTable
CREATE TABLE "CommunityClaim" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CommunityClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityFeedback" (
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,

    CONSTRAINT "CommunityFeedback_pkey" PRIMARY KEY ("eventId","userId")
);

-- CreateTable
CREATE TABLE "FriendsRoom" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FriendsRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FriendsRoomMember" (
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "FriendsRoomMember_pkey" PRIMARY KEY ("roomId","userId")
);

-- CreateTable
CREATE TABLE "FriendsSuggestion" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "FriendsSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FriendsVote" (
    "suggestionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "FriendsVote_pkey" PRIMARY KEY ("suggestionId","userId")
);

-- CreateTable
CREATE TABLE "CommunitySignal" (
    "id" SERIAL NOT NULL,
    "room" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "CommunitySignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunityEntry_eventId_kind_createdAt_idx" ON "CommunityEntry"("eventId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityQueueTicket_entryId_status_createdAt_idx" ON "CommunityQueueTicket"("entryId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityQueueTicket_entryId_userId_key" ON "CommunityQueueTicket"("entryId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityClaim_entryId_userId_key" ON "CommunityClaim"("entryId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "FriendsSuggestion_roomId_eventId_key" ON "FriendsSuggestion"("roomId", "eventId");

-- CreateIndex
CREATE INDEX "CommunitySignal_createdAt_idx" ON "CommunitySignal"("createdAt");

-- CreateIndex
CREATE INDEX "CommunitySignal_deliveredAt_id_idx" ON "CommunitySignal"("deliveredAt", "id");

-- AddForeignKey
ALTER TABLE "CommunityEntry" ADD CONSTRAINT "CommunityEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityVote" ADD CONSTRAINT "CommunityVote_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CommunityEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityVote" ADD CONSTRAINT "CommunityVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityQueueTicket" ADD CONSTRAINT "CommunityQueueTicket_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CommunityEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityQueueTicket" ADD CONSTRAINT "CommunityQueueTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityTeamMember" ADD CONSTRAINT "CommunityTeamMember_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityTeamMember" ADD CONSTRAINT "CommunityTeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityClaim" ADD CONSTRAINT "CommunityClaim_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CommunityEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityClaim" ADD CONSTRAINT "CommunityClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityFeedback" ADD CONSTRAINT "CommunityFeedback_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityFeedback" ADD CONSTRAINT "CommunityFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendsRoom" ADD CONSTRAINT "FriendsRoom_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendsRoomMember" ADD CONSTRAINT "FriendsRoomMember_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "FriendsRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendsRoomMember" ADD CONSTRAINT "FriendsRoomMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendsSuggestion" ADD CONSTRAINT "FriendsSuggestion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendsSuggestion" ADD CONSTRAINT "FriendsSuggestion_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "FriendsRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendsSuggestion" ADD CONSTRAINT "FriendsSuggestion_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendsVote" ADD CONSTRAINT "FriendsVote_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "FriendsSuggestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendsVote" ADD CONSTRAINT "FriendsVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
