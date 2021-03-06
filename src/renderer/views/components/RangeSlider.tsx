import React = require('react')
import CSSVariables from './CSSVariables'
import PointerEvents from './PointerEvents'
import './RangeSlider.css'

export interface BackgroundProps {
  width: number
}

export interface RangeSliderProps {
  min: number
  max: number
  value: number
  postfix?: string
  step?: number
  onChangeBegin?: (value: number) => void
  onChange: (value: number) => void
  onChangeEnd?: (value: number) => void
  disabled?: boolean
  backgroundComponent?: React.ComponentClass<any & BackgroundProps> | ((props: any & BackgroundProps) => JSX.Element)
  backgroundComponentProps?: any
}

export default class RangeSlider extends React.Component<RangeSliderProps, {}> {
  clicking = false
  fillWidth = 0
  handleLeft = 0
  backgroundWidth = 200
  backgroundHeight = 20
  slider: HTMLDivElement
  constructor() {
    super()
  }
  componentDidMount() {
    const {value} = this.props
    this.update(value)
  }
  componentWillReceiveProps(props: RangeSliderProps) {
    const {value} = props
    this.update(value)
  }
  valueForEvent(e: PointerEvent) {
    const {min, max} = this.props
    const range = max - min
    const rate = Math.max(0, Math.min(e.offsetX / this.slider.clientWidth, 1))
    const step = this.props.step || 1
    const offset = Math.round(rate * range / step) * step
    return offset + min
  }
  onChangeBegin(e: PointerEvent) {
    if (this.props.onChangeBegin) {
      this.props.onChangeBegin(this.valueForEvent(e))
    }
  }
  onChange(e: PointerEvent) {
    this.props.onChange(this.valueForEvent(e))
  }
  onChangeEnd(e: PointerEvent) {
    if (this.props.onChangeEnd) {
      this.props.onChangeEnd(this.valueForEvent(e))
    }
  }
  onPointerDown = (e: PointerEvent) => {
    e.preventDefault()
    this.clicking = true
    this.onChangeBegin(e)
    this.onChange(e)
    this.slider.setPointerCapture(e.pointerId)
  }
  onPointerUp = (e: PointerEvent) => {
    e.preventDefault()
    if (this.clicking) {
      this.onChangeEnd(e)
      this.clicking = false
    }
  }
  onPointerMove = (e: PointerEvent) => {
    e.preventDefault()
    if (this.clicking) {
      this.onChange(e)
    }
  }
  update(value: number) {
    requestAnimationFrame(() => {
      const {min, max} = this.props
      const percentage = this.fillWidth = (value - min) / (max - min) * 100
      this.handleLeft = this.slider.getBoundingClientRect().width * percentage / 100
      this.backgroundWidth = this.slider.getBoundingClientRect().width
      this.backgroundHeight = this.slider.getBoundingClientRect().height
      this.forceUpdate()
    })
  }
  render() {
    const {value, postfix, min, max, backgroundComponentProps} = this.props
    const BackgroundComponent = this.props.backgroundComponent
    const ratio = (value - min) / (max - min)
    const className = this.props.disabled ? 'RangeSlider RangeSlider-disabled' : 'RangeSlider' // TODO: change behavior
    const background = BackgroundComponent ?
      <BackgroundComponent width={this.backgroundWidth} height={this.backgroundHeight} {...backgroundComponentProps} /> : <div className='RangeSlider_fill' />
    return (
      <PointerEvents onPointerDown={this.onPointerDown} onPointerMove={this.onPointerMove} onPointerUp={this.onPointerUp}>
        <CSSVariables sliderRatio={ratio}>
          <div className={className}>
            <div className='RangeSlider_border' ref={s => { this.slider = s! }}>
              { background }
            </div>
            <div className='RangeSlider_text'>{value}{postfix}</div>
            <div className='RangeSlider_handle' />
          </div>
        </CSSVariables>
      </PointerEvents>
    )
  }
}
