import * as admin from 'firebase-admin';

// On Render or Cloud platforms, credentials can be supplied via FIREBASE_SERVICE_ACCOUNT (JSON string) or ADC
if (!admin.apps.length) {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'attendace-d3b3e';
  
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(sa),
        projectId: sa.project_id || projectId,
      });
      console.log('✅ Firebase Admin SDK initialized using FIREBASE_SERVICE_ACCOUNT.');
    } catch (err: any) {
      console.warn('⚠️ Could not parse FIREBASE_SERVICE_ACCOUNT JSON:', err.message);
    }
  }

  if (!admin.apps.length) {
    try {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId,
      });
      console.log('✅ Firebase Admin SDK initialized using Application Default Credentials (ADC).');
    } catch (err: any) {
      console.warn('ℹ️ Firebase Admin ADC initialization note:', err.message);
      admin.initializeApp({
        projectId,
      });
      console.log(`✅ Firebase Admin SDK initialized in standard mode (Project: ${projectId}).`);
    }
  }
}

export const firebaseAuth = admin.auth();
export const firebaseStorage = admin.storage();
export const firestore = admin.firestore();

