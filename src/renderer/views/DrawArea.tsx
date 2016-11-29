import {observable, autorun, action, observe} from "mobx"
import {observer} from "mobx-react"
import {Subscription} from "rxjs/Subscription"
import React = require("react")
import Picture from "../models/Picture"
import {Vec2, Transform} from "paintvec"
import Tool, {ToolPointerEvent} from "../tools/Tool"
import Waypoint from "../models/Waypoint"
import {TabletEvent} from "receive-tablet-event"
import {canvas} from "../GLContext"
import Renderer from "./Renderer"
import {frameDebounce} from "../../lib/Debounce"
import * as IPCChannels from "../../common/IPCChannels"
import PointerEvents from "./components/PointerEvents"
import ScrollBar, {ScrollBarDirection} from "./components/ScrollBar"
import FrameDebounced from "./components/FrameDebounced"

@observer
class DrawAreaScroll extends FrameDebounced<{picture: Picture|undefined, renderer: Renderer}, {}> {

  onXScroll = (value: number) => {
  }

  onYScroll = (value: number) => {
  }

  renderDebounced() {
    const {picture, renderer} = this.props
    const pictureSize = (picture ? picture.size : new Vec2()).divScalar(devicePixelRatio)
    const viewSize = renderer.size.divScalar(devicePixelRatio)
    const scrollMin = pictureSize.mulScalar(-1.5)
    const scrollMax = pictureSize.mulScalar(1.5)
    const translation = picture ? picture.navigation.translation : new Vec2()
    const visibleMin = viewSize.mulScalar(-0.5).sub(translation)
    const visibleMax = viewSize.mulScalar(0.5).sub(translation)

    return (
      <div>
        <ScrollBar direction={ScrollBarDirection.Horizontal}
          min={scrollMin.x} max={scrollMax.x} visibleMin={visibleMin.x} visibleMax={visibleMax.x} onChange={this.onXScroll}/>
        <ScrollBar direction={ScrollBarDirection.Vertical}
          min={scrollMin.y} max={scrollMax.y} visibleMin={visibleMin.y} visibleMax={visibleMax.y} onChange={this.onYScroll}/>
      </div>
    )
  }
}

interface DrawAreaProps {
  tool: Tool
  picture: Picture|undefined
}

@observer
export default
class DrawArea extends React.Component<DrawAreaProps, void> {
  element: HTMLElement|undefined
  renderer: Renderer
  @observable tool: Tool
  @observable picture: Picture|undefined
  currentTool: Tool|undefined
  cursorElement: HTMLElement|undefined
  @observable cursorPosition = new Vec2()
  usingTablet = false
  tabletDownSubscription: Subscription
  tabletMoveSubscription: Subscription
  tabletUpSubscription: Subscription

  constructor(props: DrawAreaProps) {
    super(props)
    this.renderer = new Renderer()
    this.picture = this.renderer.picture = props.picture
    this.setTool(props.tool)
    autorun(() => this.updateCursor())
    autorun(() => this.updateCursorGeometry())
  }

  setTool(tool: Tool) {
    this.tool = tool
    this.tool.renderer = this.renderer
  }

  componentWillReceiveProps(nextProps: DrawAreaProps) {
    // TODO: stop setting picture and tool manually and find way to use mobx
    this.picture = this.renderer.picture = nextProps.picture
    this.setTool(nextProps.tool)
  }

  componentDidMount() {
    const element = this.element!
    element.insertBefore(canvas, element.firstChild)
    this.updateCursor()

    this.tabletDownSubscription = IPCChannels.tabletDown.listen().subscribe(ev => {
      this.usingTablet = true
      this.onDown(this.toToolEvent(ev))
    })
    this.tabletMoveSubscription = IPCChannels.tabletMove.listen().subscribe(ev => {
      this.onMove(this.toToolEvent(ev))
      this.cursorPosition = this.offsetPos(ev)
    })
    this.tabletUpSubscription = IPCChannels.tabletUp.listen().subscribe(ev => {
      this.usingTablet = false
      this.onUp()
    })

    this.onResize()
    window.addEventListener("resize", this.onResize)
    document.addEventListener("pointermove", this.onDocumentPointerMove)
  }

