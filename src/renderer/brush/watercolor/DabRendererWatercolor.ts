import {Vec2, Rect, Transform} from "paintvec"
import {ShapeModel, RectShape, Texture, TextureDrawTarget} from "paintgl"
import {context} from "../../GLContext"
import {drawTexture} from "../../GLUtil"
import TiledTexture, {Tile} from "../../models/TiledTexture"
import {appState} from "../../app/AppState"
import {DabRenderer} from "../DabRenderer"
import {ImageLayer} from "../../models/Layer"
import {Waypoint} from "../Waypoint"
import {BrushPresetWatercolor} from "./BrushPresetWatercolor"

enum ShapeClipModes {
  Shape, Clip
}

const shapeClipShader = {
  vertex: `
    uniform vec2 uBrushPos;
    uniform float uSampleSize;
    uniform float uPressure;
    uniform float uMinWidthRatio;
    uniform float uBrushRadius;
    uniform vec2 uPictureSize;
    varying vec2 vOffset;
    varying float vRadius;
    varying vec2 vSelectionUV;

    void vertexMain(vec2 pos, vec2 uv) {
      vRadius = uBrushRadius * (uMinWidthRatio + (1.0 - uMinWidthRatio) * uPressure);
      vOffset = pos - uSampleSize * 0.5;
      vSelectionUV = (vOffset + floor(uBrushPos)) / uPictureSize;
    }
  `,
  fragment: `
    uniform vec2 uBrushPos;
    uniform float uSoftness;
    uniform sampler2D uOriginalTexture;
    uniform float uMode;
    uniform bool uPreserveOpacity;
    uniform bool uHasSelection;
    uniform sampler2D uSelection;

    varying vec2 vOffset;
    varying float vRadius;
    varying vec2 vSelectionUV;

    vec4 fetchOriginal(vec2 uv) {
      return texture2D(uOriginalTexture, uv);
    }

    float calcOpacity(float r) {
      return smoothstep(vRadius, vRadius - max(1.0, vRadius * uSoftness), r);
    }

    void fragmentMain(vec2 pos, vec2 uv, out vec4 color) {
      float r = distance(fract(uBrushPos), vOffset);
      float opacity = calcOpacity(r);
      vec4 original = fetchOriginal(uv);
      if (uMode == ${ShapeClipModes.Shape}.0) {
        float clip = 1.0;
        if (uPreserveOpacity) {
          clip *= original.a;
        }
        if (uHasSelection) {
          clip *= texture2D(uSelection, vSelectionUV).a;
        }
        color = vec4(opacity * clip);
      } else {
        color = original * opacity;
      }
    }
  `
}

const watercolorShader = {
  vertex: `
    uniform float uSampleSize;
    uniform mediump float uPressure;
    uniform mediump float uOpacity;
    uniform sampler2D uShapeClipTexture;

    varying vec4 vMixColor;
    varying mediump float vOpacity;

    vec4 calcMixColor() {
      float topLod = log2(uSampleSize);
      vec4 sampleAverage = texture2DLod(uShapeClipTexture, vec2(0.75, 0.5), topLod);
      vec4 shapeAverage = texture2DLod(uShapeClipTexture, vec2(0.25, 0.5),  topLod);
      if (shapeAverage.a < 0.001) {
        return vec4(0.0);
      }
      return sampleAverage / shapeAverage.a;
    }

    void vertexMain(vec2 pos, vec2 uv) {
      vMixColor = calcMixColor();
      vOpacity = uOpacity * uPressure;
    }
  `,
  fragment: `
    precision mediump float;

    uniform float uBlending;
    uniform float uThickness;
    uniform vec4 uColor;
    uniform bool uPreserveOpacity;

    uniform sampler2D uOriginalTexture;
    uniform sampler2D uShapeClipTexture;

    varying vec4 vMixColor;
    varying float vOpacity;

    void fragmentMain(vec2 pos, vec2 uv, out vec4 outColor) {
      float opacity = texture2D(uShapeClipTexture, uv * vec2(0.5, 1.0)).a * vOpacity;
      vec4 orig = texture2D(uOriginalTexture, uv);

      float mixRate = opacity * uBlending;

      vec4 mixColor = vMixColor;
      if (uPreserveOpacity) {
        mixColor *= orig.a;
      }
      // mix color
      vec4 color = mix(orig, mixColor, mixRate);
      // add color
      vec4 addColor = uColor * (uThickness * opacity);

      outColor = addColor + color * (1.0 - addColor.a);
    }
  `
}

