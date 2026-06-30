import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, storage } from '../firebase';

export interface UploadedDeckPhoto {
  url: string;
  path: string;
}

function safeExtension(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;
  const fromType = file.type.split('/')[1]?.toLowerCase();
  if (fromType && /^[a-z0-9]+$/.test(fromType)) return fromType;
  return 'jpg';
}

export async function uploadDeckPhoto(
  draftId: string,
  playerId: string,
  file: File,
): Promise<UploadedDeckPhoto> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('You must be signed in to upload a deck photo.');

  const extension = safeExtension(file);
  const path = `deckPhotos/${draftId}/${playerId}/${uid}/${crypto.randomUUID()}.${extension}`;
  const photoRef = ref(storage, path);
  await uploadBytes(photoRef, file, { contentType: file.type || 'image/jpeg' });
  const url = await getDownloadURL(photoRef);
  return { url, path };
}

export async function deleteDeckPhoto(path: string): Promise<void> {
  await deleteObject(ref(storage, path));
}
