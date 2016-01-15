"use strict";

const _ = require("sdk/l10n").get;
const preferencesService = require("sdk/preferences/service");
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

function getBaseDomain(domain) {
	try {
		return Services.eTLD.getBaseDomainFromHost(domain);
	} catch (e) {
		return domain;
	}
}

function getDefaultPermission() {
	// https://developer.mozilla.org/en-US/docs/Cookies_Preferences_in_Mozilla
	const cookieBehavior = preferencesService.get("network.cookie.cookieBehavior");
	const lifetimePolicy = preferencesService.get("network.cookie.lifetimePolicy");
	
	if (cookieBehavior === 2) {
		return new Permission("block");
	} else if (lifetimePolicy === 2) {
		return new Permission("allowSession");
	}
	return new Permission("allow");
}

function getPermissionList() {
	let list = [];
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
			return getDefaultPermission().capability;
		}
		return this.capability;
	},
};

function Site(url, httpDomain, origins) {
	this.url = url;
	this.httpDomain = httpDomain;
	this.origins = origins;
}

Site.fromOrigins = (origins) => {
	return new Site(null, null, origins);
};

Site.fromURL = (url) => {
	const u = URL(url);
	let httpDomain;
	let origins;
	
	if ((u.scheme === "http" || u.scheme === "https") && u.hostname !== null) {
		let portStr = "";
		
		if (u.port !== null) {
			portStr = ":" + u.port;
		}
		
		httpDomain = getBaseDomain(u.hostname) + portStr;
		origins = ["http", "https"].map((scheme) => scheme + "://" + httpDomain + "/");
	} else {
		httpDomain = null;
		origins = [url];
	}
	
	return new Site(url, httpDomain, origins);
};

Site.fromDomain = (domain) => {
	return Site.fromURL("http://" + domain + "/");
};

Site.prototype = {
	get isHTTP() {
		return this.httpDomain !== null;
	},
	set permission(permission) {
		this.origins.forEach((origin) => {
			const uri = NetUtil.newURI(origin);
			
			if (permission.capability === "default") {
				Services.perms.remove(uri, "cookie");
			} else if (permission.capability === "allowTemp") {
				Services.perms.add(uri, "cookie", ALLOW_SESSION_ACTION, Services.perms.EXPIRE_SESSION);
			} else {
				Services.perms.add(uri, "cookie", permission.permissionNumber);
			}
		});
	},
	get permission() {
		const permissions = this.origins.map((origin) => {
			const uri = NetUtil.newURI(origin);
			const principal = Services.scriptSecurityManager.createCodebasePrincipal(uri, {});
			const permissionObject = Services.perms.getPermissionObject(principal, "cookie", true);
			
			return Permission.fromObject(permissionObject);
		});
		
		if (permissions.every((perm) => { return permissions[0].equal(perm); })) {
			return permissions[0];
		}
		
		const messages = [];
		
		if (this.origins.length === 2 &&
			this.origins[0].startsWith("http://") &&
			this.origins[1].startsWith("https://") &&
			permissions.every((perm) => { return perm.capability !== "unknown"; })) {
			[
				{first: 0, second: 1, text: _("http_not_set_permission")},
				{first: 1, second: 0, text: _("https_not_set_permission")},
			].forEach((data) => {
				if (permissions[data.first].capability === "default") {
					messages.push({
						type: "warning",
						text: data.text,
						command: {
							name: "setPermission",
							data: {
								origins: [this.origins[data.first]],
								capability: permissions[data.second].capability,
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
	},
};

exports.getDefaultPermission = getDefaultPermission;
exports.getPermissionList = getPermissionList;
exports.Permission = Permission;
exports.Site = Site;
