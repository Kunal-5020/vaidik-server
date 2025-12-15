import { Module, forwardRef } from '@nestjs/common'; // ✅ Import forwardRef
import { MongooseModule } from '@nestjs/mongoose';
import { RemediesController } from './controllers/remedies.controller';
import { AstrologerRemediesController } from './controllers/astrologer-remedies.controller';
import { RemediesService } from './services/remedies.service';
import { Remedy, RemedySchema } from './schemas/remedies.schema';
import { ShopifyModule } from '../shopify/shopify.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Remedy.name, schema: RemedySchema },
    ]),
    forwardRef(() => ShopifyModule),
  ],
  controllers: [RemediesController, AstrologerRemediesController],
  providers: [RemediesService],
  exports: [RemediesService],  
})
export class RemediesModule {}
