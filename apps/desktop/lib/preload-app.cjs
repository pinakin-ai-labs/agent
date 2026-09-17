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
//#region lib/types/preload-app.js
/** Startup controls for shell documents; application documents receive only the carrier marker. */
electron.contextBridge.exposeInMainWorld("dshDesktop", location.protocol === "dsh-app:" && location.hostname === "shell" ? {
	protocolVersion: 1,
	locale: () => electron.ipcRenderer.invoke(DESKTOP_IPC.localeGet),
	backend: {
		status: () => electron.ipcRenderer.invoke(DESKTOP_IPC.backendStatus),
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
	disablePlugins: () => electron.ipcRenderer.invoke(DESKTOP_IPC.pluginsDisableAll),
	restart: () => electron.ipcRenderer.invoke(DESKTOP_IPC.applicationRestart),
	resetConfiguration: () => electron.ipcRenderer.invoke(DESKTOP_IPC.configurationReset)
} : { protocolVersion: 1 });
//#endregion
