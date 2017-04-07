import {PSDColorMode, PSDLayerInfo, PSDChannelInfo, PSDBlendModeKey, PSDSectionType} from "./PSDTypes"
import {Rect, Vec2} from "paintvec"
import * as iconv from "iconv-lite"

class PSDBinaryReader {
  offset = 0
  savedOffsets: number[] = []
  constructor(public data: Buffer) {
  }
  buffer(size: number)  {
    const buf = this.data.slice(this.offset, this.offset + size)
    this.offset += size
    return buf
  }
  skip(size: number) {
    this.offset += size
  }
  uint8() {
    const i = this.offset
    ++this.offset
    return this.data.readUInt8(i)
  }
  uint16() {
    const i = this.offset
    this.offset += 2
    return this.data.readUInt16BE(i)
  }
  uint32() {
    const i = this.offset
    this.offset += 4
    return this.data.readUInt32BE(i)
  }
  ascii(count: number) {
    const buf = this.buffer(count)
    return buf.toString('ascii')
  }
  utf16(count: number) {
    const buf = this.buffer(count * 2)
    return iconv.decode(buf, 'utf16-be')
  }
  pushOffset() {
    this.savedOffsets.push(this.offset)
  }
  popOffset() {
    const offset = this.savedOffsets.pop()
    if (offset == undefined) {
      throw new Error("cannot pop offset")
    }
    this.offset = offset
  }
}

// https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/
export default
class PSDReader {
  reader = new PSDBinaryReader(this.data)
  numberOfChannels: number
  height: number
  width: number
  depth: number
  colorMode: PSDColorMode
  numberOfLayers: number
  layerInfos: PSDLayerInfo[] = []

  constructor(public data: Buffer) {
  }

  readFileHeader() {
    const {reader} = this
    const signature = reader.ascii(4)
    if (signature != '8BPS') {
      throw new Error('Wrong signature')
    }
    const version = reader.uint16()
    if (version != 1) {
      // TODO: PSB support
      throw new Error('Unsupported version')
    }
    reader.skip(6)
    this.numberOfChannels = reader.uint16()
    this.height = reader.uint32()
    this.width = reader.uint32()
    this.depth = reader.uint16()
    this.colorMode = reader.uint16()
  }

  readColorModeData() {
    const {reader} = this
    const len = reader.uint32()
    reader.skip(len) // TODO
  }

  readImageResouces() {
    const {reader} = this
    const len = reader.uint32()
    reader.skip(len) // TODO
  }

  readLayerAndMasInformation() {
    const {reader} = this
    reader.uint32() // length
    this.readLayerInfo()
  }

  readLayerInfo() {
    const {reader} = this
    reader.uint32() // length
    this.numberOfLayers = reader.uint16()
    this.readLayerRecords()
    this.readChannelImageData()
  }

  readLayerRecords() {
    for (let i = 0; i < this.numberOfLayers; ++i) {
      this.readLayerRecord()
    }
  }

  readLayerRecord(): PSDLayerInfo {
    const {reader} = this
    const top = reader.uint32()
    const left = reader.uint32()
    const bottom = reader.uint32()
    const right = reader.uint32()
    const rect = new Rect(new Vec2(left, top), new Vec2(right, bottom))
    const channelCount = reader.uint16()
    const channelInfos: PSDChannelInfo[] = []
    for (let i = 0; i < channelCount; ++i) {
      channelInfos.push({
        id: reader.uint16(),
        dataLength: reader.uint32(),
      })
    }
    const blendModeSig = reader.ascii(4)
    if (blendModeSig != '8BIM') {
      throw new Error('Blend mode signature is wrong')
    }
    const blendMode = reader.ascii(4) as PSDBlendModeKey
    const opacity = reader.uint8()
    const clipping = reader.uint8() === 1
    const flags = reader.uint8()
    const transparencyProtected = (flags & 1) !== 0
    const visible = (flags & (1 << 1)) !== 0
    reader.skip(1) // filler
    const extraDataFieldLength = reader.uint32()
    reader.buffer(extraDataFieldLength) // TODO

    return {
      name: '', // TODO
      opacity,
      clipping,
      transparencyProtected,
      visible,
      rect,
      blendMode,
      sectionType: PSDSectionType.Layer, // TODO
      channelInfos,
      channelDatas: [], // TODO
    }
  }

  readChannelImageData() {
  }
}