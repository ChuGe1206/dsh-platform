/**
 * Index — the ArkWeb host page. Loads the rawfile H5 bundle (shared-ui
 * compiled) and registers the JS proxy so the bundle's native-harmony-bridge
 * plugin can call HMS Push / file access / softbus.
 */
import { webview } from '@kit.ArkWeb'
import { HarmonyBridge } from '../bridge/HarmonyBridge'

@Entry
@Component
struct Index {
  controller: webview.WebviewController = new webview.WebviewController()

  build() {
    Column() {
      Web({ src: $rawfile('index.html'), controller: this.controller })
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .fileAccess(true)
        .width('100%')
        .height('100%')
        .onControllerAttached(() => {
          HarmonyBridge.attach(this.controller)
          HarmonyBridge.registerJsProxy(this.controller)
        })
        .onConsole((event) => {
          if (event.message.level === webview.ConsoleMessageLevel.ERROR) {
            console.error(`[web] ${event.message.message}`)
          }
          return false
        })
    }
    .width('100%')
    .height('100%')
  }
}
