#import <Capacitor/Capacitor.h>

CAP_PLUGIN(NativeUploaderPlugin, "NativeUploader",
  CAP_PLUGIN_METHOD(upload, CAPPluginReturnPromise);
)
