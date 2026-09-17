let electron = require("electron");
//#region lib/types/ipc.js
/** Typed preload operations exposed only by the Electron shell. */
/** IPC channel names kept private to the desktop application bundle. */
const DESKTOP_IPC = {
	localeGet: "dsh-desktop:locale-get",
	pluginsList: "dsh-desktop:plugins-list",
	pluginsAdd: "dsh-desktop:plugins-add",
	pluginsRemove: "dsh-desktop:plugins-remove",
	pluginsUpdate: "dsh-desktop:plugins-update",
	pluginsToggle: "dsh-desktop:plugins-toggle",
	pluginsDisableAll: "dsh-desktop:plugins-disable-all",
	backendStatus: "dsh-desktop:backend-status",
	backendRetry: "dsh-desktop:backend-retry",
	applicationRestart: "dsh-desktop:application-restart",
	configurationReset: "dsh-desktop:configuration-reset",
	backendState: "dsh-desktop:backend-state",
	updatesCheck: "dsh-desktop:updates-check",
	updatesInstall: "dsh-desktop:updates-install",
	updatesState: "dsh-desktop:updates-state"
};
//#endregion
//#region lib/types/preload.js
/** Context-isolated renderer bridge for desktop package and update operations. */
electron.contextBridge.exposeInMainWorld("dshDesktop", {
	protocolVersion: 1,
	locale: () => electron.ipcRenderer.invoke(DESKTOP_IPC.localeGet),
	plugins: {
		list: () => electron.ipcRenderer.invoke(DESKTOP_IPC.pluginsList),
		add: (spec) => electron.ipcRenderer.invoke(DESKTOP_IPC.pluginsAdd, spec),
		remove: (name) => electron.ipcRenderer.invoke(DESKTOP_IPC.pluginsRemove, name),
		toggle: (name, enabled) => electron.ipcRenderer.invoke(DESKTOP_IPC.pluginsToggle, name, enabled),
		disableAll: () => electron.ipcRenderer.invoke(DESKTOP_IPC.pluginsDisableAll),
		update: (name, version) => electron.ipcRenderer.invoke(DESKTOP_IPC.pluginsUpdate, name, version)
	},
	backend: {
		status: () => electron.ipcRenderer.invoke(DESKTOP_IPC.backendStatus),
		retry: () => electron.ipcRenderer.invoke(DESKTOP_IPC.backendRetry),
		subscribe(listener) {
			const handle = (_event, state) => {
				listener(state);
			};
			electron.ipcRenderer.on(DESKTOP_IPC.backendState, handle);
			return () => {
				electron.ipcRenderer.off(DESKTOP_IPC.backendState, handle);
			};
		}
	},
	updates: {
		check: () => electron.ipcRenderer.invoke(DESKTOP_IPC.updatesCheck),
		install: () => electron.ipcRenderer.invoke(DESKTOP_IPC.updatesInstall),
		subscribe(listener) {
			const handle = (_event, state) => {
				listener(state);
			};
			electron.ipcRenderer.on(DESKTOP_IPC.updatesState, handle);
			return () => {
				electron.ipcRenderer.off(DESKTOP_IPC.updatesState, handle);
			};
		}
	}
});
//#endregion
