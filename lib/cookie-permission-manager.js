"use strict";

const _ = require("sdk/l10n").get;
const preferencesService = require("sdk/preferences/service");
const simplePrefs = require("sdk/simple-prefs");
const {URL} = require("sdk/url");
const {Ci, Cu} = require("chrome");
const {Services} = Cu.import("resource://gre/modules/Services.jsm", {});
const {NetUtil} = Cu.import("resource://gre/modules/NetUtil.jsm", {});

/*
Permission capability list
  "default"     : 0
  "allow"       : 1
  "block"       : 2
  "allowSession": 8
  "allowTemp"   : none
  "unknown"     : none
*/

const ALLOW_SESSION_ACTION = 8;

function getDefaultPermissionString() {
	// https://developer.mozilla.org/en-US/docs/Cookies_Preferences_in_Mozilla
	const cookieBehavior = preferencesService.get("network.cookie.cookieBehavior");
	const lifetimePolicy = preferencesService.get("network.cookie.lifetimePolicy");
	
	if (cookieBehavior === 2) {
		return "block";
	} else if (lifetimePolicy === 2) {
		return "allowSession";
	}
	return "allow";
}

function getPermissionList() {
	const list = [];
	const enumerator = Services.perms.enumerator;
	
	while (enumerator.hasMoreElements()) {
		const permissionObject = enumerator.getNext().QueryInterface(Ci.nsIPermission);
		
		if (permissionObject.type === "cookie") {
			list.push({
				origin: permissionObject.principal.origin,
				permission: Permission.fromObject(permissionObject),
			});
		}
	}
	
	return list;
}

function mergePermission(row) {
	if (row[0].permission.equal(row[1].permission)) {
		return row[0].permission;
	}
	
	const messages = [];
	
	if (row.every((cell) => cell.permission.capability !== "unknown")) {
		[row, row.slice(0).reverse()].forEach((data) => {
			if (data[0].permission.capability === "default") {
				messages.push({
					type: "warning",
					text: _("not_set_scheme_permission", data[0].origin.scheme.toUpperCase()),
					command: {
						name: "addPermission",
						data: {
							origin: data[0].origin.toString(),
							capability: data[1].permission.capability,
						},
						label: _("fix_permission_button_label"),
					},
				});
			}
		});
	}
	
	if (messages.length === 0) {
		messages.push({
			type: "warning",
			text: _("unknown_permission"),
		});
	}
	
	return new Permission("unknown", messages);
}

function Permission(capability, messages = []) {
	this.capability = capability;
	this.messages = messages;
}

Permission.fromNumber = (permissionNumber) => {
	if (permissionNumber === Services.perms.UNKNOWN_ACTION) {
		return new Permission("default");
	} else if (permissionNumber === Services.perms.ALLOW_ACTION) {
		return new Permission("allow");
	} else if (permissionNumber === Services.perms.DENY_ACTION) {
		return new Permission("block");
	} else if (permissionNumber === ALLOW_SESSION_ACTION) {
		return new Permission("allowSession");
	}
	return new Permission("unknown", [{
		type: "warning",
		text: _("unknown_permission"),
	}]);
};

Permission.fromObject = (permissionObject) => {
	if (permissionObject === null) {
		return new Permission("default");
	} else if (permissionObject.capability === ALLOW_SESSION_ACTION &&
		permissionObject.expireType === Services.perms.EXPIRE_SESSION) {
		return new Permission("allowTemp");
	}
	return Permission.fromNumber(permissionObject.capability);
};

Permission.prototype = {
	equal(permission) {
		return permission && permission.capability === this.capability;
	},
	get permissionNumber() {
		if (this.capability === "allow") {
			return Services.perms.ALLOW_ACTION;
		} else if (this.capability === "block") {
			return Services.perms.DENY_ACTION;
		} else if (this.capability === "allowSession") {
			return ALLOW_SESSION_ACTION;
		}
		throw new Error("Unexpected permission capability: " + this.capability);
	},
	get realCapability() {
		if (this.capability === "default") {
			return getDefaultPermissionString();
		}
		return this.capability;
	},
};

