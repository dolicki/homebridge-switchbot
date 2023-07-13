"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Others = void 0;
const undici_1 = require("undici");
const settings_1 = require("../settings");
/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
class Others {
    constructor(platform, accessory, device) {
        this.platform = platform;
        this.accessory = accessory;
        this.device = device;
        // default placeholders
        this.logs(device);
        this.deviceType(device);
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
        // get the Television service if it exists, otherwise create a new Television service
        // you can create multiple services for each accessory
        if (this.otherDeviceType !== 'Fan') {
            this.debugLog(`${this.device.remoteType}: ${accessory.displayName} Removing Fanv2 Service`);
            if (this.otherDeviceType === undefined) {
                this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} No Device Type Set, deviceType: ${device.other?.deviceType}`);
            }
            this.fanService = this.accessory.getService(this.platform.Service.Fanv2);
            accessory.removeService(this.fanService);
        }
        else if (!this.fanService && this.otherDeviceType === 'Fan') {
            this.debugLog(`${this.device.remoteType}: ${accessory.displayName} Add Fanv2 Service`);
            (this.fanService = this.accessory.getService(this.platform.Service.Fanv2) || this.accessory.addService(this.platform.Service.Fanv2)),
                `${accessory.displayName} Fan`;
            this.fanService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Fan`);
            if (!this.fanService.testCharacteristic(this.platform.Characteristic.ConfiguredName)) {
                this.fanService.addCharacteristic(this.platform.Characteristic.ConfiguredName, `${accessory.displayName} Fan`);
            }
            this.fanService.getCharacteristic(this.platform.Characteristic.Active).onSet(this.ActiveSet.bind(this));
        }
        else {
            this.debugLog(`${this.device.remoteType}: ${accessory.displayName} Fanv2 Service Not Added, deviceType: ${device.other?.deviceType}`);
        }
    }
    async ActiveSet(value) {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} On: ${value}`);
        this.Active = value;
        if (this.Active) {
            await this.pushOnChanges();
        }
        else {
            await this.pushOffChanges();
        }
    }
    /**
     * Pushes the requested changes to the SwitchBot API
     * deviceType	commandType     Command	          command parameter	         Description
     * Other -        "command"       "turnOff"         "default"	        =        set to OFF state
     * Other -       "command"       "turnOn"          "default"	        =        set to ON state
     * Other -       "command"       "volumeAdd"       "default"	        =        volume up
     * Other -       "command"       "volumeSub"       "default"	        =        volume down
     * Other -       "command"       "channelAdd"      "default"	        =        next channel
     * Other -       "command"       "channelSub"      "default"	        =        previous channel
     */
    async pushOnChanges() {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushOnChanges Active: ${this.Active},`
            + ` disablePushOn: ${this.disablePushOn}, customize: ${this.device.customize}, customOn: ${this.device.customOn}`);
        if (this.device.customize) {
            if (this.Active === this.platform.Characteristic.Active.ACTIVE && !this.disablePushOn) {
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
        else {
            this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} On Command not set`);
        }
    }
    async pushOffChanges() {
        this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} pushOffChanges Active: ${this.Active},`
            + ` disablePushOff: ${this.disablePushOff}, customize: ${this.device.customize}, customOff: ${this.device.customOff}`);
        if (this.device.customize) {
            if (this.Active === this.platform.Characteristic.Active.INACTIVE && !this.disablePushOff) {
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
        else {
            this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} Off Command not set.`);
        }
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
        if (this.Active === undefined) {
            this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} Active: ${this.Active}`);
        }
        else {
            this.accessory.context.Active = this.Active;
            this.fanService?.updateCharacteristic(this.platform.Characteristic.Active, this.Active);
            this.debugLog(`${this.device.remoteType}: ${this.accessory.displayName} updateCharacteristic Active: ${this.Active}`);
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
        this.fanService?.updateCharacteristic(this.platform.Characteristic.Active, e);
        //throw new this.platform.api.hap.HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    async deviceType(device) {
        if (device.other?.deviceType) {
            this.otherDeviceType = this.accessory.context.deviceType = device.other.deviceType;
            if (this.deviceLogging.includes('debug') || this.deviceLogging === 'standard') {
                this.warnLog(`${this.device.remoteType}: ${this.accessory.displayName} Using Device Type: ${this.otherDeviceType}`);
            }
        }
        else {
            this.errorLog(`${this.device.remoteType}: ${this.accessory.displayName} No Device Type Set, deviceType: ${this.device.other?.deviceType}`);
        }
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
        if (this.Active === undefined) {
            this.Active = this.platform.Characteristic.Active.INACTIVE;
        }
        else {
            this.Active = this.accessory.context.Active;
        }
    }
    async config(device) {
        let config = {};
        if (device.other) {
            config = device.other;
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
exports.Others = Others;
//# sourceMappingURL=other.js.map