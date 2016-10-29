import Picture from "./Picture"
import {Vec2, Rect, Transform} from "paintvec"
import {Model, Texture, TextureDrawTarget, Shader, TextureShader, RectShape, PixelType, Color} from "paintgl"
import {context} from "../GLContext"
import TiledTexture from "./TiledTexture"
import Layer, {LayerBlendMode} from "./Layer"
import {drawTexture} from "../GLUtil"

abstract class BlendShader extends Shader {
  abstract get blendOp(): string

  get fragmentShader() {
    return `
      precision mediump float;
      varying highp vec2 vTexCoord;
      uniform sampler2D srcTexture;
      uniform sampler2D dstTexture;
      uniform float opacity;
      vec4 blendOp(vec4 src, vec4 dst) {
        ${this.blendOp}
      }
      void main(void) {
        vec4 src = texture2D(srcTexture, vTexCoord) * opacity;
        vec4 dst = texture2D(dstTexture, vTexCoord);
        gl_FragColor = clamp(blendOp(src, dst), 0.0, 1.0);
      }
    `
  }
}

// https://www.w3.org/TR/SVGCompositing/
const blendOps = new Map<LayerBlendMode, string>([
  ["normal", `
    return src + dst * (1.0 - src.a);
  `],
  ["plus", `
    return src + dst;
  `],
  ["multiply", `
    return src * dst + src * (1.0 - dst.a) + dst * (1.0 - src.a);
  `]
])

const tileRect = new Rect(new Vec2(), new Vec2(TiledTexture.tileSize))

class TileBlender {
  shape = new RectShape(context, {
    rect: tileRect
  })
  models = new Map<LayerBlendMode, Model>()

  tiles = [0, 1].map(i => new Texture(context, {
    size: new Vec2(TiledTexture.tileSize),
    pixelType: "half-float",
  }))
  drawTargets = this.tiles.map(tile => new TextureDrawTarget(context, tile))

  currentIndex = 0

  swapCurrent() {
    this.currentIndex = [1, 0][this.currentIndex]
  }

  get currentTile() {
    return this.tiles[this.currentIndex]
  }
  get currentDrawTarget() {
    return this.drawTargets[this.currentIndex]
  }
  get previousTile() {
    return this.tiles[[1, 0][this.currentIndex]]
  }
  get previousDrawTarget() {
    return this.drawTargets[[1, 0][this.currentIndex]]
  }

  constructor() {
    for (const [type, op] of blendOps) {
      class shader extends BlendShader {
        get blendOp() {
          return op
        }
      }
      const model = new Model(context, {
        shape: this.shape,
        shader: shader
      })
      this.models.set(type, model)
    }
  }

  blend(tile: Texture, mode: LayerBlendMode, opacity: number) {
    this.swapCurrent()
    const model = this.models.get(mode)!
    model.uniforms = {
      srcTexture: tile,
      dstTexture: this.previousTile,
      opacity
    }
    this.currentDrawTarget.draw(model)
  }

  clear() {
    this.currentDrawTarget.clear(new Color(1, 1, 1, 1))
  }

  setScissor(rect: Rect|undefined) {
    for (const target of this.drawTargets) {
      target.scissor = rect
    }
  }
}

const tileBlender = new TileBlender()

export default
class LayerBlender {
  blendedTexture = new Texture(context, {
    size: this.picture.size,
    pixelType: "half-float",
  })
  drawTarget = new TextureDrawTarget(context, this.blendedTexture)

  constructor(public picture: Picture) {
  }

  render(rect?: Rect) {
    this.drawTarget.scissor = rect
    const tileKeys = TiledTexture.keysForRect(rect || new Rect(new Vec2(0), this.picture.size))
    for (const key of tileKeys) {
      const offset = key.mulScalar(TiledTexture.tileSize)
      const tileScissor = rect
        ? new Rect(rect.topLeft.sub(offset), rect.bottomRight.sub(offset)).intersection(tileRect)
        : undefined
      tileBlender.setScissor(tileScissor)
      tileBlender.clear()
      this.renderTile(this.picture.rootLayer, key)
      drawTexture(this.drawTarget, tileBlender.currentTile, {offset, blendMode: "src"})
    }
  }

  renderTile(layer: Layer, key: Vec2) {
    if (!layer.visible) {
      return
    }
    const {content} = layer
    if (content.type == "image") {
      if (content.tiledTexture.has(key)) {
        tileBlender.blend(content.tiledTexture.get(key), layer.blendMode, layer.opacity)
      }
    } else {
      const {children} = content
      for (let i = children.length - 1; i >= 0; --i) {
        this.renderTile(children[i], key)
      }
    }
  }

  dispose() {
    this.drawTarget.dispose()
    this.blendedTexture.dispose()
  }
}
