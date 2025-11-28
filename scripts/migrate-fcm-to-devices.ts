// scripts/migrate-fcm-to-devices.ts (FINAL FIX)
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/vaidik-talk';

const deviceSchema = new mongoose.Schema({
  fcmToken: { type: String, required: true },
  deviceId: String,
  deviceType: { type: String, enum: ['android', 'ios', 'web'] },
  deviceName: String,
  lastActive: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
});

const userSchema = new mongoose.Schema({
  fcmToken: String,
  devices: [deviceSchema],
}, { timestamps: true, strict: false });

const astrologerSchema = new mongoose.Schema({
  fcmToken: String,
  devices: [deviceSchema],
}, { timestamps: true, strict: false });

const User = mongoose.model('User', userSchema);
const Astrologer = mongoose.model('Astrologer', astrologerSchema);

async function migrate() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Migrate Users
    console.log('\n🔄 Migrating User FCM tokens...');
    
    // ✅ FIXED: Use $nin instead of multiple $ne
    const users = await User.find({ 
      fcmToken: { 
        $exists: true, 
        $nin: [null, '', undefined] // ✅ Combined into $nin
      } 
    });
    
    let userMigrated = 0;
    let userSkipped = 0;

    for (const user of users) {
      if (!user.fcmToken) {
        userSkipped++;
        continue;
      }

      if (user.devices && user.devices.length > 0) {
        console.log(`⏭️  User ${user._id} already has devices, skipping`);
        userSkipped++;
        continue;
      }

      user.devices = [{
        fcmToken: user.fcmToken as string,
        deviceType: 'android' as const,
        deviceName: 'Migrated Device',
        lastActive: new Date(),
        isActive: true,
      }] as any;

      await user.save();
      console.log(`✅ Migrated user: ${user._id}`);
      userMigrated++;
    }

    console.log(`\n📊 Users: ${userMigrated} migrated, ${userSkipped} skipped`);

    // Migrate Astrologers
    console.log('\n🔄 Migrating Astrologer FCM tokens...');
    
    // ✅ FIXED: Use $nin instead of multiple $ne
    const astrologers = await Astrologer.find({ 
      fcmToken: { 
        $exists: true, 
        $nin: [null, '', undefined] // ✅ Combined into $nin
      } 
    });
    
    let astrologerMigrated = 0;
    let astrologerSkipped = 0;

    for (const astrologer of astrologers) {
      if (!astrologer.fcmToken) {
        astrologerSkipped++;
        continue;
      }

      if (astrologer.devices && astrologer.devices.length > 0) {
        console.log(`⏭️  Astrologer ${astrologer._id} already has devices, skipping`);
        astrologerSkipped++;
        continue;
      }

      astrologer.devices = [{
        fcmToken: astrologer.fcmToken as string,
        deviceType: 'android' as const,
        deviceName: 'Migrated Device',
        lastActive: new Date(),
        isActive: true,
      }] as any;

      await astrologer.save();
      console.log(`✅ Migrated astrologer: ${astrologer._id}`);
      astrologerMigrated++;
    }

    console.log(`\n📊 Astrologers: ${astrologerMigrated} migrated, ${astrologerSkipped} skipped`);

    console.log('\n🎉 Migration complete!');
    console.log(`Total migrated: ${userMigrated + astrologerMigrated}`);
    console.log(`Total skipped: ${userSkipped + astrologerSkipped}`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

migrate();
