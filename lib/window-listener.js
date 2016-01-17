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
	
	this.panel.port.on("setPanelHeight", this.setPanelHeight.bind(this));
	this.panel.port.on("addPermission", this.addPermission.bind(this));
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
		const site = new cookiePerms.Site(cookiePerms.Origin.fromURL(url));
		let table = null;
		let selectedIndex = 0;
		
		if (site.origin.isHttp) {
			const permData = site.permissionData;
			
			table = permData.table.map((row) => {
				const perm = cookiePerms.mergePermission(row);
				const origin = row[0].origin;
				
				return ({
					name: origin.domain + origin.portString,
					origin: origin.toString(),
					permission: {
						capability: perm.capability,
						messages: perm.messages,
					},
				});
			});
			selectedIndex = permData.selectedIndex;
		} else {
			table = [{
				name: site.origin.toString(),
				origin: null,
				permission: {
					capability: "default",
					messages: [],
				},
			}];
		}
		
		this.panel.port.emit("siteData", {
			enabled: site.origin.isHttp,
			table: table,
			selectedIndex: selectedIndex,
			defaultCapability: cookiePerms.getDefaultPermissionString(),
		});
		
		this.panel.show({
			position: this.toggleButton,
		});
	},
	hidePanel() {
		this.panel.hide();
		this.updateIcon();
	},
	updateIcon() {
		const url = this.window2.activeTabURL;
		const site = new cookiePerms.Site(cookiePerms.Origin.fromURL(url));
		const permission = site.realPermission;
		let badge = null;
		
		if (permission.messages.length > 0) {
			badge = "!";
		}
		
		this.updateButtonState({
			icon: ICON_MAP[permission.realCapability],
			badge: badge,
			badgeColor: "#ffb011",
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
	setPanelHeight(height) {
		this.panel.height = height;
	},
	addPermission(options) {
		const site = new cookiePerms.Site(cookiePerms.Origin.fromURL(options.origin));
		const permission = new cookiePerms.Permission(options.capability);
		
		site.addPermission(permission);
		this.hidePanel();
	},
};

exports.WindowListener = WindowListener;
