import Capacitor
import UIKit

@objc(OrbitOpenAppSettingsPlugin)
public class OrbitOpenAppSettingsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OrbitOpenAppSettingsPlugin"
    public let jsName = "OrbitOpenAppSettings"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)
    ]

    @objc func open(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                call.reject("invalid settings URL")
                return
            }
            UIApplication.shared.open(url, options: [:]) { success in
                if success {
                    call.resolve()
                } else {
                    call.reject("failed to open settings")
                }
            }
        }
    }
}
