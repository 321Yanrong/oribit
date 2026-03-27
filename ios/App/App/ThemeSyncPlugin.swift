import Capacitor
import UIKit

@objc(ThemeSyncPlugin)
public class ThemeSyncPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ThemeSyncPlugin"
    public let jsName = "ThemeSync"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setTheme", returnType: CAPPluginReturnPromise)
    ]

    @objc func setTheme(_ call: CAPPluginCall) {
        let theme = call.getString("theme") ?? "light"
        UserDefaults.standard.set(theme, forKey: "orbit_app_theme")

        DispatchQueue.main.async {
            guard let window = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .flatMap({ $0.windows })
                .first else { return }

            window.backgroundColor = theme == "dark"
                ? UIColor(red: 0x12/255.0, green: 0x12/255.0, blue: 0x12/255.0, alpha: 1)
                : .white
        }
        call.resolve()
    }
}
