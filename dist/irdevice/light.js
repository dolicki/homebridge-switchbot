"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Light = void 0;
const undici_1 = require("undici");
const settings_1 = require("../settings");
/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
class Light {
    constructor(platform, accessory, device) {
        this.platform = platform;
        this.accessory = accessory;
        this.device = device;
        // default placeholders
        this.logs(device);
        this.config(device);
        this.context();
        this.disablePushOnChanges({ device });
        this.disablePushOffChanges({ device });
        // set accessory information
        accessory
            .getService(this.platform.Service.AccessoryInformation)
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
            .setCharacteristic(this.platform.Characteristic.Model, device.remoteType)
            .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId)
            .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.FirmwareRevision(accessory, device))
            .getCharacteristic(this.platform.Characteristic.FirmwareRevision)
            .updateValue(this.FirmwareRevision(accessory, device));
        // get the Light service if it exists, otherwise create a new Light service
        // you can create multiple services for each accessory
        (this.lightBulbService = accessory.getService(this.platform.Service.Lightbulb) || accessory.addService(this.platform.Service.Lightbulb)),
            `${accessory.displayName} ${device.remoteType}`;
        // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
        // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
        // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.Outlet, 'NAME', 'USER_DEFINED_SUBTYPE');
        // set the service name, this is what is displayed as the default name on the Home app
        // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
        this.lightBulbService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
        if (!this.lightBulbService.testCharacteristic(this.platform.Characteristic.ConfiguredName)) {
            this.lightBulbService.addCharacteristic(this.platform.Characteristic.ConfiguredName, accessory.displayName);
        }
        // handle on / off events using the On characteristic
        this.lightBulbService.getCharacteristic(this.platform.Characteristic.On).onSet(this.OnSet.bind(this));
    }
    async OnSet(value) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${value}`);
        this.On = value;
        if (this.On) {
            await this.pushLightOnChanges();
        }
        else {
            await this.pushLightOffChanges();
        }
        /**
         * pushLightOnChanges and pushLightOffChanges above assume they are measuring the state of the accessory BEFORE
         * they are updated, so we are only updating the accessory state after calling the above.
         */
    }
    /**
     * Pushes the requested changes to the SwitchBot API
     * deviceType	commandType     Command	          command parameter	         Description
     * Light -        "command"       "turnOff"         "default"	        =        set to OFF state
     * Light -       "command"       "turnOn"          "default"	        =        set to ON state
     * Light -       "command"       "volumeAdd"       "default"	        =        volume up
     * Light -       "command"       "volumeSub"       "default"	        =        volume down
     * Light -       "command"       "channelAdd"      "default"	        =        next channel
     * Light -       "command"       "channelSub"      "default"	        =        previous channel
     */
    async pushLightOnChanges() {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushLightOnChanges On: ${this.On},`
            + ` disablePushOn: ${this.disablePushOn}`);
        if (this.On && !this.disablePushOn) {
            const commandType = await this.commandType();
            const command = await this.commandOn();
            const bodyChange = JSON.stringify({
                'command': command,
                'parameter': 'default',
                'commandType': commandType,
            });
            await this.pushChanges(bodyChange);
        }
    }
    async pushLightOffChanges() {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushLightOffChanges On: ${this.On},`
            + ` disablePushOff: ${this.disablePushOff}`);
        if (!this.On && !this.disablePushOff) {
            const commandType = await this.commandType();
            const command = await this.commandOff();
            const bodyChange = JSON.stringify({
                'command': command,
                'parameter': 'default',
                'commandType': commandType,
            });
            await this.pushChanges(bodyChange);
        }
    }
    async pushLightBrightnessUpChanges() {
        const bodyChange = JSON.stringify({
            'command': 'brightnessUp',
            'parameter': 'default',
            'commandType': 'command',
        });
        await this.pushChanges(bodyChange);
    }
    async pushLightBrightnessDownChanges() {
        const bodyChange = JSON.stringify({
            'command': 'brightnessDown',
            'parameter': 'default',
            'commandType': 'command',
        });
        await this.pushChanges(bodyChange);
    }
    async pushChanges(bodyChange) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushChanges`);
        if (this.device.connectionType === 'OpenAPI') {
            this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Sending request to SwitchBot API, body: ${bodyChange},`);
            try {
                const { body, statusCode, headers } = await (0, undici_1.request)(`${settings_1.Devices}/${this.device.deviceId}/commands`, {
                    body: bodyChange,
                    method: 'POST',
                    headers: this.platform.generateHeaders(),
                });
                const deviceStatus = await body.json();
                this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Devices: ${JSON.stringify(deviceStatus.body)}`);
                this.statusCode(statusCode);
                this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Headers: ${JSON.stringify(headers)}`);
                this.accessory.context.On = this.On;
                this.updateHomeKitCharacteristics();
            }
            catch (e) {
                this.apiError(e);
                this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} failed pushChanges with ${this.device.connectionType}`
                    + ` Connection, Error Message: ${JSON.stringify(e.message)}`);
            }
        }
        else {
            this.warnLog(`${this.device.remoteType}: ${this.accessory.displayName}`
                + ` Connection Type: ${this.device.connectionType}, commands will not be sent to OpenAPI`);
        }
    }
    async updateHomeKitCharacteristics() {
        if (this.On === undefined) {
            this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${this.On}`);
        }
        else {
            this.accessory.context.On = this.On;
            this.lightBulbService?.updateCharacteristic(this.platform.Characteristic.On, this.On);
            this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic On: ${this.On}`);
        }
    }
    async disablePushOnChanges({ device }) {
        if (device.disablePushOn === undefined) {
            this.disablePushOn = false;
        }
        else {
            this.disablePushOn = device.disablePushOn;
        }
    }
    async disablePushOffChanges({ device }) {
        if (device.disablePushOff === undefined) {
            this.disablePushOff = false;
        }
        else {
            this.disablePushOff = device.disablePushOff;
        }
    }
    async commandType() {
        let commandType;
        if (this.device.customize) {
            commandType = 'customize';
        }
        else {
            commandType = 'command';
        }
        return commandType;
    }
    async commandOn() {
        let command;
        if (this.device.customize && this.device.customOn) {
            command = this.device.customOn;
        }
        else {
            command = 'turnOn';
        }
        return command;
    }
    async commandOff() {
        let command;
        if (this.device.customize && this.device.customOff) {
            command = this.device.customOff;
        }
        else {
            command = 'turnOff';
        }
        return command;
    }
    async statusCode(statusCode) {
        switch (statusCode) {
            case 151:
                this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Command not supported by this deviceType, statusCode: ${statusCode}`);
                break;
            case 152:
                this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Device not found, statusCode: ${statusCode}`);
                break;
            case 160:
                this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Command is not supported, statusCode: ${statusCode}`);
                break;
            case 161:
                this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Device is offline, statusCode: ${statusCode}`);
                break;
            case 171:
                this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Hub Device is offline, statusCode: ${statusCode}. `
                    + `Hub: ${this.device.hubDeviceId}`);
                break;
            case 190:
                this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Device internal error due to device states not synchronized with server,` +
                    ` Or command format is invalid, statusCode: ${statusCode}`);
                break;
            case 100:
                this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Command successfully sent, statusCode: ${statusCode}`);
                break;
            case 200:
                this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Request successful, statusCode: ${statusCode}`);
                break;
            default:
                this.infoLog(`${this.device.remoteType}: ${this.accessory.displayName} Unknown statusCode: `
                    + `${statusCode}, Submit Bugs Here: ' + 'https://tinyurl.com/SwitchBotBug`);
        }
    }
    async apiError(e) {
        this.lightBulbService.updateCharacteristic(this.platform.Characteristic.On, e);
    }
    FirmwareRevision(accessory, device) {
        let FirmwareRevision;
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName}`
            + ` accessory.context.FirmwareRevision: ${accessory.context.FirmwareRevision}`);
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} device.firmware: ${device.firmware}`);
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} this.platform.version: ${this.platform.version}`);
        if (accessory.context.FirmwareRevision) {
            FirmwareRevision = accessory.context.FirmwareRevision;
        }
        else if (device.firmware) {
            FirmwareRevision = device.firmware;
        }
        else {
            FirmwareRevision = this.platform.version;
        }
        return FirmwareRevision;
    }
    async context() {
        if (this.On === undefined) {
            this.On = false;
        }
        else {
            this.On = this.accessory.context.On;
        }
    }
    async config(device) {
        let config = {};
        if (device.irlight) {
            config = device.irlight;
        }
        if (device.logging !== undefined) {
            config['logging'] = device.logging;
        }
        if (device.connectionType !== undefined) {
            config['connectionType'] = device.connectionType;
        }
        if (device.external !== undefined) {
            config['external'] = device.external;
        }
        if (device.customOn !== undefined) {
            config['customOn'] = device.customOn;
        }
        if (device.customOff !== undefined) {
            config['customOff'] = device.customOff;
        }
        if (device.customize !== undefined) {
            config['customize'] = device.customize;
        }
        if (device.disablePushOn !== undefined) {
            config['disablePushOn'] = device.disablePushOn;
        }
        if (device.disablePushOff !== undefined) {
            config['disablePushOff'] = device.disablePushOff;
        }
        if (Object.entries(config).length !== 0) {
            this.infoLog(`${this.device.remoteType}: ${this.accessory.displayName} Config: ${JSON.stringify(config)}`);
        }
    }
    async logs(device) {
        if (this.platform.debugMode) {
            this.deviceLogging = this.accessory.context.logging = 'debugMode';
            this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Using Debug Mode Logging: ${this.deviceLogging}`);
        }
        else if (device.logging) {
            this.deviceLogging = this.accessory.context.logging = device.logging;
            this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Using Device Config Logging: ${this.deviceLogging}`);
        }
        else if (this.platform.config.options?.logging) {
            this.deviceLogging = this.accessory.context.logging = this.platform.config.options?.logging;
            this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Using Platform Config Logging: ${this.deviceLogging}`);
        }
        else {
            this.deviceLogging = this.accessory.context.logging = 'standard';
            this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Logging Not Set, Using: ${this.deviceLogging}`);
        }
    }
    /**
     * Logging for Device
     */
    infoLog(...log) {
        if (this.enablingDeviceLogging()) {
            this.platform.log.info(String(...log));
        }
    }
    warnLog(...log) {
        if (this.enablingDeviceLogging()) {
            this.platform.log.warn(String(...log));
        }
    }
    debugWarnLog(...log) {
        if (this.enablingDeviceLogging()) {
            if (this.deviceLogging?.includes('debug')) {
                this.platform.log.warn('[DEBUG]', String(...log));
            }
        }
    }
    errorLog(...log) {
        if (this.enablingDeviceLogging()) {
            this.platform.log.error(String(...log));
        }
    }
    debugErrorLog(...log) {
        if (this.enablingDeviceLogging()) {
            if (this.deviceLogging?.includes('debug')) {
                this.platform.log.error('[DEBUG]', String(...log));
            }
        }
    }
    debugLog(...log) {
        if (this.enablingDeviceLogging()) {
            if (this.deviceLogging === 'debug') {
                this.platform.log.info('[DEBUG]', String(...log));
            }
            else {
                this.platform.log.debug(String(...log));
            }
        }
    }
    enablingDeviceLogging() {
        return this.deviceLogging.includes('debug') || this.deviceLogging === 'standard';
    }
}
exports.Light = Light;
//# sourceMappingURL=light.js.map