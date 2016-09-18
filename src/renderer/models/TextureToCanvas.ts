import {Vec2, Vec4} from "../../lib/Geometry"
import {Texture, TextureShader, RectGeometry, Model, DataType, GeometryUsage, Framebuffer, BlendMode} from "../../lib/GL"
import {context} from "../GLContext"

class TextureToCanvasShader extends TextureShader {
  get fragmentShader() {
    return `
      precision mediump float;
      varying highp vec2 vTexCoord;
      uniform sampler2D uTexture;
      uniform vec4 uBackground;
      void main(void) {
        vec4 texColor = texture2D(uTexture, vTexCoord);
        vec4 color = texColor + uBackground * (1.0 - texColor.a);
        vec4 nonPremultColor = vec4(color.rgb / color.a, color.a);
        gl_FragColor = nonPremultColor;
      }
    `
  }
  uBackground = this.uniform("uBackground")
}

const shader = new TextureToCanvasShader(context)

const geom = new RectGeometry(context, GeometryUsage.Static)
geom.rect = new Vec4(-1, -1, 2, 2)

const model = new Model(context, geom, shader)
model.setBlendMode(BlendMode.Src)

// render texture content to canvas element
export default
class TextureToCanvas {
  canvas = document.createElement("canvas")
  context = this.canvas.getContext("2d")!
  backgroundColor = new Vec4(1)
  imageData = new ImageData(this.size.width, this.size.height)
  texture = new Texture(context, this.size, DataType.Byte)
  framebuffer = new Framebuffer(context, this.texture)

  constructor(public size: Vec2) {
    this.canvas.width = size.width
    this.canvas.height = size.height
  }

  loadTexture(texture: Texture) {
    this.framebuffer.use()
    context.textureUnits.set(0, texture)
    shader.uBackground.setVec4(this.backgroundColor)
    model.render()
    context.textureUnits.delete(0)
    context.readPixels(Vec4.fromVec2(new Vec2(0), this.size), new Uint8Array(this.imageData.data.buffer))
    this.context.putImageData(this.imageData, 0, 0)
  }
}
