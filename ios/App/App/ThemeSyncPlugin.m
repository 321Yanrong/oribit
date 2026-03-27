#import <Capacitor/Capacitor.h>

CAP_PLUGIN(ThemeSyncPlugin, "ThemeSync",
  CAP_PLUGIN_METHOD(setTheme, CAPPluginReturnPromise);
)
