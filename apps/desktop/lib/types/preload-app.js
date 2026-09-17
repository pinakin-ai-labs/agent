/** Startup controls for shell documents; application documents receive only the carrier marker. */
import { contextBridge, ipcRenderer } from 'electron';
import { DESKTOP_IPC } from "./ipc.js";
const startup = {
    protocolVersion: 1,
    locale: () => ipcRenderer.invoke(DESKTOP_IPC.localeGet),
    backend: {
        status: () => ipcRenderer.invoke(DESKTOP_IPC.backendStatus),
        subscribe(listener) {
            const handle = (_event, state) => { listener(state); };
            ipcRenderer.on(DESKTOP_IPC.backendState, handle);
            return () => { ipcRenderer.off(DESKTOP_IPC.backendState, handle); };
        },
    },
    disablePlugins: () => ipcRenderer.invoke(DESKTOP_IPC.pluginsDisableAll),
    restart: () => ipcRenderer.invoke(DESKTOP_IPC.applicationRestart),
    resetConfiguration: () => ipcRenderer.invoke(DESKTOP_IPC.configurationReset),
};
contextBridge.exposeInMainWorld('dshDesktop', location.protocol === 'dsh-app:' && location.hostname === 'shell'
    ? startup : { protocolVersion: 1 });
//# sourceMappingURL=preload-app.js.map