import {observable} from "mobx"
import {BrushPreset} from "../brush/BrushPreset"
import {ConfigValues} from "./Config"
import {brushEngineRegistry} from "./BrushEngineRegistry"

export
class BrushPresetManager {
  readonly presets = observable<BrushPreset>([])

  loadConfig(values: ConfigValues) {
    for (const data of values.brushPresets) {
      for (const engine of brushEngineRegistry.engines) {
        const preset = engine.maybeNewPresetFromData(data)
        if (preset) {
          this.presets.push(preset)
          break
        }
      }
    }
  }

  saveConfig() {
    return {
      brushPresets: this.presets.map(p => p.toData())
    }
  }
}

export const brushPresetManager = new BrushPresetManager()
