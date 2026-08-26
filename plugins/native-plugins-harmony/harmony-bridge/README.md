# native-harmony-bridge

鸿蒙 ArkWeb 桥（JS 侧）。`HarmonyBridge.ets` 通过 `javaScriptProxy` 注入
`window.harmonyBridge`，本包以 `{ ok, data, error }` 封装原生方法调用；
无代理时回退到 shared-bridge HTTP。
