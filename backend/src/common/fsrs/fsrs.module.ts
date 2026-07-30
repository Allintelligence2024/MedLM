/// Module NestJS — expose `FsrsEngine` comme injectable.
import { Global, Module } from '@nestjs/common';
import { FsrsEngine } from './fsrs.engine';

@Global()
@Module({
  providers: [
    {
      provide: FsrsEngine,
      useFactory: (): FsrsEngine => new FsrsEngine(),
    },
  ],
  exports: [FsrsEngine],
})
export class FsrsModule {}
