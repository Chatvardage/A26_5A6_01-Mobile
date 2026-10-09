import { launchImageLibraryAsync } from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { ApiError } from '@/services/ApiError';
/** Photo carrée, JPEG de 256 px; le contrat limite la data URL à 90 000 caractères. */
export async function pickAvatar(): Promise<string | null> {
  const selected = await launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
  if (selected.canceled) return null;
  const context = ImageManipulator.manipulate(selected.assets[0].uri);
  context.resize({ width: 256 });
  const image = await context.renderAsync();
  try {
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.75, base64: true });
    const data = saved.base64 ? `data:image/jpeg;base64,${saved.base64}` : '';
    if (!data || data.length > 90_000) throw new ApiError('bad_request', 'Avatar exceeds size limit');
    return data;
  } finally { image.release(); context.release(); }
}
