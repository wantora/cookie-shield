"use strict";

const alertsEle = document.getElementById("alerts");
const siteNameEle = document.getElementById("site-name");
const permissionButtons = [
	["allow", document.getElementById("permission-allow")],
	["allowSession", document.getElementById("permission-allowSession")],
	["allowTemp", document.getElementById("permission-allowTemp")],
	["block", document.getElementById("permission-block")],
	["default", document.getElementById("permission-default")],
];

let siteData = null;

function resetButton(button) {
	if (button.hasAttribute("data-default-class")) {
		button.className = button.getAttribute("data-default-class");
	} else {
		button.setAttribute("data-default-class", button.className);
	}
	
	button.disabled = false;
	button.blur();
}

function resetAlerts(ele) {
	ele.textContent = "";
}

function update() {
	siteNameEle.textContent = siteData.name;
	
	resetAlerts(alertsEle);
	
	siteData.permission.messages.forEach((message) => {
		const alert = document.createElement("div");
		
		alert.classList.add("alert");
		alert.classList.add("alert-" + message.type);
		alert.setAttribute("role", "alert");
		alert.textContent = message.text;
		
		if (message.command) {
			const button = document.createElement("button");
			
			button.type = "button";
			button.classList.add("btn");
			button.classList.add("btn-default");
			button.textContent = message.commandLabel;
			button.addEventListener("click", (event) => {
				if (event.button === 0) {
					self.port.emit("doCommandFinal", message.command);
				}
			}, false);
			
			alert.appendChild(button);
		}
		
		alertsEle.appendChild(alert);
	});
	
	permissionButtons.forEach(([capability, button]) => {
		resetButton(button);
		
		if (capability === "default") {
			button.classList.add("icon-" + siteData.permission.defaultCapability);
		}
		
		if (!siteData.enabled) {
			button.classList.add("disabled");
			button.disabled = true;
		}
		
		if (capability === siteData.permission.capability &&
			siteData.permission.capability !== "unknown") {
			button.classList.add("active");
			button.disabled = true;
		}
	});
}

permissionButtons.forEach(([capability, button]) => {
	button.addEventListener("click", (event) => {
		if (event.button === 0) {
			self.port.emit("doCommandFinal", ["setPermission", {
				origins: siteData.origins,
				capability: capability,
			}]);
		}
	}, false);
});

self.port.on("siteData", (data) => {
	siteData = data;
	update();
	
	self.port.emit("doCommand", ["setPanelHeight", document.documentElement.offsetHeight]);
});
