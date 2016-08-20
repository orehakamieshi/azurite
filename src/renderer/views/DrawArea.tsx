import React = require("react")
import Picture from "../models/Picture"
import {Vec2} from "../../lib/Geometry"
import Tool from "../models/Tool"
import BrushTool from "../models/BrushTool"
import Waypoint from "../models/Waypoint"
import * as Electron from "electron"
import {TabletEvent} from "receive-tablet-event"

const {ipcRenderer} = Electron

interface DrawAreaState {
  picture: Picture
}

export default
class DrawArea extends React.Component<void, DrawAreaState> {
  element: HTMLElement|undefined
  isPressed = false
  tool: Tool = new BrushTool()

  constructor() {
    super()
    this.state = {
      picture: new Picture()
    }
    this.tool.layer = this.state.picture.layers[0]
  }

  componentDidMount() {
    this.element = this.refs["root"] as HTMLElement
    this.updateChildCanvases()

    const rect = this.element.getBoundingClientRect()
    const captureArea = {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    }
    ipcRenderer.send("tablet.install", captureArea)

    ipcRenderer.on("tablet.down", (event: Electron.IpcRendererEvent, ev: TabletEvent) => {
      const pos = this.mousePos(ev)
      this.tool.start(new Waypoint(pos, ev.pressure))
      this.isPressed = true
    })
    ipcRenderer.on("tablet.move", (event: Electron.IpcRendererEvent, ev: TabletEvent) => {
      if (this.isPressed) {
        const pos = this.mousePos(ev)
        this.tool.move(new Waypoint(pos, ev.pressure))
      }
    })
    ipcRenderer.on("tablet.up", (event: Electron.IpcRendererEvent, ev: TabletEvent) => {
      if (this.isPressed) {
        this.tool.end()
        this.isPressed = false
      }
    })
  }

  updateChildCanvases() {
    const {element} = this
    if (element) {
      while (element.firstChild) {
        element.removeChild(element.firstChild)
      }
      for (const layer of this.state.picture.layers) {
        element.appendChild(layer.canvas)
      }
    }
  }

  render() {
    this.updateChildCanvases()
    const dpr = window.devicePixelRatio;
    const style = {
      width: this.state.picture.size.width / dpr + 'px',
      height: this.state.picture.size.height / dpr + 'px',
    }
    return (
      <div ref="root" className="draw-area" style={style}
        onMouseDown={this.onMouseDown.bind(this)}
        onMouseMove={this.onMouseMove.bind(this)}
        onMouseUp={this.onMouseUp.bind(this)}
      />
    )
  }

  mousePos(ev: {clientX: number, clientY: number}) {
    const dpr = window.devicePixelRatio
    const rect = this.element!.getBoundingClientRect()
    const x = ev.clientX - rect.left
    const y = ev.clientY - rect.top
    return new Vec2(x * dpr, y * dpr)
  }

  onMouseDown(ev: MouseEvent) {
    const pos = this.mousePos(ev)
    this.tool.start(new Waypoint(pos, 1))
    this.isPressed = true
    ev.preventDefault()
  }
  onMouseMove(ev: MouseEvent) {
    const pos = this.mousePos(ev)

    if (this.isPressed) {
      this.tool.move(new Waypoint(pos, 1))
      ev.preventDefault()
    }
  }
  onMouseUp(ev: MouseEvent) {
    if (this.isPressed) {
      this.tool.end()
      this.isPressed = false
      ev.preventDefault()
    }
  }
}
