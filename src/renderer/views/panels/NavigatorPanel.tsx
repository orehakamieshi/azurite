import {computed, reaction, action} from 'mobx'
import {observer} from 'mobx-react'
import {Transform, Vec2, Rect} from 'paintvec'
import React = require('react')
import {frameDebounce} from '../../../lib/Debounce'
import {appState} from '../../app/AppState'
import PointerEvents from '../components/PointerEvents'
import RangeSlider from '../components/RangeSlider'
import SVGIcon from '../components/SVGIcon'
import {renderer} from '../Renderer'
import './NavigatorPanel.css'

class NavigatorMinimap extends React.Component<{}, {} > {
  private minimap: HTMLCanvasElement
  private disposer: () => void
  private dragging = false
  private dragStartTranslation = new Vec2()
  private originalTranslation = new Vec2()

  @computed private get picture() {
    return appState.currentPicture
  }
  @computed private get pictureState() {
    return appState.currentPictureState
  }

  componentDidMount() {
    this.disposer = reaction(
      () => [renderer.transformToPicture, this.picture && this.picture.lastUpdate],
      frameDebounce(() => this.redraw())
    )
  }

  componentWillUnmount() {
    this.disposer()
  }

  private redraw() {
    const {width, height} = this.minimap
    const context = this.minimap.getContext('2d')!
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, width, height)

    const {pictureState} = this
    if (!pictureState) {
      return
    }
    const {thumbnailManager} = pictureState
    context.translate(width / 2, height / 2)

    const thumbnail = thumbnailManager.navigatorThumbnail
    const thumbanilScale = thumbnailManager.navigatorThumbnailScale
    context.drawImage(thumbnail, -thumbnail.width / 2, -thumbnail.height / 2)

    const transform = pictureState.picture.navigation.invertedTransform.scale(new Vec2(thumbanilScale))
    const rendererSize = renderer.size
    const rendererTopLeft = rendererSize.divScalar(2).neg()
    const rendererBottomRight = rendererSize.add(rendererTopLeft)
    const rendererRect = new Rect(rendererTopLeft, rendererBottomRight)
    const vertices = rendererRect.vertices().map(p => p.transform(transform))

    context.strokeStyle = 'grey'
    context.lineWidth = devicePixelRatio
    context.beginPath()
    context.moveTo(vertices[3].x, vertices[3].y)
    for (const v of vertices) {
      context.lineTo(v.x, v.y)
    }
    context.stroke()
  }

  private translationForEvent(e: {offsetX: number, offsetY: number}) {
    const {pictureState, picture} = this
    if (!pictureState || !picture) {
      return new Vec2()
    }
    const {clientWidth, clientHeight} = this.minimap
    const picturePos = new Vec2(e.offsetX - clientWidth / 2, e.offsetY - clientHeight / 2)
      .mulScalar(devicePixelRatio)
      .divScalar(pictureState.thumbnailManager.navigatorThumbnailScale)
    const toRenderer = Transform.scale(new Vec2(picture.navigation.scale)).rotate(picture.navigation.rotation)
    return picturePos.transform(toRenderer).neg()
  }

  private onPointerDown = (e: PointerEvent) => {
    if (!this.picture) {
      return
    }
    this.minimap.setPointerCapture(e.pointerId)
    const translation = this.translationForEvent(e)
    const offset = this.picture.navigation.translation.sub(translation).abs()
    if (!new Rect(new Vec2(), renderer.size.mulScalar(0.5)).includes(offset)) {
      this.picture.navigation.translation = translation
    }

    this.dragging = true
    this.dragStartTranslation = translation
    this.originalTranslation = this.picture.navigation.translation
  }

  private onPointerMove = (e: PointerEvent) => {
    if (!this.dragging) {
      return
    }
    if (!this.picture) {
      return
    }
    const translation = this.translationForEvent(e)
    const offset = translation.sub(this.dragStartTranslation)
    this.picture.navigation.translation = this.originalTranslation.add(offset)
  }

  private onPointerUp = (e: PointerEvent) => {
    this.dragging = false
  }

  render() {
    const width = 240 * devicePixelRatio
    const height = 120 * devicePixelRatio
    return (
      <PointerEvents onPointerDown={this.onPointerDown} onPointerMove={this.onPointerMove} onPointerUp={this.onPointerUp}>
        <canvas className='NavigatorPanel_minimap' width={width} height={height} ref={e => this.minimap = e!} />
      </PointerEvents>
    )
  }
}

