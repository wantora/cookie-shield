"use strict";

const _ = require("sdk/l10n").get;
const self = require("sdk/self");
const ui = require("sdk/ui");
const {browserWindows} = require("sdk/windows");
const {WindowListener} = require("./lib/window-listener");

const permissionButton = ui.ToggleButton({
	id: "permission-button",
	label: _("permission_button_label"),
	icon: self.data.url("icon.svg"),
});

for (let window of browserWindows) {
	new WindowListener(window, permissionButton).start();
}

browserWindows.on("open", (window) => {
	new WindowListener(window, permissionButton).start();
});