function Origin(url, scheme, domain, port) {
	this.url = url;
	this.scheme = scheme;
	this.domain = domain;
	this.port = port;
}

Origin.fromURL = (url) => {
	const u = URL(url);
	
	return new Origin(url, u.scheme, u.hostname, u.port);
};

Origin.prototype = {
	get isHttp() {
		return this.scheme === "http" || this.scheme === "https";
	},
	get baseOrigin() {
		let domain;
		
		try {
			domain = Services.eTLD.getBaseDomainFromHost(this.domain);
		} catch (e) {
			domain = this.domain;
		}
		
		return new Origin(null, this.scheme, domain, this.port);
	},
	get nextSubOrigin() {
		let domain;
		
		try {
			domain = Services.eTLD.getNextSubDomain(this.domain);
		} catch (e) {
			return null;
		}
		
		return new Origin(null, this.scheme, domain, this.port);
	},
	get subOrigins() {
		const subOrigins = [];
		let origin = this;
		
		do {
			subOrigins.push(origin);
		} while ((origin = origin.nextSubOrigin) !== null);
		
		return subOrigins;
	},
	get relatedOrigin() {
		if (this.scheme === "http") {
			return new Origin(null, "https", this.domain, this.port);
		} else if (this.scheme === "https") {
			return new Origin(null, "http", this.domain, this.port);
		}
		return null;
	},
	set permission(permission) {
		const uri = NetUtil.newURI(this.toString());
		
		if (permission.capability === "default") {
			Services.perms.remove(uri, "cookie");
		} else if (permission.capability === "allowTemp") {
			Services.perms.add(uri, "cookie", ALLOW_SESSION_ACTION, Services.perms.EXPIRE_SESSION);
		} else {
			Services.perms.add(uri, "cookie", permission.permissionNumber);
		}
	},
	get permission() {
		const uri = NetUtil.newURI(this.toString());
		const principal = Services.scriptSecurityManager.createCodebasePrincipal(uri, {});
		const permissionObject = Services.perms.getPermissionObject(principal, "cookie", true);
		
		return Permission.fromObject(permissionObject);
	},
	get portString() {
		if (this.port === null) {
			return "";
		}
		return ":" + String(this.port);
	},
	toString() {
		if (!this.isHttp) {
			if (this.url !== null) {
				return this.url;
			}
			return this.scheme + ":";
		}
		
		return this.scheme + "://" + this.domain + this.portString + "/";
	},
};

function Site(origin) {
	this.origin = origin;
}

Site.prototype = {
	addPermission(permission) {
		[this.origin, this.origin.relatedOrigin].forEach((origin) => {
			origin.permission = permission;
		});
	},
	get realPermission() {
		if (!this.origin.isHttp) {
			return new Permission("default");
		}
		
		const permData = this.permissionData;
		const realPermission = (
			permData.table.find((row) => row[0].permission.capability !== "default") ||
			permData.table[0]
		)[0].permission;
		const messages = mergePermission(permData.table[permData.selectedIndex]).messages;
		
		return new Permission(realPermission.capability, messages);
	},
	get permissionData() {
		const table = this.origin.subOrigins.map((origin) => {
			return [origin, origin.relatedOrigin].map((o) => {
				return ({
					origin: o,
					permission: o.permission,
				});
			});
		});
		
		let selectedIndex = table.findIndex((row) => row[0].permission.capability !== "default");
		
		if (selectedIndex === -1) {
			selectedIndex = table.findIndex((row) => row[1].permission.capability !== "default");
			
			if (selectedIndex === -1) {
				const defaultDomainType = simplePrefs.prefs.defaultDomainType;
				
				if (defaultDomainType === "base") {
					selectedIndex = table.length - 1;
				} else { // if (defaultDomainType === "full") {
					selectedIndex = 0;
				}
			}
		}
		
		return ({table, selectedIndex});
	},
};

exports.getDefaultPermissionString = getDefaultPermissionString;
exports.getPermissionList = getPermissionList;
exports.mergePermission = mergePermission;
exports.Permission = Permission;
exports.Origin = Origin;
exports.Site = Site;
