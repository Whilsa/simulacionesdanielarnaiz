export interface DriveFileMetadata {
  id: string;
  name: string;
  modifiedTime: string;
}

/**
 * Searches for the 'banco_escolar_db.json' file in the user's Google Drive.
 */
export async function findBackupFile(accessToken: string): Promise<DriveFileMetadata | null> {
  const query = encodeURIComponent("name = 'banco_escolar_db.json' and trashed = false");
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)&pageSize=1`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Google Drive API error (find): ${res.statusText} - ${errText}`);
    }

    const data = await res.json();
    if (data.files && data.files.length > 0) {
      return data.files[0] as DriveFileMetadata;
    }
    return null;
  } catch (error) {
    console.error('Error finding backup file on Google Drive:', error);
    throw error;
  }
}

/**
 * Creates a new 'banco_escolar_db.json' file in the user's Google Drive with metadata and content.
 */
export async function createBackupFile(accessToken: string, dbData: any): Promise<DriveFileMetadata> {
  const metadataUrl = 'https://www.googleapis.com/drive/v3/files';
  
  try {
    // 1. Create file metadata
    const metadataRes = await fetch(metadataUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'banco_escolar_db.json',
        mimeType: 'application/json',
      }),
    });

    if (!metadataRes.ok) {
      const errText = await metadataRes.text();
      throw new Error(`Google Drive API error (create metadata): ${metadataRes.statusText} - ${errText}`);
    }

    const fileMeta = await metadataRes.json() as DriveFileMetadata;
    const fileId = fileMeta.id;

    // 2. Upload content
    await updateBackupFileContent(accessToken, fileId, dbData);

    // 3. Fetch latest metadata to get correct modifiedTime
    const infoUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,modifiedTime`;
    const infoRes = await fetch(infoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (infoRes.ok) {
      return await infoRes.json() as DriveFileMetadata;
    }

    return { ...fileMeta, modifiedTime: new Date().toISOString() };
  } catch (error) {
    console.error('Error creating backup file on Google Drive:', error);
    throw error;
  }
}

/**
 * Updates the content of an existing backup file on Google Drive.
 */
export async function updateBackupFileContent(accessToken: string, fileId: string, dbData: any): Promise<void> {
  const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;

  try {
    const res = await fetch(uploadUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dbData, null, 2),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Google Drive API error (upload media): ${res.statusText} - ${errText}`);
    }
  } catch (error) {
    console.error('Error uploading backup file content to Google Drive:', error);
    throw error;
  }
}

/**
 * Downloads the JSON content of the backup file from Google Drive.
 */
export async function downloadBackupFile(accessToken: string, fileId: string): Promise<any> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Google Drive API error (download): ${res.statusText} - ${errText}`);
    }

    return await res.json();
  } catch (error) {
    console.error('Error downloading backup file from Google Drive:', error);
    throw error;
  }
}
