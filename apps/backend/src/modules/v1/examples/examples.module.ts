import { Module } from "@nestjs/common"

import { FeaturePreviewModule } from "./feature-preview/feature-preview.module"

@Module({
	imports: [FeaturePreviewModule],
})
export class ExamplesModule {}
