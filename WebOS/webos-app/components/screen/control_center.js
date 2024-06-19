

import React from 'react';
import App from '../base/base_app';

export class Control_center extends React.Component {
    constructor() {
        super();
        this.state = {
            query: "",
            apps: [],
            category: 0, // 0 for all, 1 for frequent
            visible: false,
        }
        this.controlCenterRef = React.createRef();
    }

    componentDidMount() {
        this.setState({
            apps: this.props.apps,
            visible: true,
        });
        document.addEventListener('mousedown', this.handleClickOutside);
        document.addEventListener('keydown', this.handleKeyPress);
    }

    componentWillUnmount() {
        document.removeEventListener('mousedown', this.handleClickOutside);
        document.removeEventListener('keydown', this.handleKeyPress);
    }

    handleClickOutside = (event) => {
        if (this.controlCenterRef.current && !this.controlCenterRef.current.contains(event.target)) {
            this.closeControlCenter();
        }
    };

    handleKeyPress = () => {
        this.closeControlCenter();
    };

    closeControlCenter = () => {
        this.setState({ visible: false });
        setTimeout(() => {
            this.props.toggleControlCenter();
        }, 300); // duration of the fade-out animation
    };

    handleChange = (e) => {
        this.setState({
            query: e.target.value,
            apps: e.target.value === "" || e.target.value === null ?
                this.props.apps : this.state.apps.filter(
                    (app) => app.title.toLowerCase().includes(e.target.value.toLowerCase())
                )
        })
    }

    renderApps = () => {
        let appsJsx = [];
        let frequentAppsInfo = JSON.parse(localStorage.getItem("frequentApps"));
        let getFrequentApps = () => {
            let frequentApps = [];
            if (frequentAppsInfo) {
                frequentAppsInfo.forEach((app_info) => {
                    let app = this.props.apps.find(app => app.id === app_info.id);
                    if (app) {
                        frequentApps.push(app);
                    }
                })
            }
            return frequentApps;
        }

        let apps = this.state.category === 0 ? [...this.state.apps] : getFrequentApps();
        apps.forEach((app, index) => {
            const props = {
                name: app.title,
                id: app.id,
                icon: app.icon,
                openApp: this.props.openApp,
                className: 'control-center-app'
            }

            appsJsx.push(
                <div key={index} className="control-center-app">
                    <App {...props} />
                </div>
            );
        });
        return appsJsx;
    }

    handleSwitch = (category) => {
        if (category !== this.state.category) {
            this.setState({
                category: category
            })
        }
    }

    render() {
        return (
            <div ref={this.controlCenterRef} className={`control-center absolute h-full top-7 w-full z-20 pl-12 justify-center md:pl-20 border-black border-opacity-60 bg-black bg-opacity-70 ${this.state.visible ? 'fade-in' : 'fade-out'}`}>
                <div className={"flex md:pr-20 pt-5 align-center justify-center"}>
                </div>
                <div className={"grid md:grid-cols-6 md:grid-rows-3 grid-cols-3 grid-rows-6 md:gap-4 gap-1 md:px-20 px-5 pt-10 justify-center"}>
                    {this.renderApps()}
                </div>
                <div className={"flex align-center justify-center w-full fixed bottom-0 mb-15 pr-20  md:pr-20 "}>
                    <div className={"w-1/4 text-center group text-white bg-transparent cursor-pointer items-center"} onClick={this.handleSwitch.bind(this, 1)}>
                        <h4>Recent</h4>
                        {this.state.category === 1 ? <div className={"h-1 mt-1 bg-ub-orange self-center"} />
                            : <div className={"h-1 mt-1 bg-transparent group-hover:bg-white "} />}
                    </div>
                    <div className={"w-1/4 text-center group text-white bg-transparent cursor-pointer items-center"} onClick={this.handleSwitch.bind(this, 0)}>
                        <h4>All</h4>
                        {this.state.category === 0 ? <div className={"h-1 mt-1 bg-ub-orange self-center"} />
                            : <div className={"h-1 mt-1 bg-transparent group-hover:bg-white"} />}
                    </div>
                </div>
            </div>
        )
    }
}

export default Control_center;
