import { Module, forwardRef } from '@nestjs/common'; // ✅ Import forwardRef
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';

// Services
import { ShopifyService } from './services/shopify.service';
import { ShopifyOrdersService } from './services/shopify-orders.service';
import { ShopifyStorefrontService } from './services/shopify-storefront.service';
import { ShopifyWebhookService } from './services/shopify-webhook.service';
import { ShopifyConfig } from './shopify.config';

// Controllers
import { ShopifyOrdersController } from './controllers/shopify-orders.controller';
import { ShopifySearchController } from './controllers/shopify-search.controller';
import { ShopifyProductsController } from './controllers/shopify-products.controller';
import { ShopifyWebhookController } from './controllers/shopify-webhook.controller';

// Schemas
import { ShopifyOrderEntity, ShopifyOrderSchema } from './schemas/shopify-order.schema';

// Import RemediesModule with forwardRef
import { RemediesModule } from '../remedies/remedies.module';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    MongooseModule.forFeature([
      { name: ShopifyOrderEntity.name, schema: ShopifyOrderSchema },
    ]),
    forwardRef(() => RemediesModule), // ✅ FIX: Wrap with forwardRef
  ],
  controllers: [
    ShopifyOrdersController,
    ShopifySearchController,
    ShopifyProductsController,
    ShopifyWebhookController,
  ],
  providers: [
    ShopifyService,
    ShopifyOrdersService,
    ShopifyStorefrontService,
    ShopifyWebhookService,
    ShopifyConfig,
  ],
  exports: [
    ShopifyService,
    ShopifyOrdersService,
    ShopifyStorefrontService,
  ],
})
export class ShopifyModule {}
