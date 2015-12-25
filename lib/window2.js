"use strict";

const tabsUtils = require("sdk/tabs/utils");
const {viewFor} = require("sdk/view/core");

function Window2(window) {
	this.window = window;
	this.chromeWindow = viewFor(window);
}

Window2.prototype = {
	equal(window) {
		return viewFor(window) === this.chromeWindow;
	},
	includesTab(tab) {
		return this.equal(tab.window);
	},
	get activeTabURL() {
		return tabsUtils.getTabURL(tabsUtils.getActiveTab(this.chromeWindow));
	},
};

exports.Window2 = Window2;
