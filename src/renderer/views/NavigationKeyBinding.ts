import PanTool from "../models/PanTool"
import {ZoomTool} from "../models/ZoomTool"
import RotateTool from "../models/RotateTool"
import {isTextInput} from "./util"

const keys = [" ", "Control", "Meta", "Alt", "Shift"]

export default
class NavigationKeyBinding {
  pressedKeys = new Set<string>()

  constructor(public onToolChange: (toolClass?: Function) => void) {
    document.addEventListener("keydown", e => {
      if (keys.indexOf(e.key) >= 0) {
        this.pressedKeys.add(e.key)
        if (!isTextInput(e.target as Element)) {
          this.onKeyChange()
          if (e.key == " ") {
            e.preventDefault()
          }
        }
      }
    })
    document.addEventListener("keyup", e => {
      if (keys.indexOf(e.key) >= 0) {
        this.pressedKeys.delete(e.key)
        this.onKeyChange()
      }
    })
  }

  onKeyChange() {
    const {pressedKeys, onToolChange} = this
    if (pressedKeys.has(" ")) {
      if (pressedKeys.has("Shift")) {
        onToolChange(RotateTool)
      } else if (pressedKeys.has("Meta") || pressedKeys.has("Control")) {
        onToolChange(ZoomTool)
      } else {
        onToolChange(PanTool)
      }
    } else {
      onToolChange()
    }
  }
}
