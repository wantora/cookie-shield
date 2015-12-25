"use strict";

const self = require("sdk/self");
const tabs = require("sdk/tabs");
const {Panel} = require("sdk/panel");
const {browserWindows} = require("sdk/windows");
const {setInterval, clearInterval} = require("sdk/timers");
const cookiePerms = require("./cookie-permission-manager");
const {Window2} = require("./window2");

const ICON_MAP = {
	"allow": self.data.url("img/allow.svg"),
	"block": self.data.url("img/block.svg"),
	"allowSession": self.data.url("img/allow-session.svg"),
	"allowTemp": self.data.url("img/allow-temp.svg"),
	"unknown": self.data.url("img/unknown.svg"),
};

const UPDATE_INTERVAL_MSEC = 100;

const COMMANDS = {
	setPanelHeight(height) {
		this.panel.height = height;
	},
	setPermission(options) {
		const site = cookiePerms.Site.fromOrigins(options.origins);
		const permission = new cookiePerms.Permission(options.capability);
		
		site.permission = permission;
	},
};

function WindowListener(window, toggleButton) {
	this.window = window;
	this.toggleButton = toggleButton;
	this.window2 = new Window2(window);
	
	this.panel = Panel({
		width: 250,
		height: 500,
		contentURL: self.data.url("permission-panel.html"),
		contentScriptFile: self.data.url("permission-panel.js"),
		onHide: this.onPanelHide.bind(this),
	});
	
	this.panel.port.on("doCommand", this.onPanelDoCommand.bind(this));
	this.panel.port.on("doCommandFinal", this.onPanelDoCommandFinal.bind(this));
}

WindowListener.prototype = {
	start() {
		this.updateIcon();
		
		const intervalID = setInterval(this.updateIcon.bind(this), UPDATE_INTERVAL_MSEC);
		const onActivate = (tab) => {
			if (this.window2.includesTab(tab)) {
				this.updateIcon();
			}
		};
		const onChange = (state) => {
			if (state.checked && this.window2.equal(browserWindows.activeWindow)) {
				this.showPanel();
			}
		};
		
		tabs.on("activate", onActivate);
		this.toggleButton.on("change", onChange);
		
		this.window.on("close", () => {
			clearInterval(intervalID);
			tabs.off("activate", onActivate);
			this.toggleButton.off("change", onChange);
			this.panel.destroy();
		});
	},
	showPanel() {
		const url = this.window2.activeTabURL;
		const site = cookiePerms.Site.fromURL(url);
		const defaultPermission = cookiePerms.getDefaultPermission();
		const permission = site.permission;
		let name;
		
		if (site.isHTTP) {
			name = site.httpDomain;
		} else {
			name = site.url;
		}
		
		this.panel.port.emit("siteData", {
			enabled: site.isHTTP,
			name: name,
			origins: site.origins,
			permission: {
				capability: permission.capability,
				messages: permission.messages,
				defaultCapability: defaultPermission.capability,
			},
		});
		
		this.panel.show({
			position: this.toggleButton,
		});
	},
	updateIcon() {
		const url = this.window2.activeTabURL;
		const site = cookiePerms.Site.fromURL(url);
		let permission;
		
		if (site.isHTTP) {
			permission = site.permission;
		} else {
			permission = cookiePerms.getDefaultPermission();
		}
		
		this.updateButtonState({
			icon: ICON_MAP[permission.realCapability],
		});
	},
	updateButtonState(state) {
		const oldState = this.toggleButton.state(this.window);
		
		this.toggleButton.state(this.window, Object.assign({}, oldState, state));
	},
	onPanelHide() {
		this.updateButtonState({
			checked: false,
		});
	},
	onPanelDoCommand(command) {
		this.doCommand(command);
	},
	onPanelDoCommandFinal(command) {
		this.doCommand(command);
		this.panel.hide();
		this.updateIcon();
	},
	doCommand(command) {
		const name = command[0];
		const args = command.slice(1);
		
		COMMANDS[name].apply(this, args);
	},
};

exports.WindowListener = WindowListener;
