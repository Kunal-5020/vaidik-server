import * as admin from 'firebase-admin';
import { Injectable } from '@nestjs/common';

@Injectable()
export class FirebaseAdminConfig {
  private firebaseApp: admin.app.App;

  constructor() {
    // Firebase service account configuration
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');

    // Initialize Firebase Admin
    if (admin.apps.length === 0) {
      this.firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL
      });
      console.log('✅ Firebase Admin initialized successfully');
    } else {
      this.firebaseApp = admin.app();
    }
  }

  getFirebaseApp(): admin.app.App {
    return this.firebaseApp;
  }

  getMessaging(): admin.messaging.Messaging {
    return admin.messaging(this.firebaseApp);
  }
}
