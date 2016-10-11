import {Vec2, Rect, Transform} from "paintvec"
import {TextureDrawTarget, Shape, Shader}  from "paintgl"
import Waypoint from "./Waypoint"
import BaseBrushTool from "./BaseBrushTool";
import {context} from "../GLContext"
import BrushSettings from "../views/BrushSettings"
import TiledTexture from "./TiledTexture"
import React = require("react")

class BrushShader extends Shader {
  get additionalVertexShader() {
    return `
      uniform float uBrushSize;
      uniform float uSpacingRatio;
      uniform float uMinWidthRatio;
      uniform float uOpacity;

      attribute vec2 aCenter;

      varying mediump float vRadius;
      varying mediump float vOpacity;
      varying mediump vec2 vOffset;

      void paintgl_additional() {
        vOffset = aPosition - aCenter;

        float brushSize = uBrushSize * (uMinWidthRatio + (1.0 - uMinWidthRatio) * aTexCoord.x);
        float radius = brushSize * 0.5;
        vRadius = radius;

        // transparency = (overlap count) √ (final transparency)
        float spacing = max(brushSize * uSpacingRatio, 1.0);
        vOpacity = 1.0 - pow(1.0 - min(uOpacity, 0.998), spacing / brushSize);
      }
    `
  }
  get fragmentShader() {
    return `
      precision mediump float;

      uniform highp float uBrushSize;
      uniform float uSoftness;
      uniform vec4 uColor;

      varying float vRadius;
      varying float vOpacity;
      varying vec2 vOffset;

      void main(void) {
        float r = length(vOffset);
        lowp float opacity = smoothstep(vRadius, vRadius - max(1.0, vRadius * uSoftness), r);
        gl_FragColor = uColor * opacity * vOpacity;
      }
    `
  }
}

export default
class BrushTool extends BaseBrushTool {
  shape = new Shape(context, {positions: [], texCoords: [], shader: BrushShader})
  drawTarget = new TextureDrawTarget(context)
  name = "Brush"
  eraser = false

  start(waypoint: Waypoint) {
    this.shape.uniforms = {
      uBrushSize: this.width,
      uColor: this.color,
      uOpacity: this.opacity,
      uMinWidthRatio: this.minWidthRatio,
      uSpacingRatio: this.spacingRatio,
      uSoftness: this.softness,
    }
    return super.start(waypoint)
  }

  renderWaypoints(waypoints: Waypoint[], rect: Rect) {
    const relIndices = [
      0, 1, 2,
      1, 2, 3
    ]

    const positions: Vec2[] = []
    const texCoords: Vec2[] = []
    const centers: Vec2[] = []
    const indices: number[] = []

    const halfRectSize = new Vec2((this.width + 2) / 2)

    for (let i = 0; i < waypoints.length; ++i) {
      const {pos, pressure} = waypoints[i]

      const rect = new Rect(pos.sub(halfRectSize), pos.add(halfRectSize))
      positions.push(...rect.vertices())

      const texCoord = new Vec2(pressure, 0) // use to pass pressure
      texCoords.push(texCoord, texCoord, texCoord, texCoord)

      centers.push(pos, pos, pos, pos)

      indices.push(...relIndices.map(j => j + i * 4))
    }
    this.shape.positions = positions
    this.shape.texCoords = texCoords
    this.shape.setVec2Attributes("aCenter", centers)
    this.shape.indices = indices

    const {tiledTexture} = this.picture.currentLayer

    this.shape.blendMode = this.eraser ? "dst-out" : "src-over"

    for (const key of TiledTexture.keysForRect(rect)) {
      this.drawTarget.texture = tiledTexture.get(key)
      this.shape.transform = Transform.translate(key.mulScalar(-TiledTexture.tileSize))
      this.drawTarget.draw(this.shape)
    }
  }

  renderSettings() {
    return React.createFactory(BrushSettings)({tool: this})
  }
}
