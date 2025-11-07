import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { ShopifyService } from './services/shopify.service';
import { ShopifyOrdersService } from './services/shopify-orders.service';
import { ShopifyConfig } from './shopify.config';
import { ShopifyOrdersController } from './controllers/shopify-orders.controller';
import { ShopifySearchController } from './controllers/shopify-search.controller';
import { ShopifyOrderEntity, ShopifyOrderSchema } from './schemas/shopify-order.schema';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    MongooseModule.forFeature([
      { name: ShopifyOrderEntity.name, schema: ShopifyOrderSchema },
    ]),
  ],
  providers: [ShopifyService, ShopifyOrdersService, ShopifyConfig],
  controllers: [ShopifyOrdersController, ShopifySearchController],
  exports: [ShopifyService, ShopifyOrdersService],
})
export class ShopifyModule {}
