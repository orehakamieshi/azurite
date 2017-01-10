import {Vec2, Rect} from "paintvec"
import {ShapeModel, TextureDrawTarget, RectShape, Color} from "paintgl"
import {context} from "../GLContext"
import TiledTexture, {Tile} from "../models/TiledTexture"
import Layer, {LayerBlendMode, ImageLayer, GroupLayer} from "../models/Layer"
import {drawTexture} from "../GLUtil"

const normalBlendShader = {
  fragment: `
    uniform sampler2D srcTexture;
    uniform float opacity;
    void fragmentMain(vec2 pos, vec2 uv, out vec4 color) {
      color = texture2D(srcTexture, uv) * opacity;
    }
  `
}

// Nice reference: https://www.w3.org/TR/SVGCompositing/#alphaCompositing
function makeBlendShader(blendOp: string) {
  return {
    fragment: `
      uniform sampler2D srcTexture;
      uniform sampler2D dstTexture;
      uniform float opacity;
      uniform bool clipping;
      uniform bool startClipping;

      vec3 blendOp(vec3 src, vec3 dst) {
        ${blendOp}
      }

      vec3 getColor(vec4 pixel) {
        return pixel.a < 0.0001 ? vec3(0.0) : pixel.rgb / pixel.a;
      }

      void fragmentMain(vec2 pos, vec2 uv, out vec4 color) {
        vec4 src = texture2D(srcTexture, uv) * opacity;
        vec4 dst = texture2D(dstTexture, uv);
        vec4 blended = vec4(clamp(blendOp(getColor(src), getColor(dst)), 0.0, 1.0), 1.0);
        if (startClipping) {
          // clip to src
          color = blended * (src.a * dst.a) + src * (1.0 - dst.a);
        } else if (clipping) {
          // clip to dst
          color = blended * (src.a * dst.a) + dst * (1.0 - src.a);
        } else {
          // normal blending
          color = blended * (src.a * dst.a) + src * (1.0 - dst.a) + dst * (1.0 - src.a);
        }
      }
    `
  }
}

const blendOps = new Map<LayerBlendMode, string>([
  ["plus", `
    return src + dst;
  `],
  ["multiply", `
    return src * dst;
  `]
])

const tileShape = new RectShape(context, {
  rect: Tile.rect
})
const tileBlendModels = new Map(Array.from(blendOps).map(([type, op]) => {
  const shader = makeBlendShader(op)
  const model = new ShapeModel(context, {
    shape: tileShape,
    shader: shader,
    blendMode: "src",
  })
  return [type, model] as [LayerBlendMode, ShapeModel]
}))

const tileNormalModel = new ShapeModel(context, {
  shape: tileShape,
  shader: normalBlendShader,
})

class TileBlender {
  tiles = [0, 1].map(i => new Tile())
  drawTargets = this.tiles.map(tile => new TextureDrawTarget(context, tile.texture))
  clipBaseTile = new Tile()
  clipBaseDrawTarget = new TextureDrawTarget(context, this.clipBaseTile.texture)
  clipping = false

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

  blend(tile: Tile|undefined, layer: Layer, nextLayer: Layer|undefined) {
    const {opacity, blendMode} = layer
    const model = tileBlendModels.get(blendMode)
    let startClipping = !!(!layer.clippingGroup && nextLayer && nextLayer.clippingGroup)
    let endClipping = !!(layer.clippingGroup && !(nextLayer && nextLayer.clippingGroup))

    if (startClipping) {
      this.clipping = true
      drawTexture(this.clipBaseDrawTarget, this.currentTile.texture, {blendMode: "src"})
    }

    if (tile) {
      if (model) {
        this.swapCurrent()
        model.uniforms = {
          srcTexture: tile.texture,
          dstTexture: this.previousTile.texture,
          clipping: this.clipping,
          startClipping,
          opacity,
        }
        this.currentDrawTarget.draw(model)
      } else {
        tileNormalModel.uniforms = {
          srcTexture: tile.texture,
          opacity,
        }
        tileNormalModel.blendMode = startClipping ? "src" : (this.clipping ? "src-atop" : "src-over")
        this.currentDrawTarget.draw(tileNormalModel)
      }
    } else {
      if (startClipping) {
        this.currentDrawTarget.clear(new Color(0, 0, 0, 0))
      }
    }

    if (endClipping) {
      this.clipping = false
      drawTexture(this.currentDrawTarget, this.clipBaseTile.texture, {blendMode: "dst-over"})
    }
  }

  clear() {
    this.currentDrawTarget.clear(new Color(0, 0, 0, 0))
  }

  setScissor(rect: Rect|undefined) {
    for (const target of this.drawTargets) {
      target.scissor = rect
    }
  }
}

export
type ReplaceTile = (layer: Layer, tileKey: Vec2) => Tile|undefined|false

export
class LayerBlender {
  private tileBlenders = [new TileBlender()]
  replaceTile: ReplaceTile|undefined

  get blendedTile() {
    return this.tileBlenders[0].currentTile
  }

  blendTile(layers: Layer[], tileKey: Vec2, tileScissor?: Rect) {
    return this.blendLayers(layers, tileKey, tileScissor, 0)
  }

  blendToTiledTexture(layers: Layer[]) {
    const keyArrays: Vec2[][] = []
    const addKeys = (layer: Layer) => {
      if (layer instanceof GroupLayer) {
        layer.children.forEach(addKeys)
      } else if (layer instanceof ImageLayer) {
        keyArrays.push(layer.tiledTexture.keys())
      }
    }
    layers.forEach(addKeys)
    const keys = TiledTexture.unionKeys(...keyArrays)
    const tiledTexture = new TiledTexture()
    for (const key of keys) {
      this.blendTile(layers, key)
      tiledTexture.set(key, this.blendedTile.clone())
    }
    return tiledTexture
  }

  private blendLayer(layer: Layer, nextLayer: Layer|undefined, key: Vec2, scissor: Rect|undefined, depth: number): boolean {
    let tile: Tile|undefined = undefined

    if (layer.visible) {
      if (layer instanceof ImageLayer) {
        if (layer.tiledTexture.has(key)) {
          tile = layer.tiledTexture.get(key)
        }
      } else if (layer instanceof GroupLayer) {
        const {children} = layer
        const rendered = this.blendLayers(children, key, scissor, depth + 1)
        if (rendered) {
          tile = this.tileBlenders[depth + 1].currentTile
        }
      }
    }

    const tileBlender = this.tileBlenders[depth]

    if (this.replaceTile) {
      const replace = this.replaceTile(layer, key)
      if (replace != false) {
        tile = replace
      }
    }

    tileBlender.blend(tile, layer, nextLayer)
    return !!tile
  }

  private blendLayers(layers: Layer[], key: Vec2, scissor: Rect|undefined, depth: number): boolean {
    if (!this.tileBlenders[depth]) {
      this.tileBlenders[depth] = new TileBlender()
    }
    this.tileBlenders[depth].setScissor(scissor)
    this.tileBlenders[depth].clear()
    let rendered = false
    for (let i = layers.length - 1; i >= 0; --i) {
      const childRendered = this.blendLayer(layers[i], layers[i - 1], key, scissor, depth)
      rendered = rendered || childRendered
    }
    return rendered
  }
}

export const layerBlender = new LayerBlender()
