import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { DatabaseSchema } from '../types.js';

let isFirebaseConfigured = false;
let configData: any = null;

// Read config file on load if it exists
try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    isFirebaseConfigured = !!configData.projectId;
  }
} catch (error) {
  console.error('[FIREBASE-SERVICE] Error loading firebase-applet-config.json:', error);
}

export function getFirebaseConfig() {
  return {
    configured: isFirebaseConfigured,
    projectId: configData?.projectId || '',
    appId: configData?.appId || '',
    apiKey: configData?.apiKey || '',
    authDomain: configData?.authDomain || '',
    storageBucket: configData?.storageBucket || '',
    messagingSenderId: configData?.messagingSenderId || '',
  };
}

/**
 * Lazy initialization of the Firebase Admin SDK to prevent crash-on-startup
 */
export function getFirestoreDb(): Firestore {
  if (!isFirebaseConfigured || !configData?.projectId) {
    throw new Error('Firebase is not configured. Please ensure firebase-applet-config.json is present and has a valid projectId.');
  }

  try {
    if (getApps().length === 0) {
      initializeApp({
        projectId: configData.projectId,
      });
    }
    // Return standard firestore db
    return getFirestore();
  } catch (error: any) {
    console.error('[FIREBASE-SERVICE] Error initializing Firestore:', error);
    throw error;
  }
}

/**
 * Checks if the Firestore database is fully provisioned and ready for reads/writes.
 * Returns { success: boolean, reason?: string, details?: string }
 */
export async function checkFirestoreStatus(): Promise<{ success: boolean; reason?: string; details?: string }> {
  if (!isFirebaseConfigured) {
    return { 
      success: false, 
      reason: 'no_config', 
      details: 'El archivo firebase-applet-config.json no existe o está incompleto.' 
    };
  }

  try {
    const db = getFirestoreDb();
    // Try to perform a very quick diagnostic write/read
    const diagRef = db.collection('_diagnostics').doc('ping');
    await diagRef.set({
      timestamp: new Date().toISOString(),
      diag: 'Checking status...'
    });
    
    const snap = await diagRef.get();
    if (snap.exists) {
      return { success: true };
    } else {
      return { 
        success: false, 
        reason: 'read_failed', 
        details: 'Se completó la escritura de prueba pero no se pudo leer el documento de vuelta.' 
      };
    }
  } catch (error: any) {
    console.warn('[FIREBASE-SERVICE] Firestore connection diagnostic failed:', error);
    
    // Parse common Firestore errors
    const errorMsg = error.message || '';
    if (errorMsg.includes('NOT_FOUND') || error.code === 5) {
      return {
        success: false,
        reason: 'not_found',
        details: `La base de datos Firestore no ha sido creada o habilitada en el proyecto de Firebase "${configData.projectId}". Por favor, entra en la Consola de Firebase (https://console.firebase.google.com/), selecciona el proyecto, ve a Firestore Database y haz clic en "Crear base de datos" en la región europe-west2.`
      };
    }
    
    if (errorMsg.includes('PERMISSION_DENIED') || error.code === 7) {
      return {
        success: false,
        reason: 'permission_denied',
        details: 'Permiso denegado al intentar acceder a Firestore. Asegúrate de que las reglas de seguridad de Firestore permiten escrituras de prueba, o de que la cuenta de servicio tiene los permisos correctos (Cloud Datastore Owner / Editor).'
      };
    }

    return {
      success: false,
      reason: 'unknown_error',
      details: `Error al conectar con Firestore: ${errorMsg}`
    };
  }
}

/**
 * Creates a backup of the entire school banking simulation database on Firestore
 */
export async function saveBackupToFirestore(data: DatabaseSchema): Promise<{ success: boolean; id: string; timestamp: string }> {
  const db = getFirestoreDb();
  const timestamp = new Date().toISOString();
  const backupId = `backup_${Date.now()}`;

  // Store inside the 'backups' collection, with a document per backup
  const backupRef = db.collection('backups').doc(backupId);
  await backupRef.set({
    id: backupId,
    timestamp,
    users: data.users,
    transfers: data.transfers,
    systemLogs: data.systemLogs,
    defaultInitialBalance: data.defaultInitialBalance,
    created_by: 'AI Coding Agent'
  });

  // Also maintain a 'current_backup' pointer for easy quick-restores
  const currentRef = db.collection('backups').doc('current_backup');
  await currentRef.set({
    id: backupId,
    timestamp,
    users: data.users,
    transfers: data.transfers,
    systemLogs: data.systemLogs,
    defaultInitialBalance: data.defaultInitialBalance,
    created_by: 'AI Coding Agent'
  });

  return {
    success: true,
    id: backupId,
    timestamp
  };
}

/**
 * Retrieves the most recent or current backup from Firestore
 */
export async function getLatestBackupFromFirestore(): Promise<DatabaseSchema | null> {
  const db = getFirestoreDb();
  
  // Try retrieving the 'current_backup' doc first
  const currentRef = db.collection('backups').doc('current_backup');
  const snap = await currentRef.get();
  
  if (snap.exists) {
    const data = snap.data();
    if (data && Array.isArray(data.users) && Array.isArray(data.transfers)) {
      return {
        users: data.users,
        transfers: data.transfers,
        systemLogs: data.systemLogs || [],
        defaultInitialBalance: data.defaultInitialBalance !== undefined ? data.defaultInitialBalance : 1000
      };
    }
  }

  // Fallback: Query the collection ordered by timestamp descending
  const backupsColl = db.collection('backups');
  const querySnap = await backupsColl.orderBy('timestamp', 'desc').limit(5).get();
  
  for (const doc of querySnap.docs) {
    if (doc.id === 'current_backup') continue;
    const data = doc.data();
    if (data && Array.isArray(data.users) && Array.isArray(data.transfers)) {
      return {
        users: data.users,
        transfers: data.transfers,
        systemLogs: data.systemLogs || [],
        defaultInitialBalance: data.defaultInitialBalance !== undefined ? data.defaultInitialBalance : 1000
      };
    }
  }

  return null;
}
