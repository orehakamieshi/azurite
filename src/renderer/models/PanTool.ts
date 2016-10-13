import {Vec2, Transform} from "paintvec"
import Tool from './Tool'
import Waypoint from "./Waypoint"

export default
class PanTool extends Tool {
  name = "Pan"
  cursor = "all-scroll"
  originalPos = new Vec2(0)
  originalTranslation = new Vec2(0)
  originalRendererToPicture = new Transform()

  start(waypoint: Waypoint, rendererPos: Vec2) {
    this.originalRendererToPicture = this.renderer.transforms.rendererToPicture
    this.originalPos = rendererPos.transform(this.originalRendererToPicture)
    this.originalTranslation = this.picture.navigation.translation
  }

  move(waypoint: Waypoint, rendererPos: Vec2) {
    const pos = rendererPos.transform(this.originalRendererToPicture)
    const offset = pos.sub(this.originalPos)
    const translation = this.originalTranslation.add(offset)
    const {scale, rotation} = this.picture.navigation
    this.picture.navigation = {translation, scale, rotation}
    this.picture.changed.next()
  }

  end() {
  }
}