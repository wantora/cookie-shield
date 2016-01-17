"use strict";

const alertsEle = document.getElementById("alerts");
const siteNamesEle = document.getElementById("site-names");
const permissionButtons = [
	["allow", document.getElementById("permission-allow")],
	["allowSession", document.getElementById("permission-allowSession")],
	["allowTemp", document.getElementById("permission-allowTemp")],
	["block", document.getElementById("permission-block")],
	["default", document.getElementById("permission-default")],
];

let siteData = null;

function resetFormElement(ele) {
	if (ele.hasAttribute("data-default-class")) {
		ele.className = ele.getAttribute("data-default-class");
	} else {
		ele.setAttribute("data-default-class", ele.className);
	}
	
	ele.disabled = false;
	ele.blur();
}

function updateSiteNames() {
	resetFormElement(siteNamesEle);
	siteNamesEle.textContent = "";
	
	siteData.table.forEach((row, index) => {
		const option = document.createElement("option");
		
		option.textContent = row.name;
		option.value = String(index);
		siteNamesEle.appendChild(option);
	});
	
	siteNamesEle.value = String(siteData.selectedIndex);
	
	if (!siteData.enabled) {
		siteNamesEle.classList.add("disabled");
		siteNamesEle.disabled = true;
	}
}

function selectedRow() {
	return siteData.table[Number(siteNamesEle.value)];
}

function updateAlerts() {
	alertsEle.textContent = "";
	
	const row = selectedRow();
	
	row.permission.messages.forEach((message) => {
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
			button.textContent = message.command.label;
			button.addEventListener("click", (event) => {
				if (event.button === 0) {
					self.port.emit(message.command.name, message.command.data);
				}
			}, false);
			
			alert.appendChild(button);
		}
		
		alertsEle.appendChild(alert);
	});
}

function updateButtons() {
	const row = selectedRow();
	
	permissionButtons.forEach(([capability, button]) => {
		resetFormElement(button);
		
		if (capability === "default") {
			button.classList.add("icon-" + siteData.defaultCapability);
		}
		
		if (!siteData.enabled) {
			button.classList.add("disabled");
			button.disabled = true;
		}
		
		if (row.permission.capability === capability &&
			row.permission.capability !== "unknown") {
			button.classList.add("active");
			button.disabled = true;
		}
	});
}

function updatePanelHeight() {
	self.port.emit("setPanelHeight", document.documentElement.offsetHeight);
}

function updateRow() {
	updateAlerts();
	updateButtons();
	updatePanelHeight();
}

siteNamesEle.addEventListener("change", () => {
	updateRow();
}, false);

permissionButtons.forEach(([capability, button]) => {
	button.addEventListener("click", (event) => {
		if (event.button === 0) {
			const row = selectedRow();
			
			self.port.emit("addPermission", {
				origin: row.origin,
				capability: capability,
			});
		}
	}, false);
});

self.port.on("siteData", (data) => {
	siteData = data;
	
	updateSiteNames();
	updateRow();
});
