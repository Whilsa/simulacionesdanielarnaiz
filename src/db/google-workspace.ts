import { DatabaseSchema } from '../types.js';

/**
 * Creates a beautiful Google Sheets spreadsheet with three separate tabs:
 * 1. Alumnos (Students list, account numbers, and balances)
 * 2. Transferencias (Simulation transactions log)
 * 3. Bitácora (System logs)
 */
export async function exportToGoogleSheets(
  accessToken: string,
  data: DatabaseSchema
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const timestamp = new Date().toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const title = `Egobey Banco Simulación - Copia de Seguridad (${timestamp})`;

  // Step 1: Create a brand new spreadsheet with specific sheets
  const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [
        { properties: { title: 'Alumnos' } },
        { properties: { title: 'Transferencias' } },
        { properties: { title: 'Bitácora del Sistema' } },
      ],
    }),
  });

  if (!createResponse.ok) {
    const errText = await createResponse.text();
    throw new Error(`Error al crear la hoja de cálculo: ${errText || createResponse.statusText}`);
  }

  const spreadsheet = await createResponse.json();
  const spreadsheetId = spreadsheet.spreadsheetId;
  const spreadsheetUrl = spreadsheet.spreadsheetUrl;

  // Step 2: Prepare rows for each sheet
  const students = (data.users || []).filter((u) => u.role === 'student');
  const studentRows = [
    ['ID de Usuario', 'Nombre Completo', 'Nombre de Usuario', 'Número de Cuenta', 'Saldo (Egobey)'],
    ...students.map((u) => [
      u.id || '',
      u.name || '',
      u.username || '',
      u.accountNumber || '',
      typeof u.balance === 'number' ? u.balance : 0,
    ]),
  ];

  const transfers = data.transfers || [];
  const transferRows = [
    [
      'ID Transacción',
      'Fecha y Hora',
      'ID Emisor',
      'Nombre Emisor',
      'Cuenta Emisor',
      'ID Receptor',
      'Nombre Receptor',
      'Cuenta Receptor',
      'Monto (Egobey)',
      'Concepto',
    ],
    ...transfers.map((t) => [
      t.id || '',
      t.timestamp || '',
      t.senderId || '',
      t.senderName || '',
      t.senderAccount || '',
      t.receiverId || '',
      t.receiverName || '',
      t.receiverAccount || '',
      typeof t.amount === 'number' ? t.amount : 0,
      t.concept || '',
    ]),
  ];

  const logs = data.systemLogs || [];
  const logRows = [
    ['ID Log', 'Fecha y Hora', 'Acción Realizada', 'Detalles / Observaciones'],
    ...logs.map((l) => [
      l.id || '',
      l.timestamp || '',
      l.action || '',
      l.details || '',
    ]),
  ];

  // Step 3: Send data in batch updates to avoid rate limits and save requests
  const updateResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [
          {
            range: 'Alumnos!A1',
            values: studentRows,
          },
          {
            range: 'Transferencias!A1',
            values: transferRows,
          },
          {
            range: 'Bitácora del Sistema!A1',
            values: logRows,
          },
        ],
      }),
    }
  );

  if (!updateResponse.ok) {
    const errText = await updateResponse.text();
    throw new Error(`Error al llenar los datos de la hoja de cálculo: ${errText || updateResponse.statusText}`);
  }

  return { spreadsheetId, spreadsheetUrl };
}

/**
 * Uploads a full JSON database backup file into the user's Google Drive.
 */
export async function backupToGoogleDrive(
  accessToken: string,
  data: DatabaseSchema
): Promise<{ fileId: string; fileName: string }> {
  const timestamp = new Date().toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-');
  const fileName = `egobey_backup_${timestamp}.json`;

  const metadata = {
    name: fileName,
    mimeType: 'application/json',
    description: 'Copia de seguridad completa del simulador de aula Egobey',
  };

  const boundary = 'egobey_multipart_boundary';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  // Standard multipart body creation for Google Drive upload v3
  const multipartBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(data, null, 2) +
    closeDelimiter;

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Error al subir copia de seguridad a Google Drive: ${errText || response.statusText}`);
  }

  const result = await response.json();
  return { fileId: result.id, fileName };
}

export interface DriveBackupFile {
  id: string;
  name: string;
  createdTime: string;
  size?: string;
}

/**
 * Lists the JSON backups stored in Google Drive.
 */
export async function listDriveBackups(accessToken: string): Promise<DriveBackupFile[]> {
  const q = encodeURIComponent("name contains 'egobey_backup_' and mimeType = 'application/json' and trashed = false");
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,createdTime,size)&orderBy=createdTime desc&pageSize=30`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Error al listar archivos de Google Drive: ${errText || response.statusText}`);
  }

  const result = await response.json();
  return result.files || [];
}

/**
 * Downloads a backup file from Google Drive and parses it back to a DatabaseSchema.
 */
export async function downloadDriveBackup(
  accessToken: string,
  fileId: string
): Promise<DatabaseSchema> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Error al descargar archivo de Google Drive: ${errText || response.statusText}`);
  }

  const data = await response.json();

  // Validate downloaded content to make sure it is a valid backup schema
  if (!data || !Array.isArray(data.users)) {
    throw new Error('El archivo descargado no parece ser una copia de seguridad válida de Egobey (falta la lista de usuarios).');
  }

  return data as DatabaseSchema;
}
