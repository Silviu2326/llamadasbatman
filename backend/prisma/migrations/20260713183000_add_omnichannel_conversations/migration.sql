-- Omnichannel conversation core. Additive migration only: no existing table
-- or column is removed or rewritten.

CREATE TABLE "ChannelIdentity" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "leadId" TEXT,
    "channel" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT,
    "externalIdentityId" TEXT,
    "address" TEXT NOT NULL,
    "displayName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChannelIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "leadId" TEXT,
    "assignedUserId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'mixed',
    "provider" TEXT,
    "address" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "subject" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "lastInboundAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalTemplateId" TEXT,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'es',
    "category" TEXT NOT NULL DEFAULT 'utility',
    "body" TEXT NOT NULL,
    "variablesSchema" JSONB,
    "approvalStatus" TEXT NOT NULL DEFAULT 'draft',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "leadId" TEXT,
    "authorUserId" TEXT,
    "templateId" TEXT,
    "replyToId" TEXT,
    "channel" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "address" TEXT,
    "direction" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'text',
    "body" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "providerMessageId" TEXT,
    "externalEventId" TEXT,
    "metadata" JSONB,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeliveryAttempt" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "idempotencyKey" TEXT,
    "providerMessageId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "nextRetryAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContactConsent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "leadId" TEXT,
    "channelIdentityId" TEXT,
    "channel" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'contact',
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "source" TEXT NOT NULL,
    "evidence" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContactConsent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "externalEventId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "eventType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "metadata" JSONB,
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "conversationId" TEXT,
    "triggerEventId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "nextRunAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NextBestAction" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "leadId" TEXT,
    "acceptedById" TEXT,
    "type" TEXT NOT NULL,
    "channel" TEXT,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "metadata" JSONB,
    "expiresAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NextBestAction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChannelIdentity_orgId_provider_address_key" ON "ChannelIdentity"("orgId", "provider", "address");
CREATE INDEX "ChannelIdentity_provider_channel_address_idx" ON "ChannelIdentity"("provider", "channel", "address");
CREATE INDEX "ChannelIdentity_leadId_idx" ON "ChannelIdentity"("leadId");
CREATE UNIQUE INDEX "Conversation_orgId_channel_address_key" ON "Conversation"("orgId", "channel", "address");
CREATE INDEX "Conversation_orgId_status_updatedAt_idx" ON "Conversation"("orgId", "status", "updatedAt");
CREATE INDEX "Conversation_orgId_assignedUserId_updatedAt_idx" ON "Conversation"("orgId", "assignedUserId", "updatedAt");
CREATE INDEX "Conversation_leadId_idx" ON "Conversation"("leadId");
CREATE UNIQUE INDEX "MessageTemplate_orgId_channel_name_language_key" ON "MessageTemplate"("orgId", "channel", "name", "language");
CREATE INDEX "MessageTemplate_orgId_channel_approvalStatus_idx" ON "MessageTemplate"("orgId", "channel", "approvalStatus");
CREATE UNIQUE INDEX "Message_provider_providerMessageId_key" ON "Message"("provider", "providerMessageId");
CREATE UNIQUE INDEX "Message_orgId_externalEventId_key" ON "Message"("orgId", "externalEventId");
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");
CREATE INDEX "Message_orgId_status_createdAt_idx" ON "Message"("orgId", "status", "createdAt");
CREATE INDEX "Message_leadId_idx" ON "Message"("leadId");
CREATE INDEX "Message_authorUserId_idx" ON "Message"("authorUserId");
CREATE INDEX "Message_templateId_idx" ON "Message"("templateId");
CREATE INDEX "Message_replyToId_idx" ON "Message"("replyToId");
CREATE UNIQUE INDEX "DeliveryAttempt_messageId_attemptNo_key" ON "DeliveryAttempt"("messageId", "attemptNo");
CREATE UNIQUE INDEX "DeliveryAttempt_provider_idempotencyKey_key" ON "DeliveryAttempt"("provider", "idempotencyKey");
CREATE INDEX "DeliveryAttempt_status_nextRetryAt_idx" ON "DeliveryAttempt"("status", "nextRetryAt");
CREATE INDEX "DeliveryAttempt_providerMessageId_idx" ON "DeliveryAttempt"("providerMessageId");
CREATE UNIQUE INDEX "ContactConsent_orgId_leadId_channel_purpose_key" ON "ContactConsent"("orgId", "leadId", "channel", "purpose");
CREATE UNIQUE INDEX "ContactConsent_orgId_channelIdentityId_channel_purpose_key" ON "ContactConsent"("orgId", "channelIdentityId", "channel", "purpose");
CREATE INDEX "ContactConsent_orgId_channel_status_idx" ON "ContactConsent"("orgId", "channel", "status");
CREATE INDEX "ContactConsent_leadId_idx" ON "ContactConsent"("leadId");
CREATE INDEX "ContactConsent_channelIdentityId_idx" ON "ContactConsent"("channelIdentityId");
CREATE UNIQUE INDEX "WebhookEvent_externalEventId_key" ON "WebhookEvent"("externalEventId");
CREATE INDEX "WebhookEvent_provider_channel_receivedAt_idx" ON "WebhookEvent"("provider", "channel", "receivedAt");
CREATE INDEX "WebhookEvent_orgId_status_receivedAt_idx" ON "WebhookEvent"("orgId", "status", "receivedAt");
CREATE UNIQUE INDEX "AutomationRun_orgId_automationId_triggerEventId_key" ON "AutomationRun"("orgId", "automationId", "triggerEventId");
CREATE INDEX "AutomationRun_orgId_status_nextRunAt_idx" ON "AutomationRun"("orgId", "status", "nextRunAt");
CREATE INDEX "AutomationRun_conversationId_idx" ON "AutomationRun"("conversationId");
CREATE INDEX "OutboxEvent_status_availableAt_idx" ON "OutboxEvent"("status", "availableAt");
CREATE INDEX "OutboxEvent_orgId_aggregateType_aggregateId_idx" ON "OutboxEvent"("orgId", "aggregateType", "aggregateId");
CREATE INDEX "OutboxEvent_pending_available_idx" ON "OutboxEvent"("availableAt") WHERE "status" = 'pending';
CREATE INDEX "NextBestAction_orgId_status_score_idx" ON "NextBestAction"("orgId", "status", "score");
CREATE INDEX "NextBestAction_conversationId_status_idx" ON "NextBestAction"("conversationId", "status");
CREATE INDEX "NextBestAction_leadId_idx" ON "NextBestAction"("leadId");
CREATE INDEX "NextBestAction_acceptedById_idx" ON "NextBestAction"("acceptedById");
CREATE UNIQUE INDEX "Call_orgId_externalCallId_key" ON "Call"("orgId", "externalCallId");

ALTER TABLE "ChannelIdentity" ADD CONSTRAINT "ChannelIdentity_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChannelIdentity" ADD CONSTRAINT "ChannelIdentity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeliveryAttempt" ADD CONSTRAINT "DeliveryAttempt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactConsent" ADD CONSTRAINT "ContactConsent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactConsent" ADD CONSTRAINT "ContactConsent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContactConsent" ADD CONSTRAINT "ContactConsent_channelIdentityId_fkey" FOREIGN KEY ("channelIdentityId") REFERENCES "ChannelIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NextBestAction" ADD CONSTRAINT "NextBestAction_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NextBestAction" ADD CONSTRAINT "NextBestAction_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NextBestAction" ADD CONSTRAINT "NextBestAction_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NextBestAction" ADD CONSTRAINT "NextBestAction_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
