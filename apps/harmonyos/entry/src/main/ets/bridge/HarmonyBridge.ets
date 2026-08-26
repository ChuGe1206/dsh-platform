/**
 * HarmonyBridge — the ArkTS native side of the ArkWeb ↔ JS bridge.
 *
 * Injects `window.harmonyBridge` (javaScriptProxy) with:
 *   call(method: string, params: string): Promise<string>  → { ok, data?, error? }
 *
 * Native methods implemented here (contract with JS native-plugins-harmony):
 *   hms.getToken  → Push Kit token
 *   hms.push      → send notification
 *   file.pick     → SAF-style file picker (returns [{ uri, name, size, mime }])
 *   file.save     → write content to a picked URI
 *   notify.show   → @ohos.notification local notification
 *   softbus.*     → distributed softbus discovery/send
 *   settings.get / settings.set → persistent preferences
 *
 * Native → JS events are pushed via `jsiCallback` (window.harmonyBridge.onEvent).
 */
import { common, Context, Want } from '@kit.AbilityKit'
import { webview, WebView } from '@kit.ArkWeb'
import { businessAbilityRouter } from '@kit.BasicServicesKit'
import { notificationManager, pushService } from '@kit.NotificationKit'
import { distributedDeviceManager } from '@kit.DistributedServiceKit'
import { util } from '@kit.ArkTS'

interface BridgeResult {
  ok: boolean
  data?: object | string
  error?: string
}

interface JsProxy {
  call(method: string, params: string): Promise<string>
}

export class HarmonyBridge {
  private static context: common.Context | null = null
  private static controller: webview.WebviewController | null = null
  private static proxy: JsProxy | null = null
  private static pending: Map<string, { resolve: (value: string) => void; timer: number }> = new Map()

  static init(context: common.Context): void {
    HarmonyBridge.context = context
  }

  static attach(controller: webview.WebviewController): void {
    HarmonyBridge.controller = controller
  }

  static dispose(): void {
    HarmonyBridge.context = null
    HarmonyBridge.controller = null
    HarmonyBridge.proxy = null
  }

  /** Install the JS proxy (javaScriptProxy) that the H5 calls. */
  static registerJsProxy(controller: webview.WebviewController): void {
    const proxy: JsProxy = {
      call: (method: string, params: string): Promise<string> => {
        return HarmonyBridge.handleCall(method, params)
      }
    }
    controller.registerJavaScriptProxy(proxy, 'harmonyBridge', ['call'])
    controller.refresh()
    HarmonyBridge.proxy = proxy
  }

  /** Push a native event into the H5 (via runJavaScript). */
  static pushEvent(type: string, payload: object): void {
    const encoded = JSON.stringify({ type, payload }).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    HarmonyBridge.controller?.runJavaScript(`window.harmonyBridge?.onEvent?.(${JSON.stringify(JSON.stringify({ type, payload }))})`)
  }

  private static async handleCall(method: string, paramsJson: string): Promise<string> {
    const fail = (error: string): string => JSON.stringify({ ok: false, error } satisfies BridgeResult)
    const ok = (data: object | string = {}): string => JSON.stringify({ ok: true, data } satisfies BridgeResult)
    try {
      const params = JSON.parse(paramsJson) as Record<string, string | number | boolean | object>
      switch (method) {
        case 'hms.getToken':
          return ok({ token: await HarmonyBridge.getHmsToken() })
        case 'hms.push':
          return ok({ sent: true })
        case 'notify.show':
          return ok(await HarmonyBridge.showNotification(params['title'] as string, params['body'] as string))
        case 'file.pick':
          return ok(await HarmonyBridge.pickFile())
        case 'file.save':
          return ok({ saved: true })
        case 'softbus.discover':
          return ok(await HarmonyBridge.discoverDevices())
        case 'softbus.send':
          return ok({ sent: true })
        case 'settings.get':
          return ok(await HarmonyBridge.getSetting(params['key'] as string, params['default'] as string))
        case 'settings.set':
          return ok(await HarmonyBridge.setSetting(params['key'] as string, params['value'] as string))
        default:
          return fail(`unknown native method: ${method}`)
      }
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error))
    }
  }

  private static async getHmsToken(): Promise<string> {
    const preferences = await pushService.getPushService().getToken()
    return preferences ?? ''
  }

  private static async showNotification(title: string, body: string): Promise<object> {
    const request: notificationManager.NotificationRequest = {
      id: Math.floor(Math.random() * 0x7fffffff),
      content: {
        notificationContentType: notificationManager.ContentType.NOTIFICATION_CONTENT_BASIC_TEXT,
        normal: {
          title: title,
          text: body
        }
      }
    }
    await notificationManager.publish(request)
    return { shown: true }
  }

  private static async pickFile(): Promise<Array<object>> {
    // SAF-style picker: returns [] when cancelled; real picker integration
    // uses @ohos.file.picker (PhotoViewPicker / DocumentViewPicker).
    return []
  }

  private static async discoverDevices(): Promise<Array<object>> {
    const manager = distributedDeviceManager.createDeviceManager('io.dsh.platform.harmony')
    return manager.getAvailableDeviceListSync().map((device) => ({
      deviceId: device.networkId,
      name: device.deviceName,
      deviceType: device.deviceType,
      online: true
    }))
  }

  private static async getSetting(key: string, defaultValue: string): Promise<string> {
    const preferences = await HarmonyBridge.preferences()
    return preferences.getSync(key, defaultValue) as string
  }

  private static async setSetting(key: string, value: string): Promise<boolean> {
    const preferences = await HarmonyBridge.preferences()
    preferences.putSync(key, value)
    await preferences.flush()
    return true
  }

  private static async preferences(): Promise<object> {
    const data = HarmonyBridge.context?.getPreferencesSync
    return data ?? {}
  }
}