  componentWillUnmount() {
    const element = this.element!
    this.tabletDownSubscription.unsubscribe()
    this.tabletMoveSubscription.unsubscribe()
    this.tabletUpSubscription.unsubscribe()
    window.removeEventListener("resize", this.onResize)
    document.removeEventListener("pointermove", this.onDocumentPointerMove)
  }

  updateCursor() {
    const {cursor, cursorElement} = this.tool
    if (this.element) {
      if (this.cursorElement && this.cursorElement.parentElement) {
        this.cursorElement.parentElement.removeChild(this.cursorElement)
      }

      if (cursorElement) {
        this.element.style.cursor = "none"
        cursorElement.className = "DrawArea_Cursor"
        this.element.appendChild(cursorElement)
        this.cursorElement = cursorElement
      } else {
        this.element.style.cursor = cursor
      }
    }
  }

  updateCursorGeometry() {
    const {x, y} = this.cursorPosition.floor()
    const {cursorElementSize} = this.tool
    if (this.cursorElement) {
      const center = cursorElementSize / 2
      this.updateCursorStyle(x - center, y - center)
    }
  }

  updateCursorStyle = frameDebounce((left: number, top: number) => {
    if (this.cursorElement) {
      const {style} = this.cursorElement
      style.left = `${left}px`
      style.top = `${top}px`
    }
  })

  onResize = () => {
    const rect = this.element!.getBoundingClientRect()
    const roundRect = {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    }
    this.renderer.size = new Vec2(roundRect.width, roundRect.height).mulScalar(window.devicePixelRatio)

    IPCChannels.setTabletCaptureArea.send(roundRect)
  }

  render() {
    const style = {visibility: this.picture ? "visible" : "hidden"}
    const overlay = this.tool.renderOverlayUI()

    return (
      <div className="DrawArea_wrapper">
        <PointerEvents onPointerDown={this.onPointerDown} onPointerMove={this.onPointerMove} onPointerUp={this.onPointerUp}>
          <div ref={e => this.element = e} className="DrawArea" style={style} tabIndex={-1} onKeyDown={this.onKeyDown} >
            <svg hidden={!overlay} className="DrawArea_Overlay">
              {overlay}
            </svg>
          </div>
        </PointerEvents>
        <DrawAreaScroll picture={this.picture} renderer={this.renderer} />
      </div>
    )
  }

  offsetPos(ev: {clientX: number, clientY: number}) {
    const rect = this.element!.getBoundingClientRect()
    const x = ev.clientX - rect.left
    const y = ev.clientY - rect.top
    return new Vec2(x, y)
  }

  toToolEvent(ev: PointerEvent | TabletEvent): ToolPointerEvent {
    const {pressure, button, altKey, ctrlKey, metaKey, shiftKey} = ev
    const rendererPos = this.offsetPos(ev).mulScalar(window.devicePixelRatio)
    const picturePos = rendererPos.transform(this.renderer.transformToPicture)
    return {
      rendererPos, picturePos, pressure, button, altKey, ctrlKey, metaKey, shiftKey
    }
  }

  onDocumentPointerMove = (ev: PointerEvent) => {
    if (!this.usingTablet) {
      this.cursorPosition = this.offsetPos(ev)
    }
  }

  onPointerDown = (ev: PointerEvent) => {
    if (!this.usingTablet) {
      this.onDown(this.toToolEvent(ev))
      this.element!.setPointerCapture(ev.pointerId)
    }
    ev.preventDefault()
  }
  onPointerMove = (ev: PointerEvent) => {
    if (!this.usingTablet) {
      this.onMove(this.toToolEvent(ev))
    }
    ev.preventDefault()
  }
  onPointerUp = (ev: PointerEvent) => {
    if (!this.usingTablet) {
      this.onUp()
    }
    ev.preventDefault()
  }
  onDown(ev: ToolPointerEvent) {
    this.element && this.element.focus()
    const {tool} = this.props
    const rect = tool.start(ev)
    this.currentTool = tool
  }
  onMove(ev: ToolPointerEvent) {
    if (this.currentTool) {
      const rect = this.currentTool.move(ev)
    }
  }
  onUp() {
    if (this.currentTool) {
      const rect = this.currentTool.end()
      this.currentTool = undefined
    }
  }

  onKeyDown = (ev: React.KeyboardEvent<HTMLElement>) => {
    this.tool.keyDown(ev)
  }
}
