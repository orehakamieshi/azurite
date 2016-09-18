import {Vec2, Vec4, Transform, unionRect} from "../../lib/Geometry"
import Waypoint from "./Waypoint"
import BaseBrushTool from "./BaseBrushTool";
import {Geometry, Shader, Model, GeometryUsage, Framebuffer} from "../../lib/GL"
import {context} from "../GLContext"
import BrushSettings from "../views/BrushSettings"
import React = require("react")

class BrushShader extends Shader {
  get vertexShader() {
    return `
      precision mediump float;

      uniform float uBrushSize;
      uniform float uMinWidthRatio;
      uniform mat3 uTransform;
      uniform float uOpacity;

      attribute vec2 aCenter;
      attribute vec2 aOffset;
      attribute float aPressure;

      varying float vRadius;
      varying lowp float vOpacity;
      varying vec2 vOffset;

      void main(void) {
        vOffset = aOffset;
        vec3 pos = uTransform * vec3(aOffset * (uBrushSize + 2.0) + aCenter, 1.0);
        gl_Position = vec4(pos.xy, 0.0, 1.0);
        float radius = uBrushSize * 0.5 * (uMinWidthRatio + (1.0 - uMinWidthRatio) * aPressure);
        vRadius = radius;
        // transparency = (overlap count) √ (final transparency)
        vOpacity = 1.0 - pow(1.0 - min(uOpacity, 0.998), 1.0 / (radius * 2.0));
      }
    `
  }

  get fragmentShader() {
    return `
      precision mediump float;

      uniform float uBrushSize;
      uniform lowp vec4 uColor;

      varying float vRadius;
      varying lowp float vOpacity;
      varying vec2 vOffset;

      void main(void) {
        float r = length(vOffset) * (uBrushSize + 2.0);
        lowp float opacity = smoothstep(vRadius, vRadius- 1.0, r);
        gl_FragColor = uColor * opacity * vOpacity;
      }
    `
  }
}

class BrushGeometry extends Geometry {
  waypoints: Waypoint[] = []

  get attributes() {
    return [
      {attribute: "aOffset", size: 2},
      {attribute: "aCenter", size: 2},
      {attribute: "aPressure", size: 1},
    ]
  }

  update() {
    const {waypoints} = this
    const offsets = [
      new Vec2(-1,-1),
      new Vec2(-1,1),
      new Vec2(1,-1),
      new Vec2(1,1)
    ]
    const relIndices = [
      0, 1, 2,
      1, 2, 3
    ]
    const vertices = new Float32Array(waypoints.length * 20)
    const indices = new Uint16Array(waypoints.length * 6)
    for (let i = 0; i < waypoints.length; ++i) {
      const {pos, pressure} = waypoints[i]
      for (let j = 0; j < 4; ++j) {
        const offset = offsets[j]
        vertices.set([offset.x, offset.y, pos.x, pos.y, pressure], i * 20 + j * 5)
      }
      indices.set(relIndices.map(j => j + i * 4), i * 6)
    }
    this.vertexData = vertices
    this.indexData = indices
    super.update()
  }
}

export default
class BrushTool extends BaseBrushTool {
  geometry = new BrushGeometry(context, GeometryUsage.Stream)
  shader = new BrushShader(context)
  model = new Model(context, this.geometry, this.shader)
  name = "Brush"

  start(waypoint: Waypoint) {
    const layerSize = this.picture.currentLayer.size
    const transform =
      Transform.scale(new Vec2(2 / layerSize.width, 2 / layerSize.height))
        .merge(Transform.translate(new Vec2(-1, -1)))
    this.shader.uniform('uTransform').setTransform(transform)
    this.shader.uniform('uBrushSize').setFloat(this.width)
    this.shader.uniform('uColor').setVec4(this.color)
    this.shader.uniform('uOpacity').setFloat(this.opacity)
    this.shader.uniform('uMinWidthRatio').setFloat(this.minWidthRatio)

    return super.start(waypoint)
  }

  renderWaypoints(waypoints: Waypoint[]) {
    this.geometry.waypoints = waypoints
    this.geometry.update()
    this.framebuffer.use()
    this.model.render()
  }

  renderSettings() {
    return React.createFactory(BrushSettings)({tool: this})
  }
}
