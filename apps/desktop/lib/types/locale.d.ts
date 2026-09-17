/** Typed English and Chinese copy owned by the Electron shell. */
export declare const en: {
    readonly application: "Application";
    readonly startupFailed: "DeepSeek Harness could not start";
    readonly startupLoading: "Starting DeepSeek Harness…";
    readonly startupLoadingDescription: "Your workspace will open when it is ready.";
    readonly startupErrorDescription: "Choose a recovery action below. Disabling third-party plugins retains their files.";
    readonly startupReinstallAdvice: "If application files are missing or damaged, close the application and reinstall it. Your tasks are stored separately.";
    readonly startupConfigurationAdvice: "Reset Desktop deletes all Desktop profile configuration and third-party plugins without a backup, then starts a fresh profile. Shared tasks and settings are retained.";
    readonly restartApplication: "Close and restart";
    readonly resetConfiguration: "Reset Desktop and retry";
    readonly disableThirdPartyPlugins: "Disable all third-party plugins and retry";
    readonly pluginsMenu: "Desktop Plugins…";
    readonly pluginsMenuPackagedOnly: "Desktop Plugins… (available in packaged applications)";
    readonly checkUpdatesMenu: "Check for Updates…";
    readonly updateCheckFailedTitle: "Update Check Failed";
    readonly unknownError: "Unknown error";
    readonly updateCheckTitle: "Check for Updates";
    readonly updateCurrent: "You already have the latest version.";
    readonly updateTitle: "DeepSeek Harness Update";
    readonly updateAvailable: "An update is available";
    readonly updateDetail: "DeepSeek Harness {version}\n\nThis release includes its matching dsh version. The application will restart after installation.";
    readonly installAndRestart: "Install and Restart";
    readonly later: "Later";
    readonly updateFailedTitle: "Update Failed";
    readonly pluginManagerTitle: "Desktop Plugins";
    readonly pluginWindowTitle: "DeepSeek Harness — Desktop Plugins";
    readonly pluginManagerDescription: "Plugins are installed only in the Desktop node_modules and are managed by the bundled pnpm.";
    readonly refresh: "Refresh";
    readonly enable: "Enable";
    readonly disable: "Disable";
    readonly disabled: "Disabled";
    readonly retry: "Retry startup";
    readonly disableAll: "Disable all plugins and retry";
    readonly recoveryDescription: "The backend could not start. Update or disable incompatible plugins, then retry. Installed plugins and configuration are retained.";
    readonly changingActivation: "Changing plugin activation…";
    readonly npmPackage: "npm package";
    readonly install: "Install";
    readonly installed: "Installed";
    readonly noPlugins: "No Desktop plugins are installed.";
    readonly remove: "Remove";
    readonly update: "Update";
    readonly targetVersion: "Enter the target version for {name}";
    readonly removing: "Removing {name}…";
    readonly updating: "Updating {name}…";
    readonly installing: "Installing {spec}…";
    readonly operationComplete: "Done. The Desktop backend has restarted.";
    readonly refreshing: "Refreshing…";
    readonly refreshed: "Plugin list refreshed.";
    readonly loadingPlugins: "Reading Desktop plugins…";
};
/** Every Desktop locale supplies the complete English key set. */
export type DesktopMessages = {
    readonly [Key in keyof typeof en]: string;
};
export declare const zh: {
    readonly application: "应用";
    readonly startupFailed: "DeepSeek Harness 无法启动";
    readonly startupLoading: "正在启动 DeepSeek Harness…";
    readonly startupLoadingDescription: "准备就绪后将自动打开工作区。";
    readonly startupErrorDescription: "请选择下方的恢复操作。禁用第三方插件会保留插件文件。";
    readonly startupReinstallAdvice: "如果应用文件缺失或损坏，请关闭应用并重新安装。任务数据存储在独立位置。";
    readonly startupConfigurationAdvice: "重置 Desktop 会删除桌面端的全部 profile 配置和第三方插件，不保留备份，然后重新初始化并启动。共享任务和设置会保留。";
    readonly restartApplication: "关闭并重启";
    readonly resetConfiguration: "重置 Desktop 并重试";
    readonly disableThirdPartyPlugins: "禁用全部第三方插件并重试";
    readonly pluginsMenu: "桌面插件…";
    readonly pluginsMenuPackagedOnly: "桌面插件…（打包应用中可用）";
    readonly checkUpdatesMenu: "检查更新…";
    readonly updateCheckFailedTitle: "更新检查失败";
    readonly unknownError: "未知错误";
    readonly updateCheckTitle: "检查更新";
    readonly updateCurrent: "当前已是最新版本。";
    readonly updateTitle: "DeepSeek Harness 更新";
    readonly updateAvailable: "发现可用更新";
    readonly updateDetail: "DeepSeek Harness {version}\n\n新版本绑定匹配的 dsh，安装后将重新启动。";
    readonly installAndRestart: "安装并重启";
    readonly later: "稍后";
    readonly updateFailedTitle: "更新失败";
    readonly pluginManagerTitle: "桌面插件";
    readonly pluginWindowTitle: "DeepSeek Harness — 桌面插件";
    readonly pluginManagerDescription: "插件只安装到桌面端自己的 node_modules，并由内置 pnpm 管理。";
    readonly refresh: "刷新";
    readonly enable: "启用";
    readonly disable: "禁用";
    readonly disabled: "已禁用";
    readonly retry: "重试启动";
    readonly disableAll: "禁用全部插件并重试";
    readonly recoveryDescription: "后端无法启动。请更新或禁用不兼容插件，然后重试。已安装插件和配置会保留。";
    readonly changingActivation: "正在更改插件启用状态…";
    readonly npmPackage: "npm 包";
    readonly install: "安装";
    readonly installed: "已安装";
    readonly noPlugins: "还没有安装桌面插件。";
    readonly remove: "移除";
    readonly update: "更新";
    readonly targetVersion: "输入 {name} 的目标版本";
    readonly removing: "正在移除 {name}…";
    readonly updating: "正在更新 {name}…";
    readonly installing: "正在安装 {spec}…";
    readonly operationComplete: "操作完成，桌面后端已重新启动。";
    readonly refreshing: "正在刷新…";
    readonly refreshed: "插件列表已刷新。";
    readonly loadingPlugins: "正在读取桌面插件…";
};
/** Locale payload exposed to the Desktop-owned renderer. */
export interface DesktopLocale {
    readonly id: 'en' | 'zh-CN';
    readonly messages: DesktopMessages;
}
/** Resolve Electron's locale to one shipped Desktop dictionary. */
export declare function resolveDesktopLocale(locale: string): DesktopLocale;
/** Replace named placeholders in one locale-owned message. */
export declare function formatDesktopMessage(message: string, values: Readonly<Record<string, string>>): string;
//# sourceMappingURL=locale.d.ts.map