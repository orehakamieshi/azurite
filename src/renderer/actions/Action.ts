import {appState} from "../state/AppState"

export
abstract class Action {
  abstract id: string
  abstract title: string
  abstract enabled: boolean
  abstract run(...args: any[]): void
}
export default Action

export
abstract class PictureAction extends Action {
  get picture() {
    return appState.currentPicture
  }
  get pictureState() {
    return appState.currentPictureState
  }
  get enabled() {
    return !!this.picture
  }
}
