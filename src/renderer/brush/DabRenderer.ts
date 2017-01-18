import {Rect, Vec2} from "paintvec"
import {Waypoint} from "./Waypoint"
import Layer, {ImageLayer} from "../models/Layer"
import TiledTexture, {Tile} from "../models/TiledTexture"
import {renderer} from "../views/Renderer"
import {ChangeLayerImageCommand} from "../commands/LayerCommand"

export abstract class DabRenderer {
  layer: ImageLayer|undefined

  abstract title: string

  // brush width (diameter)
  width = 10
  // brush opacity
  opacity = 1
  // distance used to soften edge, compared to brush radius
  softness = 0.5
  // width drawn in pressure 0, compared to brush width
  minWidthRatio = 0.5

  private newTiledTexture = new TiledTexture()
  private editedRect: Rect|undefined

  private addEditedRect(rect: Rect) {
    if (this.editedRect) {
      this.editedRect = this.editedRect.union(rect)
    } else {
      this.editedRect = rect
    }
  }

  private renderRect(rect: Rect) {
    if (!this.layer) {
      return
    }
    const {picture} = this.layer
    picture.blender.dirtiness.addRect(rect)
    renderer.addPictureDirtyRect(rect)
    renderer.renderNow()
  }

  private rectForWaypoints(waypoints: Waypoint[]) {
    const rectWidth = this.width + 2
    const rectSize = new Vec2(rectWidth)
    const rects = waypoints.map(w => {
      const topLeft = new Vec2(w.pos.x - rectWidth * 0.5, w.pos.y - rectWidth * 0.5)
      return new Rect(topLeft, topLeft.add(rectSize))
    })
    return Rect.union(...rects)!.intBounding()
  }

  previewLayerTile(layer: Layer, tileKey: Vec2) {
    if (this.layer && layer == this.layer) {
      if (this.newTiledTexture.has(tileKey)) {
        return {tile: this.newTiledTexture.get(tileKey)}
      } else if (this.layer.tiledTexture.has(tileKey)) {
        return {tile: this.layer.tiledTexture.get(tileKey)}
      } else {
        return {tile: undefined}
      }
    }
  }

  start(layer: ImageLayer) {
    this.layer = layer
  }

  nextWaypoints(waypoints: Waypoint[]) {
    const rect = this.rectForWaypoints(waypoints)
    this.renderWaypoints(waypoints, rect)
    this.addEditedRect(rect)
    this.renderRect(rect)
  }

  private pushUndoStack() {
    const rect = this.editedRect
    if (!rect) {
      return
    }
    this.editedRect = undefined

    const {layer} = this
    if (!layer) {
      return
    }
    const {picture} = layer
    const command = new ChangeLayerImageCommand(picture, layer.path, this.title, this.newTiledTexture, rect)
    this.newTiledTexture = new TiledTexture()
    picture.undoStack.push(command)
  }

  endWaypoint() {
    this.pushUndoStack()
    this.layer = undefined
  }

  abstract renderWaypoints(waypoints: Waypoint[], rect: Rect): void

  protected prepareTile(key: Vec2) {
    if (!this.layer) {
      return
    }
    if (this.newTiledTexture.has(key)) {
      return this.newTiledTexture.get(key)
    } else if (this.layer.tiledTexture.has(key)) {
      const tile = this.layer.tiledTexture.get(key).clone()
      this.newTiledTexture.set(key, tile)
      return tile
    } else {
      const tile = new Tile()
      this.newTiledTexture.set(key, tile)
      return tile
    }
  }
}
