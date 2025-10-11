import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RemediesController } from './controllers/remedies.controller';
import { AstrologerRemediesController } from './controllers/astrologer-remedies.controller';
import { RemediesService } from './services/remedies.service';
import { Remedy, RemedySchema } from './schemas/remedies.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Remedy.name, schema: RemedySchema },
    ]),
  ],
  controllers: [RemediesController, AstrologerRemediesController],
  providers: [RemediesService],
  exports: [RemediesService],
})
export class RemediesModule {}
