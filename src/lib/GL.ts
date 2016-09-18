import {Vec2, Vec4, Transform, intBoundingRect, intersectionRect} from "./Geometry"

export
class Context {
  gl: WebGLRenderingContext
  halfFloatExt: any
  vertexArrayExt: any
  textureUnits = new TextureUnits(this)
  defaultFramebuffer = new DefaultFramebuffer(this)

  constructor(public element: HTMLCanvasElement) {
    const glOpts = {
      preserveDrawingBuffer: true,
      alpha: false,
      depth: false,
      stencil: false,
      antialias: true,
      premultipliedAlpha: true,
    }
    const gl = this.gl = element.getContext("webgl", glOpts)! as WebGLRenderingContext
    this.halfFloatExt = gl.getExtension("OES_texture_half_float")
    gl.getExtension("OES_texture_half_float_linear")
    this.vertexArrayExt = gl.getExtension("OES_vertex_array_object")

    gl.enable(gl.BLEND)

    this.resize()
  }

  setScissor(rect: Vec4) {
    const {gl} = this
    gl.enable(gl.SCISSOR_TEST)
    const intRect = intersectionRect(intBoundingRect(rect), new Vec4(0, 0, this.element.width, this.element.height))
    gl.scissor(intRect.x, intRect.y, intRect.width, intRect.height)
  }

  clearScissor() {
    const {gl} = this
    gl.disable(gl.SCISSOR_TEST)
  }

  resize() {
    const {gl, element} = this
    gl.viewport(0, 0, element.width, element.height)
  }

  setClearColor(color: Vec4) {
    const {gl} = this
    gl.clearColor(color.r, color.g, color.b, color.a)
  }

  clear() {
    const {gl} = this
    gl.clear(gl.COLOR_BUFFER_BIT)
  }

  readPixels(rect: Vec4, data: Uint8Array) {
    const {gl} = this
    gl.readPixels(rect.x, rect.y, rect.z, rect.w, gl.RGBA, gl.UNSIGNED_BYTE, data)
  }
}

export
enum DataType {
  Byte,
  HalfFloat
}

function glType(context: Context, type: DataType) {
  switch (type) {
  case DataType.Byte:
  default:
    return context.gl.UNSIGNED_BYTE
  case DataType.HalfFloat:
    return context.halfFloatExt.HALF_FLOAT_OES
  }
}

export
class Texture {
  texture: WebGLTexture

  constructor(public context: Context, public size: Vec2, public dataType: DataType = DataType.HalfFloat) {
    const {gl} = context
    this.texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    this.resize(size)
  }

  resize(size: Vec2) {
    const {gl, halfFloatExt} = this.context
    this.size = size
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size.width, size.height, 0, gl.RGBA, glType(this.context, this.dataType), null as any)
  }

  generateMipmap() {
    const {gl} = this.context
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.bindTexture(gl.TEXTURE_2D, null)
  }
}

export
class TextureUnits {
  constructor(public context: Context) {
  }

  set(i: number, texture: Texture) {
    const {gl} = this.context
    gl.activeTexture(gl.TEXTURE0 + i)
    gl.bindTexture(gl.TEXTURE_2D, texture.texture)
  }

  delete(i: number) {
    const {gl} = this.context
    gl.activeTexture(gl.TEXTURE0 + i)
    gl.bindTexture(gl.TEXTURE_2D, null)
  }
}

export
const enum GeometryUsage {
  Static, Stream, Dynamic
}

function glUsage(gl: WebGLRenderingContext, usage: GeometryUsage) {
  switch (usage) {
    case GeometryUsage.Static:
      return gl.STATIC_DRAW
    case GeometryUsage.Stream:
      return gl.STREAM_DRAW
    case GeometryUsage.Dynamic:
    default:
      return gl.DYNAMIC_DRAW
  }
}

export
abstract class Geometry {
  vertexBuffer: WebGLBuffer
  indexBuffer: WebGLBuffer
  vertexData = new Float32Array(0)
  indexData = new Uint16Array(0)
  abstract get attributes(): {attribute: string, size: number}[]
  attributesStride = this.attributes.reduce((sum, {size}) => sum + size, 0)

  constructor(public context: Context, public usage: GeometryUsage) {
    const {gl, vertexArrayExt} = context
    this.vertexBuffer = gl.createBuffer()!
    this.indexBuffer = gl.createBuffer()!
  }

  update() {
    const {gl} = this.context
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, this.vertexData, glUsage(gl, this.usage))
    gl.bindBuffer(gl.ARRAY_BUFFER, null)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indexData, glUsage(gl, this.usage))
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null)
  }
}

export
class SimpleGeometry extends Geometry {
  get attributes() {
    return [
      {attribute: "aPosition", size: 2},
      {attribute: "aTexCoord", size: 2},
    ]
  }
  positions: Vec2[] = []
  texCoords: Vec2[] = []

  update() {
    const vertexData = this.vertexData = new Float32Array(this.positions.length * 4)
    for (let i = 0; i < this.positions.length; ++i) {
      const position = this.positions[i]
      const texCoord = this.texCoords[i]
      vertexData.set([position.x, position.y, texCoord.x, texCoord.y], i * 4)
    }
    super.update()
  }
}

export
class RectGeometry extends SimpleGeometry {
  rect = new Vec4(0)
  texCoords = [new Vec2(0, 0), new Vec2(1, 0), new Vec2(0, 1), new Vec2(1, 1)]
  indexData = new Uint16Array([0, 1, 2, 1, 2, 3])

  update() {
    const {x, y} = this.rect.xy
    const {width, height} = this.rect.size
    this.positions = [
      new Vec2(x, y),
      new Vec2(x + width, y),
      new Vec2(x, y + height),
      new Vec2(x + width, y + height)
    ]
    super.update()
  }
}

