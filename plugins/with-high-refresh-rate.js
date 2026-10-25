// Expo config plugin: ask Android for the display's highest refresh rate (e.g. 120 Hz on Galaxy S25),
// and keep release builds lean (R8 + resource shrinking). Re-applied on every `expo prebuild`.
const { withMainActivity, withGradleProperties } = require("@expo/config-plugins");

const MARK = "// hermes: high-refresh-rate";
const KOTLIN = `
  ${MARK}
  /** Pick the display mode with the highest refresh rate at the current resolution (API 23+). */
  private fun preferHighRefreshRate() {
    if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.M) return
    try {
      @Suppress("DEPRECATION")
      val display = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) this.display else windowManager.defaultDisplay
      if (display == null) return
      val current = display.mode
      val best = display.supportedModes
        .filter { it.physicalWidth == current.physicalWidth && it.physicalHeight == current.physicalHeight }
        .maxByOrNull { it.refreshRate } ?: return
      val attrs = window.attributes
      attrs.preferredDisplayModeId = best.modeId
      attrs.preferredRefreshRate = best.refreshRate
      window.attributes = attrs
      android.util.Log.i("HermesRefresh", "preferred mode " + best.modeId + " @ " + best.refreshRate + " Hz")
    } catch (e: Throwable) {
      android.util.Log.w("HermesRefresh", "could not set refresh rate", e)
    }
  }
`;

function patchMainActivity(src) {
  if (src.includes(MARK)) return src;
  if (!/super\.onCreate\([^)]*\)/.test(src)) throw new Error("with-high-refresh-rate: MainActivity.onCreate not found");
  src = src.replace(/(super\.onCreate\([^)]*\))/, "$1\n    preferHighRefreshRate()");
  const i = src.lastIndexOf("}");
  return src.slice(0, i) + KOTLIN + src.slice(i);
}

module.exports = function withHighRefreshRate(config) {
  config = withMainActivity(config, (c) => {
    if (c.modResults.language !== "kt") throw new Error("with-high-refresh-rate expects a Kotlin MainActivity");
    c.modResults.contents = patchMainActivity(c.modResults.contents);
    return c;
  });
  config = withGradleProperties(config, (c) => {
    const set = (key, value) => {
      const item = c.modResults.find((x) => x.type === "property" && x.key === key);
      if (item) item.value = value; else c.modResults.push({ type: "property", key, value });
    };
    set("android.enableMinifyInReleaseBuilds", "true");
    set("android.enableShrinkResourcesInReleaseBuilds", "true");
    set("hermesEnabled", "true");
    set("newArchEnabled", "true");
    set("reactNativeArchitectures", "arm64-v8a"); // Galaxy S25 is arm64; pass -PreactNativeArchitectures=x86_64 for an emulator
    set("org.gradle.jvmargs", "-Xmx4g -XX:MaxMetaspaceSize=1g");
    return c;
  });
  return config;
};
module.exports.patchMainActivity = patchMainActivity;
