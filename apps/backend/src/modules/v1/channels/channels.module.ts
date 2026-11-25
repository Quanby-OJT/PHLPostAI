import { Module } from "@nestjs/common"

import { RbacModule } from "@/common/rbac/rbac.module"

import { ChannelsController } from "./channels.controller"
import { ChannelsAdminService } from "./channels.service"

@Module({
	imports: [RbacModule],
	controllers: [ChannelsController],
	providers: [ChannelsAdminService],
})
export class ChannelsModule {}
