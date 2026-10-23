import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK
// On Google Cloud Run, credentials are automatically discovered via Application Default Credentials (ADC)
if (!admin.apps.length) {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'attendace-d3b3e';
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
    });
  } catch (err: any) {
    console.warn('Firebase Admin ADC initialization note:', err.message);
    admin.initializeApp({
      projectId,
    });
  }
}

export const firebaseAuth = admin.auth();
export const firebaseStorage = admin.storage();
export const firestore = admin.firestore();

