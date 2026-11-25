import { Global, Module } from "@nestjs/common"

import { ConversationLiveService } from "./conversation-live.service"

@Global()
@Module({ providers: [ConversationLiveService], exports: [ConversationLiveService] })
export class ConversationLiveModule {}
