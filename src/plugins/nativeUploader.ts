import { registerPlugin } from '@capacitor/core';

export interface NativeUploaderUploadOptions {
  base64Data: string;
  fileName: string;
  bucket: string;
  contentType: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  authToken: string;
}

export interface NativeUploaderPlugin {
  upload(options: NativeUploaderUploadOptions): Promise<{ publicUrl: string }>;
}

export const NativeUploader = registerPlugin<NativeUploaderPlugin>('NativeUploader', {
  web: () => import('./nativeUploaderWeb').then(m => new m.NativeUploaderWeb()),
});