@observer export default
class NavigatorPanel extends React.Component<{}, {}> {
  private onSliderBegin = () => {
    const picture = appState.currentPicture
    if (picture) {
      picture.navigation.saveRendererCenter()
    }
  }

  private onScaleChange = action((scaleLog: number) => {
    const picture = appState.currentPicture
    if (picture) {
      const scale = Math.pow(2, scaleLog)
      picture.navigation.scaleAroundRendererCenter(scale)
    }
  })

  private onRotationChange = action((rotationDeg: number) => {
    const picture = appState.currentPicture
    if (picture) {
      const rotation = rotationDeg / 180 * Math.PI
      picture.navigation.rotateAroundRendererCenter(rotation)
    }
  })

  private onHorizontalFlipChange = (ev: React.FormEvent<HTMLInputElement>) => {
    const picture = appState.currentPicture
    if (picture) {
      picture.navigation.horizontalFlip = (ev.target as HTMLInputElement).checked
    }
  }

  private onZoomIn = () => {
    const picture = appState.currentPicture
    if (picture) {
      picture.navigation.zoomIn()
    }
  }
  private onZoomOut = () => {
    const picture = appState.currentPicture
    if (picture) {
      picture.navigation.zoomOut()
    }
  }
  private onZoomReset = () => {
    const picture = appState.currentPicture
    if (picture) {
      picture.navigation.resetScale()
    }
  }
  private onRotateLeft = () => {
    const picture = appState.currentPicture
    if (picture) {
      picture.navigation.rotateLeft()
    }
  }
  private onRotateRight = () => {
    const picture = appState.currentPicture
    if (picture) {
      picture.navigation.rotateRight()
    }
  }
  private onRotateReset = () => {
    const picture = appState.currentPicture
    if (picture) {
      picture.navigation.resetRotation()
    }
  }

  render() {
    const picture = appState.currentPicture

    const navigation = picture ? picture.navigation : {rotation: 0, scale: 1, horizontalFlip: false}
    const {rotation, scale, horizontalFlip} = navigation
    const scaleLog = Math.log2(scale)
    const rotationDeg = rotation / Math.PI * 180

    return (
      <div className='NavigatorPanel'>
        <NavigatorMinimap />
        <div className='NavigatorPanel_sliderRow'>
          <button onClick={this.onZoomOut}><SVGIcon className='zoom-out' /></button>
          <RangeSlider min={-3} max={5} step={1 / 8} onChangeBegin={this.onSliderBegin} onChange={this.onScaleChange} value={scaleLog} />
          <button onClick={this.onZoomIn}><SVGIcon className='zoom-in' /></button>
          <button className='NavigatorPanel_reset' onClick={this.onZoomReset} />
          {(scale * 100).toFixed(scale < 1 ? 1 : 0)}%
        </div>
        <div className='NavigatorPanel_sliderRow'>
          <button onClick={this.onRotateLeft}><SVGIcon className='rotate-left' /></button>
          <RangeSlider min={-180} max={180} step={3} onChangeBegin={this.onSliderBegin} onChange={this.onRotationChange} value={rotationDeg} />
          <button onClick={this.onRotateRight}><SVGIcon className='rotate-right' /></button>
          <button className='NavigatorPanel_reset' onClick={this.onRotateReset} />
          {rotationDeg.toFixed(0)}°
        </div>
        <label className='NavigatorPanel_check'><input type='checkbox' checked={horizontalFlip} onChange={this.onHorizontalFlipChange} />Flip Horizontally</label>
      </div>
    )
  }
}
