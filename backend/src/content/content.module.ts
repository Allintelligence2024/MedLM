import { Module } from "@nestjs/common";
import { ContentService } from "./content.service";
import { ContentController } from "./content.controller";
import { BillingModule } from "../billing/billing.module";
import { MEDIA_PRESIGNER, envMediaPresigner } from "./media-storage";

@Module({
  imports: [BillingModule],
  providers: [
    ContentService,
    { provide: MEDIA_PRESIGNER, useFactory: envMediaPresigner },
  ],
  controllers: [ContentController],
  exports: [ContentService],
})
export class ContentModule {}
