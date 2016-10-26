import {observable, action, IObservableArray} from "mobx"
import Picture from "./Picture"
import Layer, {LayerData} from "./Layer"
import TiledTexture, {TiledTextureData} from "./TiledTexture"

export
interface ImageLayerContentData {
  type: "image"
  image: TiledTextureData
}

export
class ImageLayerContent {
  type: "image" = "image"

  @observable thumbnail = ""

  constructor(public readonly layer: Layer, public tiledTexture: TiledTexture = new TiledTexture()) {
    this.updateThumbnail()
  }

  toData(): ImageLayerContentData {
    const image = this.tiledTexture.toData()
    return {
      type: "image",
      image,
    }
  }

  dispose() {
    this.tiledTexture.dispose()
  }

  static fromData(layer: Layer, data: ImageLayerContentData) {
    const tiledTexture = TiledTexture.fromData(data.image)
    return new ImageLayerContent(layer, tiledTexture)
  }

  @action updateThumbnail() {
    this.thumbnail = this.layer.picture.thumbnailGenerator.generate(this.tiledTexture)
  }
}

export
interface GroupLayerContentData {
  type: "group"
  children: LayerData[]
}

export
class GroupLayerContent {
  type: "group" = "group"

  children: IObservableArray<Layer>

  constructor(public readonly layer: Layer, children: Layer[]) {
    this.children = observable(children)
    this.children.observe(() => {
      for (const child of this.children) {
        child.parent = layer
      }
    })
  }

  toData(): GroupLayerContentData {
    const children = this.children.map(c => c.toData())
    return {
      type: "group",
      children,
    }
  }

  dispose() {
    for (let c of this.children) {
      c.dispose()
    }
  }

  static fromData(layer: Layer, data: GroupLayerContentData) {
    const children = data.children.map(d => Layer.fromData(layer.picture, d))
    return new GroupLayerContent(layer, children)
  }
}

export type LayerContentData = ImageLayerContentData | GroupLayerContentData
export type LayerContent = ImageLayerContent | GroupLayerContent