export
class Uniform {
  location: WebGLUniformLocation

  constructor(public context: Context, public shader: Shader, public name: string) {
    const {gl} = context
    this.location = gl.getUniformLocation(shader.program, name)!
  }

  setInt(value: number) {
    const {gl} = this.context
    gl.useProgram(this.shader.program)
    gl.uniform1i(this.location, value)
  }

  setFloat(value: number) {
    const {gl} = this.context
    gl.useProgram(this.shader.program)
    gl.uniform1f(this.location, value)
  }

  setVec2(value: Vec2) {
    const {gl} = this.context
    gl.useProgram(this.shader.program)
    gl.uniform2fv(this.location, value.toGLData())
  }

  setVec4(value: Vec4) {
    const {gl} = this.context
    gl.useProgram(this.shader.program)
    gl.uniform4fv(this.location, value.toGLData())
  }

  setTransform(value: Transform) {
    const {gl} = this.context
    gl.useProgram(this.shader.program)
    gl.uniformMatrix3fv(this.location, false, value.toGLData())
  }
}

export
abstract class Shader {
  program: WebGLProgram

  abstract get vertexShader(): string
  abstract get fragmentShader(): string

  constructor(public context: Context) {
    const {gl} = context
    this.program = gl.createProgram()!
    this._addShader(gl.VERTEX_SHADER, this.vertexShader)
    this._addShader(gl.FRAGMENT_SHADER, this.fragmentShader)
    gl.linkProgram(this.program)
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error(`Failed to link shader:\n${gl.getProgramInfoLog(this.program)}`)
    }
  }

  private _addShader(type: number, source: string) {
    const {gl} = this.context
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`Failed to compile shader:\n${gl.getShaderInfoLog(shader)}`)
    }
    gl.attachShader(this.program, shader)
  }

  uniform(name: string) {
    return new Uniform(this.context, this, name)
  }
}


export
abstract class SimpleShader extends Shader {
  get vertexShader() {
    return `
      precision highp float;

      uniform mat3 uTransform;
      attribute vec2 aPosition;
      attribute vec2 aTexCoord;
      varying vec2 vTexCoord;

      void main(void) {
        vTexCoord = aTexCoord;
        vec3 pos = uTransform * vec3(aPosition, 1.0);
        gl_Position = vec4(pos.xy, 0.0, 1.0);
      }
    `
  }
  uTransform = this.uniform("uTransform")

  constructor(context: Context) {
    super(context)
    this.uTransform.setTransform(Transform.identity)
  }
}

export
class ColorShader extends SimpleShader {
  get fragmentShader() {
    return `
      precision mediump float;
      uniform vec4 uColor;
      void main(void) {
        gl_FragColor = uColor;
      }
    `
  }

  uColor = this.uniform("uColor")
}

export
class TextureShader extends SimpleShader {
  get fragmentShader() {
    return `
      precision mediump float;
      varying highp vec2 vTexCoord;
      uniform sampler2D uTexture;
      void main(void) {
        gl_FragColor = texture2D(uTexture, vTexCoord);
      }
    `
  }
  constructor(context: Context) {
    super(context)
    this.uniform("uTexture").setInt(0)
  }
}

export
enum BlendMode {
  Src,
  SrcOver,
  // TODO
}

export
class Model {
  vertexArray: any
  blendFuncs: [number, number]
  constructor(public context: Context, public geometry: Geometry, public shader: Shader) {
    const {gl, vertexArrayExt} = context
    this.geometry.update()
    this.vertexArray = vertexArrayExt.createVertexArrayOES()
    vertexArrayExt.bindVertexArrayOES(this.vertexArray)
    gl.useProgram(shader.program)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.geometry.vertexBuffer)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.geometry.indexBuffer)
    let offset = 0
    for (const {attribute, size} of this.geometry.attributes) {
      const pos = gl.getAttribLocation(shader.program, attribute)!
      gl.enableVertexAttribArray(pos)
      gl.vertexAttribPointer(pos, size, gl.FLOAT, false, this.geometry.attributesStride * 4, offset * 4)
      offset += size
    }
    vertexArrayExt.bindVertexArrayOES(null)

    this.setBlendMode(BlendMode.SrcOver)
  }

  setBlendMode(mode: BlendMode) {
    const {gl} = this.context
    switch (mode) {
      case BlendMode.Src:
        this.blendFuncs = [gl.ONE, gl.ZERO]
        break
      case BlendMode.SrcOver:
        this.blendFuncs = [gl.ONE, gl.ONE_MINUS_SRC_ALPHA]
        break
    }
  }

  render(first = 0, count = this.geometry.indexData.length) {
    const {gl, vertexArrayExt} = this.context
    gl.blendFunc(this.blendFuncs[0], this.blendFuncs[1])
    gl.useProgram(this.shader.program)
    vertexArrayExt.bindVertexArrayOES(this.vertexArray)
    gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, first * 2)
    vertexArrayExt.bindVertexArrayOES(null)
  }
}

export
class Framebuffer {
  framebuffer: WebGLFramebuffer
  constructor(public context: Context, public texture?: Texture) {
    const {gl} = context
    this.framebuffer = gl.createFramebuffer()!
    if (texture) {
      this.setTexture(texture)
    }
  }

  setTexture(texture: Texture) {
    const {gl} = this.context
    this.texture = texture
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture.texture, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  use() {
    if (this.texture) {
      const {gl} = this.context
      const {width, height} = this.texture.size
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer)
      gl.viewport(0, 0, width, height)
    }
  }
}

export
class DefaultFramebuffer {
  constructor(public context: Context) {
  }
  use() {
    const {gl, element} = this.context
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, element.width, element.height)
  }
}
