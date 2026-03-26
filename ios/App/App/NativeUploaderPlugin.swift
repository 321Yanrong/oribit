import Capacitor
import Foundation

@objc(NativeUploaderPlugin)
public class NativeUploaderPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeUploaderPlugin"
    public let jsName = "NativeUploader"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "upload", returnType: CAPPluginReturnPromise)
    ]

    @objc func upload(_ call: CAPPluginCall) {
        guard
            let base64Data = call.getString("base64Data"),
            let fileName = call.getString("fileName"),
            let bucket = call.getString("bucket"),
            let contentType = call.getString("contentType"),
            let supabaseUrl = call.getString("supabaseUrl"),
            let supabaseAnonKey = call.getString("supabaseAnonKey"),
            let authToken = call.getString("authToken")
        else {
            call.reject("Missing required upload parameters")
            return
        }

        guard let imageData = Data(base64Encoded: base64Data) else {
            call.reject("Invalid base64 data")
            return
        }

        let uploadUrlString = "\(supabaseUrl)/storage/v1/object/\(bucket)/\(fileName)"
        guard let uploadUrl = URL(string: uploadUrlString) else {
            call.reject("Invalid upload URL: \(uploadUrlString)")
            return
        }

        var request = URLRequest(url: uploadUrl)
        request.httpMethod = "POST"
        request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        request.setValue(supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        request.setValue("false", forHTTPHeaderField: "x-upsert")
        request.setValue(String(imageData.count), forHTTPHeaderField: "Content-Length")
        // Fail fast on no-network so JS side can retry; don't silently hang
        request.timeoutInterval = 20

        // ephemeral: private connection pool — avoids stale TCP connections left over
        // from before backgrounding, which cause "Receive failed: Operation timed out"
        let config = URLSessionConfiguration.ephemeral
        config.waitsForConnectivity = false
        config.timeoutIntervalForRequest = 20  // wait up to 20s for server response
        config.timeoutIntervalForResource = 30 // total upload budget: 30s

        let session = URLSession(configuration: config)

        NSLog("[NativeUploader] starting upload: %@ (%d bytes)", uploadUrlString, imageData.count)

        let task = session.uploadTask(with: request, from: imageData) { data, response, error in
            if let error = error {
                NSLog("[NativeUploader] upload error: %@", error.localizedDescription)
                call.reject("Upload failed: \(error.localizedDescription)")
                return
            }

            guard let httpResponse = response as? HTTPURLResponse else {
                call.reject("Invalid response from server")
                return
            }

            guard (200...299).contains(httpResponse.statusCode) else {
                var errorBody = ""
                if let data = data, let body = String(data: data, encoding: .utf8) {
                    errorBody = body
                }
                NSLog("[NativeUploader] upload failed status=%d body=%@", httpResponse.statusCode, errorBody)
                call.reject("Upload failed with status \(httpResponse.statusCode): \(errorBody)")
                return
            }

            // Build the public URL — Supabase Storage public URL pattern
            let publicUrl = "\(supabaseUrl)/storage/v1/object/public/\(bucket)/\(fileName)"
            NSLog("[NativeUploader] upload success: %@", publicUrl)
            call.resolve(["publicUrl": publicUrl])
        }

        task.resume()
    }
}
