import * as React from "react"
import {reaction, observable, computed} from "mobx"
import {observer} from "mobx-react"
import {Vec2, Rect, Transform} from "paintvec"
import {TextureDrawTarget, Color} from "paintgl"
import Picture from "../models/Picture"
import Layer from "../models/Layer"
import TiledTexture, {Tile, TiledTextureRawData} from "../models/TiledTexture"
import {TileBlender} from "../models/LayerBlender"
import Waypoint from "../models/Waypoint"
import Tool from './Tool'
import {context} from "../GLContext"
import {AppState} from "../state/AppState"
import {frameDebounce} from "../../lib/Debounce"
import {TransformLayerCommand} from "../commands/LayerCommand"

@observer
class TransformLayerOverlayUI extends React.Component<{tool: TransformLayerTool}, {}> {
  render() {
    const {tool} = this.props
    const {boundingRect} = tool

    const transformPos = (pos: Vec2) => {
      return pos.transform(tool.transform).transform(tool.renderer.transformFromPicture).divScalar(devicePixelRatio)
    }

    if (!boundingRect) {
      return <g />
    }
    const {topLeft, topRight, bottomLeft, bottomRight} = boundingRect
    const polygonPoints = [topLeft, topRight, bottomRight, bottomLeft]
      .map(transformPos)
      .map(v => `${v.x},${v.y}`).join(" ")
    const handlePositions = [
      topLeft,
      topRight,
      bottomRight,
      bottomLeft,
      topLeft.add(topRight).divScalar(2),
      topRight.add(bottomRight).divScalar(2),
      bottomRight.add(bottomLeft).divScalar(2),
      bottomLeft.add(topLeft).divScalar(2),
    ].map(transformPos)
    return (
      <g>
        <polygon points={polygonPoints} stroke="#888" fill="transparent" />
        {handlePositions.map(pos => <circle cx={pos.x} cy={pos.y} r="4" stroke="#888" fill="#FFF" />)}
      </g>
    )
  }
}

const transformedTile = new Tile()
const transformedDrawTarget = new TextureDrawTarget(context, transformedTile.texture)

enum DragType {
  None,
  Translate,
  MoveTopLeft,
  MoveTopCenter,
  MoveTopRight,
  MoveCenterRight,
  MoveBottomRight,
  MoveBottomCenter,
  MoveBottomLeft,
  MoveCenterLeft,
  Rotate,
}

export default
class TransformLayerTool extends Tool {
  name = "Move"

  dragType = DragType.None
  originalPos = new Vec2()
  originalTranslation = new Vec2()
  @observable translation = new Vec2()
  @observable boundingRect: Rect|undefined
  originalTiledTexture = new TiledTexture()
  oldTransform = new Transform()

  constructor(appState: AppState) {
    super(appState)
    reaction(() => this.currentContent, () => this.onCurrentContentChange())
    reaction(() => this.picture && this.picture.lastUpdate, () => this.onCurrentContentChange())
  }

  onCurrentContentChange() {
    const content = this.currentContent
    if (content) {
      this.boundingRect = content && content.tiledTexture.boundingRect()
      this.originalTiledTexture = content.tiledTexture.clone()
      this.oldTransform = new Transform()
    }
  }

  get transform() {
    return Transform.translate(this.translation)
  }

  @computed get currentContent() {
    const {active, currentLayer} = this
    if (active && currentLayer && currentLayer.content.type == "image") {
      return currentLayer.content
    }
  }

  start(waypoint: Waypoint, rendererPos: Vec2) {
    if (!this.boundingRect) {
      return
    }
    const pos = this.originalPos = waypoint.pos.round()
    this.originalTranslation = this.translation

    const rect = this.boundingRect
    const {topLeft, topRight, bottomLeft, bottomRight} = rect

    const handlePoints = new Map<DragType, Vec2>([
      [DragType.MoveTopLeft, topLeft],
      [DragType.MoveTopCenter, topLeft.add(topRight).divScalar(2)],
      [DragType.MoveTopRight, topRight],
      [DragType.MoveCenterRight, topRight.add(bottomRight).divScalar(2)],
      [DragType.MoveBottomRight, bottomRight],
      [DragType.MoveBottomCenter, bottomRight.add(bottomLeft).divScalar(2)],
      [DragType.MoveBottomLeft, bottomLeft],
      [DragType.MoveCenterLeft, bottomLeft.add(topLeft).divScalar(2)],
    ])

    for (const [dragType, handlePos] of handlePoints) {
      if (pos.sub(handlePos).length() <= 4) {
        this.dragType = dragType
        return
      }
    }
  }

  move(waypoint: Waypoint, rendererPos: Vec2) {
    if (this.dragType == DragType.Translate) {
      this.translation = waypoint.pos.round().sub(this.originalPos).add(this.originalTranslation)
      this.update()
    }
  }

  update = frameDebounce(() => {
    if (this.picture) {
      this.picture.layerBlender.render()
      this.renderer.render()
    }
  })

  end() {
    this.dragType = DragType.None
    this.commit()
    this.translation = new Vec2()
  }

  renderOverlayUI() {
    return <TransformLayerOverlayUI tool={this} />
  }

  commit() {
    if (this.picture && this.currentContent) {
      const command = new TransformLayerCommand(this.picture, this.currentContent.layer.path(), this.originalTiledTexture, this.oldTransform, this.transform)
      this.oldTransform = this.transform
      this.picture.undoStack.redoAndPush(command)
      this.boundingRect = this.currentContent.tiledTexture.boundingRect()
    }
  }

  hookLayerBlend(layer: Layer, tileKey: Vec2, tile: Tile|undefined, tileBlender: TileBlender) {
    const content = this.currentContent
    if (this.dragType != DragType.None && content && layer == content.layer) {
      transformedDrawTarget.clear(new Color(0,0,0,0))
      content.tiledTexture.drawToDrawTarget(transformedDrawTarget, {offset: tileKey.mulScalar(-Tile.width), blendMode: "src", transform: this.transform})
      const {blendMode, opacity} = layer
      tileBlender.blend(transformedTile, blendMode, opacity)
      return true
    } else {
      return false
    }
  }
}