export
class DabRendererWatercolor extends DabRenderer {
  readonly title = "Watercolor"

  private shape = new RectShape(context, {rect: new Rect()})
  private model = new ShapeModel(context, {shape: this.shape, blendMode: "src", shader: watercolorShader})
  private drawTarget = new TextureDrawTarget(context)
  private originalTexture = new Texture(context, {pixelType: "half-float"})
  private originalDrawTarget = new TextureDrawTarget(context, this.originalTexture)
  private shapeClipTexture = new Texture(context, {pixelType: "half-float", filter: "mipmap-nearest"})
  private shapeClipDrawTarget = new TextureDrawTarget(context, this.shapeClipTexture)
  private shapeClipModel = new ShapeModel(context, {shape: this.shape, blendMode: "src", shader: shapeClipShader})

  private sampleSize = 0

  constructor(public preset: BrushPresetWatercolor) {
    super(preset)
  }

  start(layer: ImageLayer) {
    super.start(layer)
    const {preserveOpacity} = layer
    const {preset} = this

    this.sampleSize = Math.pow(2, Math.ceil(Math.log2(preset.width + 2)))

    this.model.uniforms = {
      uSampleSize: this.sampleSize,
      uBlending: preset.blending,
      uThickness: preset.thickness,
      uColor: appState.color.toRgb(),
      uOpacity: preset.opacity,
      uPreserveOpacity: preserveOpacity,
    }

    this.shapeClipModel.uniforms = {
      uPictureSize: layer.picture.size,
      uSampleSize: this.sampleSize,
      uBrushRadius: preset.width * 0.5,
      uSoftness: preset.softness,
      uMinWidthRatio: preset.minWidthRatio,
      uPreserveOpacity: preserveOpacity,
      uHasSelection: layer.picture.selection.hasSelection,
      uSelection: layer.picture.selection.texture,
    }

    this.originalTexture.size = new Vec2(this.sampleSize)
    this.shapeClipTexture.size = new Vec2(this.sampleSize * 2, this.sampleSize)
    this.shape.rect = new Rect(new Vec2(), new Vec2(this.sampleSize))
  }

  renderWaypoints(waypoints: Waypoint[], rect: Rect) {
    for (let i = 0; i < waypoints.length; ++i) {
      const waypoint = waypoints[i]
      this.shapeClipModel.uniforms["uBrushPos"] = waypoint.pos
      this.shapeClipModel.uniforms["uPressure"] = waypoint.pressure
      this.model.uniforms["uPressure"] = waypoint.pressure

      const topLeft = waypoint.pos.floor().sub(new Vec2(this.sampleSize / 2))

      for (const key of TiledTexture.keysForRect(rect)) {
        const tile = this.prepareTile(key)
        if (!tile) {
          continue
        }
        const offset = key.mulScalar(Tile.width).sub(topLeft)
        drawTexture(this.originalDrawTarget, tile.texture, {blendMode: "src", transform: Transform.translate(offset)})
      }

      this.shapeClipModel.uniforms["uOriginalTexture"] = this.originalTexture

      // draw brush shape in left of sample texture
      this.shapeClipModel.uniforms["uMode"] = ShapeClipModes.Shape
      this.shapeClipModel.transform = new Transform()
      this.shapeClipDrawTarget.draw(this.shapeClipModel)

      // draw original colors clipped by brush shape in right of sample texture
      this.shapeClipModel.uniforms["uMode"] = ShapeClipModes.Clip
      this.shapeClipModel.transform = Transform.translate(new Vec2(this.sampleSize, 0))
      this.shapeClipDrawTarget.draw(this.shapeClipModel)

      this.shapeClipTexture.generateMipmap()

      this.model.uniforms["uOriginalTexture"] = this.originalTexture
      this.model.uniforms["uShapeClipTexture"] = this.shapeClipTexture

      for (const key of TiledTexture.keysForRect(rect)) {
        const tile = this.prepareTile(key)
        if (!tile) {
          continue
        }
        this.drawTarget.texture = tile.texture
        this.model.transform = Transform.translate(topLeft.sub(key.mulScalar(Tile.width)))
        this.drawTarget.draw(this.model)
      }
    }
  }
}