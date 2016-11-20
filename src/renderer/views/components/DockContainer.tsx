import * as React from "react"
import {observable} from "mobx"
import {observer} from "mobx-react"

class DockTabViewModel {
  constructor(public root: DockContainerViewModel) {}
  id: string

  loadData(data: DockTabData) {
    this.id = data.id
  }

  render() {
    return this.root.renderTab(this.id)
  }
}

class DockRowViewModel {
  static id = 0

  constructor(public root: DockContainerViewModel) {}

  readonly id = DockRowViewModel.id++
  tabs = observable<DockTabViewModel>([])
  @observable currentTabIndex = 0
  @observable height = 0

  loadData(data: DockRowData) {
    for (const tabData of data.tabs) {
      const tab = new DockTabViewModel(this.root)
      tab.loadData(tabData)
      this.tabs.push(tab)
    }
    this.currentTabIndex = data.currentTabIndex
    this.height = data.height
  }
}

class DockColumnViewModel {
  constructor(public root: DockContainerViewModel) {}

  rows = observable<DockRowViewModel>([])

  loadData(data: DockColumnData) {
    for (const rowData of data.rows) {
      const row = new DockRowViewModel(this.root)
      row.loadData(rowData)
      this.rows.push(row)
    }
  }
}

class DockContainerViewModel {
  left = new DockColumnViewModel(this)
  right = new DockColumnViewModel(this)
  @observable renderTab: (id: string) => JSX.Element

  loadData(data: DockContainerData) {
    this.left.loadData(data.left)
    this.right.loadData(data.right)
  }
}

interface DockTabData {
  id: string
}

interface DockRowData {
  tabs: DockTabData[]
  currentTabIndex: number
  height: number
}

interface DockColumnData {
  rows: DockRowData[]
}

interface DockContainerData {
  left: DockColumnData
  right: DockColumnData
}

interface DockContainerProps {
  initData: DockContainerData
  renderTab: (id: string) => JSX.Element
}

@observer
class DockTab extends React.Component<{viewModel: DockTabViewModel}, {}> {
  render() {
    return (
      <div className="DockTab">
        {this.props.viewModel.render()}
      </div>
    )
  }
}

@observer
class DockRow extends React.Component<{viewModel: DockRowViewModel}, {}> {
  render() {
    const {tabs} = this.props.viewModel
    return (
      <div className="DockRow">
        {tabs.map(t => <DockTab key={t.id} viewModel={t} />)}
      </div>
    )
  }
}

@observer
class DockColumn extends React.Component<{viewModel: DockColumnViewModel}, {}> {
  render() {
    const {rows} = this.props.viewModel
    return (
      <div className="DockColumn">
        {rows.map(r => <DockRow key={r.id} viewModel={r} />)}
      </div>
    )
  }
}

@observer
export
class DockContainer extends React.Component<DockContainerProps, {}> {
  viewModel = new DockContainerViewModel()

  constructor(props: DockContainerProps) {
    super(props)
    this.viewModel.renderTab = props.renderTab
    this.viewModel.loadData(props.initData)
  }

  componentWillReceiveProps(props: DockContainerProps) {
    this.viewModel.renderTab = props.renderTab
  }

  render() {
    return (
      <div className="DockContainer">
        <DockColumn viewModel={this.viewModel.left} />
        <div className="DockCenter">
          {this.props.children}
        </div>
        <DockColumn viewModel={this.viewModel.right} />
      </div>
    )
  }
}
