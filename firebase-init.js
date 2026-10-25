// Firebase Web App Initialization with Email/Password Authentication
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile,
  updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyBhb8eZXSthDp4FQsctxxdNBBvBThZkxn4",
  authDomain: "attendace-d3b3e.firebaseapp.com",
  projectId: "attendace-d3b3e",
  storageBucket: "attendace-d3b3e.firebasestorage.app",
  messagingSenderId: "1059657894971",
  appId: "1:1059657894971:web:53eca6ac02f67f5571e01e",
  measurementId: "G-SW1X5L042G"
};

// Initialize Firebase App & Services
export const app = initializeApp(firebaseConfig);
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;
export const auth = getAuth(app);
export const db = getFirestore(app);

// Expose on window for easy access throughout the portal
window.firebaseApp = app;
window.firebaseAnalytics = analytics;
window.firebaseAuth = auth;
window.firebaseDb = db;
window.db = db;

// Expose Firestore SDK primitives
window.firestoreCollection = collection;
window.firestoreDoc = doc;
window.firestoreGetDoc = getDoc;
window.firestoreGetDocs = getDocs;
window.firestoreSetDoc = setDoc;
window.firestoreAddDoc = addDoc;
window.firestoreUpdateDoc = updateDoc;
window.firestoreDeleteDoc = deleteDoc;
window.firestoreQuery = query;
window.firestoreWhere = where;
window.firestoreOrderBy = orderBy;
window.firestoreLimit = limit;
window.firestoreOnSnapshot = onSnapshot;
window.firestoreServerTimestamp = serverTimestamp;
window.firestoreBatch = writeBatch;

// High-level Firestore convenience helpers
window.dbGetDoc = async function (collName, docId) {
  try {
    const docRef = doc(db, collName, docId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() };
    }
    return null;
  } catch (err) {
    console.error('dbGetDoc error:', collName, docId, err);
    throw err;
  }
};

window.dbSetDoc = async function (collName, docId, data, merge = true) {
  try {
    const docRef = doc(db, collName, docId);
    await setDoc(docRef, { ...data, updatedAt: serverTimestamp() }, { merge: merge });
    return { id: docId, success: true };
  } catch (err) {
    console.error('dbSetDoc error:', collName, docId, err);
    throw err;
  }
};

window.dbAddDoc = async function (collName, data) {
  try {
    const collRef = collection(db, collName);
    const res = await addDoc(collRef, { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return { id: res.id, success: true };
  } catch (err) {
    console.error('dbAddDoc error:', collName, err);
    throw err;
  }
};

window.dbGetCollection = async function (collName, whereField = null, op = null, value = null) {
  try {
    let q;
    if (whereField && op && value !== undefined) {
      q = query(collection(db, collName), where(whereField, op, value));
    } else {
      q = collection(db, collName);
    }
    const snap = await getDocs(q);
    const results = [];
    snap.forEach((d) => {
      results.push({ id: d.id, ...d.data() });
    });
    return results;
  } catch (err) {
    console.error('dbGetCollection error:', collName, err);
    throw err;
  }
};

window.dbListenDoc = function (collName, docId, callback) {
  const docRef = doc(db, collName, docId);
  return onSnapshot(docRef, (snap) => {
    if (snap.exists()) {
      callback({ id: snap.id, ...snap.data() });
    } else {
      callback(null);
    }
  }, (err) => {
    console.error('dbListenDoc error:', collName, docId, err);
  });
};

window.dbListenCollection = function (collName, callback, whereField = null, op = null, value = null) {
  let q;
  if (whereField && op && value !== undefined) {
    q = query(collection(db, collName), where(whereField, op, value));
  } else {
    q = collection(db, collName);
  }
  return onSnapshot(q, (snap) => {
    const results = [];
    snap.forEach((d) => {
      results.push({ id: d.id, ...d.data() });
    });
    callback(results);
  }, (err) => {
    console.error('dbListenCollection error:', collName, err);
  });
};

// Google Sign-In Provider & Helpers
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
window.googleAuthProvider = googleProvider;

window.signInWithGoogle = function () {
  return signInWithPopup(auth, googleProvider);
};

// Email/Password Auth Helpers
window.signInWithFirebase = function (email, password) {
  return signInWithEmailAndPassword(auth, email, password);
};

window.createFirebaseUser = function (email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
};

window.resetFirebasePassword = function (email) {
  return sendPasswordResetEmail(auth, email);
};

window.signOutFirebase = function () {
  return signOut(auth);
};

window.provisionSecondaryFirebaseUser = async function (email, tempPassword, displayName) {
  try {
    const secApp = initializeApp(firebaseConfig, 'SecondaryProvision-' + Date.now());
    const secAuth = getAuth(secApp);
    const userCredential = await createUserWithEmailAndPassword(secAuth, email, tempPassword);
    if (displayName && userCredential.user) {
      try {
        await updateProfile(userCredential.user, { displayName: displayName });
      } catch (e) {}
    }
    await signOut(secAuth);
    console.log('✅ Secondary Firebase User provisioned in Auth Console:', email, userCredential.user.uid);
    return { success: true, uid: userCredential.user.uid, user: userCredential.user };
  } catch (err) {
    console.warn('ℹ️ Secondary Firebase user provisioning note:', err.code || err.message);
    if (err.code === 'auth/email-already-in-use') {
      return { success: true, alreadyExists: true };
    }
    return { success: false, error: err };
  }
};

window.activateOrSetFirebasePassword = async function (email, newPassword, displayName) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, newPassword);
    if (displayName && userCredential.user) {
      try {
        await updateProfile(userCredential.user, { displayName: displayName });
      } catch (e) {}
    }
    console.log('✅ Firebase User created during activation:', email, userCredential.user.uid);
    return { success: true, uid: userCredential.user.uid, created: true };
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      console.log('User already exists in Firebase Auth, updating profile...');
      try {
        const cred = await signInWithEmailAndPassword(auth, email, newPassword);
        return { success: true, uid: cred.user.uid, updated: true };
      } catch (signInErr) {
        return { success: true, alreadyExists: true };
      }
    }
    console.warn('activateOrSetFirebasePassword notice:', err);
    return { success: false, error: err };
  }
};

console.log('Firebase App, Auth & Cloud Firestore initialized for: attendace-d3b3e');
if (typeof window !== 'undefined') {
  window.dispatchEvent(new CustomEvent('firebase:ready', { detail: { projectId: firebaseConfig.projectId } }));
}


