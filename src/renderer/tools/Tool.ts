import {computed, observable} from 'mobx'
import {Vec2} from 'paintvec'
import React = require('react')
import KeyInput, {KeyInputData} from '../../lib/KeyInput'
import {appState} from '../app/AppState'
import {toolManager} from '../app/ToolManager'
import Layer from '../models/Layer'
import Selection from '../models/Selection'
import {Tile} from '../models/TiledTexture'
import {UndoStack} from '../models/UndoStack'
import {SelectionShowMode} from '../views/Renderer'

export
interface ToolConfigData {
  toggleShortcut: KeyInputData|null
  tempShortcut: KeyInputData|null
}

export
interface ToolPointerEvent {
  rendererPos: Vec2
  picturePos: Vec2
  pressure: number
  button: number
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}

abstract class Tool {
  @computed get picture() {
    return appState.currentPicture
  }
  @computed get currentLayer() {
    if (this.picture) {
      return this.picture.currentLayer
    }
  }
  @computed get selectedLayers() {
    if (this.picture) {
      return this.picture.selectedLayers.peek()
    } else {
      return []
    }
  }
  @computed get active() {
    return toolManager.currentTool === this
  }

  abstract id: string
  abstract title: string

  get cursor() {
    return 'auto'
  }
  get cursorImage(): HTMLCanvasElement|undefined {
    return undefined
  }
  get cursorImageSize() {
    return 0
  }

  get modal() { return false }
  get modalUndoStack(): UndoStack|undefined { return }

  abstract start(event: ToolPointerEvent): void
  abstract move(event: ToolPointerEvent): void
  abstract end(event: ToolPointerEvent): void
  hover(event: ToolPointerEvent) {}
  keyDown(event: React.KeyboardEvent<HTMLElement>) {}

  renderSettings(): JSX.Element { return React.createElement('div') }
  renderOverlayCanvas?(context: CanvasRenderingContext2D): void
  previewLayerTile(layer: Layer, tileKey: Vec2): {tile: Tile|undefined}|undefined { return }
  previewSelection(): Selection|false { return false }
  get selectionShowMode(): SelectionShowMode { return 'normal' }

  @observable toggleShortcut: KeyInput|undefined
  @observable tempShortcut: KeyInput|undefined

  saveConfig(): ToolConfigData {
    const toggleShortcut = this.toggleShortcut ? this.toggleShortcut.toData() : null
    const tempShortcut = this.tempShortcut ? this.tempShortcut.toData() : null
    return {toggleShortcut, tempShortcut}
  }
  loadConfig(config: ToolConfigData) {
    this.toggleShortcut = config.toggleShortcut ? KeyInput.fromData(config.toggleShortcut) : undefined
    this.tempShortcut = config.tempShortcut ? KeyInput.fromData(config.tempShortcut) : undefined
  }
}
export default Tool
