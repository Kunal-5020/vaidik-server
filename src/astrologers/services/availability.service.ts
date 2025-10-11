import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Astrologer, AstrologerDocument } from '../schemas/astrologer.schema';
import { UpdateWorkingHoursDto } from '../dto/update-working-hours.dto';
import { UpdateAvailabilityDto } from '../dto/update-availability.dto';

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
  ) {}

  async updateWorkingHours(astrologerId: string, updateDto: UpdateWorkingHoursDto): Promise<any> {
    const astrologer = await this.astrologerModel.findById(astrologerId);
    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    astrologer.availability.workingHours = updateDto.workingHours as any;
    await astrologer.save();

    return {
      success: true,
      message: 'Working hours updated successfully',
      data: astrologer.availability.workingHours
    };
  }

  async updateAvailability(astrologerId: string, updateDto: UpdateAvailabilityDto): Promise<any> {
    const updateFields: any = {};

    if (updateDto.isOnline !== undefined) {
      updateFields['availability.isOnline'] = updateDto.isOnline;
    }
    if (updateDto.isAvailable !== undefined) {
      updateFields['availability.isAvailable'] = updateDto.isAvailable;
    }
    if (updateDto.busyUntil !== undefined) {
      updateFields['availability.busyUntil'] = new Date(updateDto.busyUntil);
    }
    updateFields['availability.lastActive'] = new Date();

    const astrologer = await this.astrologerModel.findByIdAndUpdate(
      astrologerId,
      { $set: updateFields },
      { new: true }
    ).select('availability');

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    return {
      success: true,
      message: 'Availability updated successfully',
      data: astrologer.availability
    };
  }

  async setBusy(astrologerId: string, busyUntil: Date): Promise<void> {
    await this.astrologerModel.findByIdAndUpdate(astrologerId, {
      $set: {
        'availability.isAvailable': false,
        'availability.busyUntil': busyUntil
      }
    });
  }

  async setAvailable(astrologerId: string): Promise<void> {
    await this.astrologerModel.findByIdAndUpdate(astrologerId, {
      $set: {
        'availability.isAvailable': true,
        'availability.busyUntil': null,
        'availability.lastActive': new Date()
      }
    });
  }

  async isAvailableNow(astrologerId: string): Promise<boolean> {
    const astrologer = await this.astrologerModel
      .findById(astrologerId)
      .select('availability accountStatus')
      .lean();

    if (!astrologer || astrologer.accountStatus !== 'active') {
      return false;
    }

    const now = new Date();
    const isBusy = astrologer.availability.busyUntil && 
                   new Date(astrologer.availability.busyUntil) > now;

    return (
      astrologer.availability.isOnline &&
      astrologer.availability.isAvailable &&
      !isBusy
    );
  }

  async getWorkingHours(astrologerId: string): Promise<any> {
    const astrologer = await this.astrologerModel
      .findById(astrologerId)
      .select('availability')
      .lean();

    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    return {
      success: true,
      data: astrologer.availability
    };
  }
}
