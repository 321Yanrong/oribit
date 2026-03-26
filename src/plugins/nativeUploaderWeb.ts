import { WebPlugin } from '@capacitor/core';
import type { NativeUploaderPlugin, NativeUploaderUploadOptions } from './nativeUploader';
import { createClient } from '@supabase/supabase-js';

/**
 * Web fallback for NativeUploaderPlugin.
 * Uses the standard Supabase JS client for storage uploads in the browser.
 */
export class NativeUploaderWeb extends WebPlugin implements NativeUploaderPlugin {
  async upload(options: NativeUploaderUploadOptions): Promise<{ publicUrl: string }> {
    const { base64Data, fileName, bucket, contentType, supabaseUrl, supabaseAnonKey, authToken } = options;

    // Decode base64 to Blob
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const blob = new Blob([byteNumbers], { type: contentType });

    const client = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: `Bearer ${authToken}` },
      },
    });

    const { error } = await client.storage
      .from(bucket)
      .upload(fileName, blob, { cacheControl: '3600', upsert: false });

    if (error) throw new Error(error.message);

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${fileName}`;
    return { publicUrl };
  }
}
