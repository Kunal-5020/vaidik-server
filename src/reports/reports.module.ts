import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReportsController } from './controllers/reports.controller';
import { AstrologerReportsController } from './controllers/astrologer-reports.controller';
import { ReportsService } from './services/reports.service';
import { Report, ReportSchema } from './schemas/reports.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Report.name, schema: ReportSchema },
    ]),
  ],
  controllers: [ReportsController, AstrologerReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
