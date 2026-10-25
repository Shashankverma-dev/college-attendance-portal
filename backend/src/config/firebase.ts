import * as admin from 'firebase-admin';

export const hasAdminCredentials = !!(
  process.env.FIREBASE_SERVICE_ACCOUNT ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS
);

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
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      try {
        admin.initializeApp({
          credential: admin.credential.applicationDefault(),
          projectId,
        });
        console.log('✅ Firebase Admin SDK initialized using Application Default Credentials (ADC).');
      } catch (err: any) {
        console.warn('ℹ️ Firebase Admin ADC initialization note:', err.message);
      }
    }
    if (!admin.apps.length) {
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

/**
 * Safely executes a Firebase Admin SDK operation with a strict timeout.
 * Prevents non-GCP hosting platforms (like Render) from hanging indefinitely
 * on GCP metadata server lookups (169.254.169.254) when running without service account credentials.
 */
export async function safeFirebaseOp<T>(fn: () => Promise<T>, timeoutMs: number = 2000): Promise<T | null> {
  if (!hasAdminCredentials && process.env.NODE_ENV === 'production' && !process.env.K_SERVICE) {
    return null;
  }
  return Promise.race([
    fn(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
  ]).catch(() => null);
}

