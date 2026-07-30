import { Global, Module } from '@nestjs/common';
import { I18n } from './i18n';

@Global()
@Module({
  providers: [
    {
      provide: I18n,
      useFactory: () => new I18n(),
    },
  ],
  exports: [I18n],
})
export class I18nModule {}
