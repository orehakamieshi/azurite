import {BrushEngine} from "../BrushEngine"
import {BrushPresetData} from "../BrushPreset"
import {BrushPresetPen, isPresetDataPen} from "./BrushPresetPen"
import {DabRendererPen} from "./DabRendererPen"

export class BrushEnginePen extends BrushEngine {
  newDabRenderer() {
    return new DabRendererPen()
  }

  newPreset() {
    return new BrushPresetPen({
      width: 10,
      opacity: 1,
      softness: 0.5,
      minWidthRatio: 0.5,
      stabilizingLevel: 2,
      eraser: false,
    })
  }

  maybeLoadPreset(data: BrushPresetData) {
    if (isPresetDataPen(data)) {
      return new BrushPresetPen(data)
    }
  }
}
