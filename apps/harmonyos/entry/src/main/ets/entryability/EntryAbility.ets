/**
 * EntryAbility — the ArkTS entry point: hosts the ArkWeb surface that loads
 * the compiled shared-ui H5 bundle (entry/src/main/resources/rawfile).
 */
import { AbilityConstant, UIAbility, Want } from '@kit.AbilityKit'
import { window } from '@kit.ArkUI'
import { webview } from '@kit.ArkWeb'
import { HarmonyBridge } from '../bridge/HarmonyBridge'

export default class EntryAbility extends UIAbility {
  onCreate(_want: Want, _launchParam: AbilityConstant.LaunchParam): void {
    HarmonyBridge.init(this.context)
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent('pages/Index', (err, _data) => {
      if (err.code) {
        console.error(`EntryAbility loadContent failed: ${err.code} ${err.message}`)
      }
    })
  }

  onWindowStageDestroy(): void {
    HarmonyBridge.dispose()
  }
}
