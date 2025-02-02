"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwitchBotPlatform = void 0;
const bot_1 = require("./device/bot");
const plug_1 = require("./device/plug");
const lock_1 = require("./device/lock");
const meter_1 = require("./device/meter");
const motion_1 = require("./device/motion");
const hub_1 = require("./device/hub");
const contact_1 = require("./device/contact");
const curtain_1 = require("./device/curtain");
const iosensor_1 = require("./device/iosensor");
const meterplus_1 = require("./device/meterplus");
const colorbulb_1 = require("./device/colorbulb");
const ceilinglight_1 = require("./device/ceilinglight");
const lightstrip_1 = require("./device/lightstrip");
const humidifier_1 = require("./device/humidifier");
const robotvacuumcleaner_1 = require("./device/robotvacuumcleaner");
const tv_1 = require("./irdevice/tv");
const fan_1 = require("./irdevice/fan");
const light_1 = require("./irdevice/light");
const other_1 = require("./irdevice/other");
const camera_1 = require("./irdevice/camera");
const blindtilt_1 = require("./device/blindtilt");
const airpurifier_1 = require("./irdevice/airpurifier");
const waterheater_1 = require("./irdevice/waterheater");
const vacuumcleaner_1 = require("./irdevice/vacuumcleaner");
const airconditioner_1 = require("./irdevice/airconditioner");
const undici_1 = require("undici");
const crypto_1 = __importStar(require("crypto"));
const buffer_1 = require("buffer");
const rxjs_1 = require("rxjs");
const fakegato_history_1 = __importDefault(require("fakegato-history"));
const fs_1 = require("fs");
const settings_1 = require("./settings");
/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
class SwitchBotPlatform {
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.Service = this.api.hap.Service;
        this.Characteristic = this.api.hap.Characteristic;
        // this is used to track restored cached accessories
        this.accessories = [];
        this.version = process.env.npm_package_version || '2.1.1';
        this.generateHeaders = () => {
            const t = `${Date.now()}`;
            const nonce = (0, crypto_1.randomUUID)();
            const data = this.config.credentials?.token + t + nonce;
            const signTerm = crypto_1.default.createHmac('sha256', this.config.credentials?.secret).update(buffer_1.Buffer.from(data, 'utf-8')).digest();
            const sign = signTerm.toString('base64');
            return {
                'Authorization': this.config.credentials?.token,
                'sign': sign,
                'nonce': nonce,
                't': t,
                'Content-Type': 'application/json',
            };
        };
        this.logs();
        this.debugLog('Finished initializing platform:', this.config.name);
        // only load if configured
        if (!this.config) {
            return;
        }
        // HOOBS notice
        if (__dirname.includes('hoobs')) {
            this.warnLog('This plugin has not been tested under HOOBS, it is highly recommended that you switch to Homebridge: '
                + 'https://tinyurl.com/HOOBS2Homebridge');
        }
        // verify the config
        try {
            this.verifyConfig();
            this.debugLog('Config OK');
        }
        catch (e) {
            this.errorLog(`Verify Config, Error Message: ${e.message}, Submit Bugs Here: ` + 'https://tinyurl.com/SwitchBotBug');
            this.debugErrorLog(`Verify Config, Error: ${e}`);
            return;
        }
        // import fakegato-history module
        this.fakegatoAPI = (0, fakegato_history_1.default)(api);
        // When this event is fired it means Homebridge has restored all cached accessories from disk.
        // Dynamic Platform plugins should only register new accessories after this event was fired,
        // in order to ensure they weren't added to homebridge already. This event can also be used
        // to start discovery of new accessories.
        this.api.on('didFinishLaunching', async () => {
            this.debugLog('Executed didFinishLaunching callback');
            // run the method to discover / register your devices as accessories
            try {
                if (this.config.credentials?.openToken && !this.config.credentials.token) {
                    await this.updateToken();
                }
                else if (this.config.credentials?.token && !this.config.credentials?.secret) {
                    // eslint-disable-next-line no-useless-escape
                    this.errorLog('\"secret\" config is not populated, you must populate then please restart Homebridge.');
                }
                else {
                    this.discoverDevices();
                }
            }
            catch (e) {
                this.errorLog(`Failed to Discover, Error Message: ${e.message}, Submit Bugs Here: ` + 'https://tinyurl.com/SwitchBotBug');
                this.debugErrorLog(`Failed to Discover, Error: ${e}`);
            }
        });
    }
    /**
     * This function is invoked when homebridge restores cached accessories from disk at startup.
     * It should be used to setup event handlers for characteristics and update respective values.
     */
    configureAccessory(accessory) {
        this.debugLog(`Loading accessory from cache: ${accessory.displayName}`);
        // add the restored accessory to the accessories cache so we can track if it has already been registered
        this.accessories.push(accessory);
    }
    /**
     * Verify the config passed to the plugin is valid
     */
    async verifyConfig() {
        this.config.options = this.config.options || {};
        const platformConfig = {};
        if (this.config.options.logging) {
            platformConfig['logging'] = this.config.options.logging;
        }
        if (this.config.options.logging && this.config.options.refreshRate) {
            platformConfig['refreshRate'] = this.config.options.refreshRate;
        }
        if (this.config.options.logging && this.config.options.pushRate) {
            platformConfig['pushRate'] = this.config.options.pushRate;
        }
        if (Object.entries(platformConfig).length !== 0) {
            this.infoLog(`Platform Config: ${JSON.stringify(platformConfig)}`);
        }
        if (this.config.options) {
            // Device Config
            if (this.config.options.devices) {
                for (const deviceConfig of this.config.options.devices) {
                    if (!deviceConfig.hide_device) {
                        if (!deviceConfig.deviceId) {
                            throw new Error('The devices config section is missing the *Device ID* in the config. Please check your config.');
                        }
                        if (!deviceConfig.configDeviceType && deviceConfig.connectionType) {
                            throw new Error('The devices config section is missing the *Device Type* in the config. Please check your config.');
                        }
                    }
                }
            }
            // IR Device Config
            if (this.config.options.irdevices) {
                for (const irDeviceConfig of this.config.options.irdevices) {
                    if (!irDeviceConfig.hide_device) {
                        if (!irDeviceConfig.deviceId) {
                            this.errorLog('The devices config section is missing the *Device ID* in the config. Please check your config.');
                        }
                        if (!irDeviceConfig.deviceId && !irDeviceConfig.configRemoteType) {
                            this.errorLog('The devices config section is missing the *Device Type* in the config. Please check your config.');
                        }
                    }
                }
            }
        }
        if (this.config.options.refreshRate < 5) {
            throw new Error('Refresh Rate must be above 5 (5 seconds).');
        }
        if (!this.config.options.refreshRate) {
            // default 120 seconds (2 minutes)
            this.config.options.refreshRate = 120;
            this.debugWarnLog('Using Default Refresh Rate (2 minutes).');
        }
        if (!this.config.options.pushRate) {
            // default 100 milliseconds
            this.config.options.pushRate = 0.1;
            this.debugWarnLog('Using Default Push Rate.');
        }
        if (!this.config.credentials && !this.config.options) {
            this.debugWarnLog('Missing Credentials');
        }
        else if (this.config.credentials && !this.config.credentials.notice) {
            if (!this.config.credentials?.token) {
                this.debugErrorLog('Missing token');
                this.debugWarnLog('Cloud Enabled SwitchBot Devices & IR Devices will not work');
            }
            if (this.config.credentials?.token) {
                if (!this.config.credentials?.secret) {
                    this.debugErrorLog('Missing secret');
                    this.debugWarnLog('Cloud Enabled SwitchBot Devices & IR Devices will not work');
                }
            }
        }
    }
    /**
     * The openToken was old config.
     * This method saves the openToken as the token in the config.json file
     * @param this.config.credentials.openToken
     */
    async updateToken() {
        try {
            // check the new token was provided
            if (!this.config.credentials?.openToken) {
                throw new Error('New token not provided');
            }
            // load in the current config
            const currentConfig = JSON.parse((0, fs_1.readFileSync)(this.api.user.configPath(), 'utf8'));
            // check the platforms section is an array before we do array things on it
            if (!Array.isArray(currentConfig.platforms)) {
                throw new Error('Cannot find platforms array in config');
            }
            // find this plugins current config
            const pluginConfig = currentConfig.platforms.find((x) => x.platform === settings_1.PLATFORM_NAME);
            if (!pluginConfig) {
                throw new Error(`Cannot find config for ${settings_1.PLATFORM_NAME} in platforms array`);
            }
            // check the .credentials is an object before doing object things with it
            if (typeof pluginConfig.credentials !== 'object') {
                throw new Error('pluginConfig.credentials is not an object');
            }
            // Move openToken to token
            if (!this.config.credentials.secret) {
                // eslint-disable-next-line no-useless-escape, max-len
                this.warnLog('This plugin has been updated to use OpenAPI v1.1, config is set with openToken, \"openToken\" cconfig has been moved to the \"token\" config');
                // eslint-disable-next-line no-useless-escape
                this.errorLog('\"secret\" config is not populated, you must populate then please restart Homebridge.');
            }
            else {
                // eslint-disable-next-line no-useless-escape, max-len
                this.warnLog('This plugin has been updated to use OpenAPI v1.1, config is set with openToken, \"openToken\" config has been moved to the \"token\" config, please restart Homebridge.');
            }
            // set the refresh token
            pluginConfig.credentials.token = this.config.credentials?.openToken;
            if (pluginConfig.credentials.token) {
                pluginConfig.credentials.openToken = undefined;
            }
            this.debugWarnLog(`token: ${pluginConfig.credentials.token}`);
            // save the config, ensuring we maintain pretty json
            (0, fs_1.writeFileSync)(this.api.user.configPath(), JSON.stringify(currentConfig, null, 4));
            this.verifyConfig();
        }
        catch (e) {
            this.errorLog(`Update Token: ${e}`);
        }
    }
    /**
     * this method discovers devices
     *
        const t = `${Date.now()}`;
        const nonce = 'requestID';
        const data = this.config.credentials?.token + t + nonce;
        const signTerm = crypto.createHmac('sha256', this.config.credentials?.secret).update(Buffer.from(data, 'utf-8')).digest();
        const sign = signTerm.toString('base64');
     */
    async discoverDevices() {
        if (this.config.credentials?.token) {
            try {
                const { body, statusCode, headers } = await (0, undici_1.request)(settings_1.Devices, {
                    headers: this.generateHeaders(),
                });
                const devicesAPI = await body.json();
                this.debugLog(`Devices: ${JSON.stringify(devicesAPI.body)}`);
                this.statusCode(statusCode);
                this.debugLog(`Headers: ${JSON.stringify(headers)}`);
                // SwitchBot Devices
                const deviceLists = devicesAPI.body.deviceList;
                if (!this.config.options?.devices) {
                    this.debugLog(`SwitchBot Device Config Not Set: ${JSON.stringify(this.config.options?.devices)}`);
                    const devices = deviceLists.map((v) => v);
                    for (const device of devices) {
                        if (device.deviceType) {
                            if (device.configDeviceName) {
                                device.deviceName = device.configDeviceName;
                            }
                            this.createDevice(device);
                        }
                    }
                }
                else if (this.config.credentials?.token && this.config.options.devices) {
                    this.debugLog(`SwitchBot Device Config Set: ${JSON.stringify(this.config.options?.devices)}`);
                    const deviceConfigs = this.config.options?.devices;
                    const mergeBydeviceId = (a1, a2) => a1.map((itm) => ({
                        ...a2.find((item) => item.deviceId.toUpperCase().replace(/[^A-Z0-9]+/g, '') === itm.deviceId.toUpperCase().replace(/[^A-Z0-9]+/g, '') && item),
                        ...itm,
                    }));
                    const devices = mergeBydeviceId(deviceLists, deviceConfigs);
                    this.debugLog(`SwitchBot Devices: ${JSON.stringify(devices)}`);
                    for (const device of devices) {
                        if (device.deviceType) {
                            if (device.configDeviceName) {
                                device.deviceName = device.configDeviceName;
                            }
                            this.createDevice(device);
                        }
                    }
                }
                else {
                    this.errorLog('SwitchBot Token Supplied, Issue with Auth.');
                }
                if (devicesAPI.body.deviceList.length !== 0) {
                    this.infoLog(`Total SwitchBot Devices Found: ${devicesAPI.body.deviceList.length}`);
                }
                else {
                    this.debugLog(`Total SwitchBot Devices Found: ${devicesAPI.body.deviceList.length}`);
                }
                // IR Devices
                const irDeviceLists = devicesAPI.body.infraredRemoteList;
                if (!this.config.options?.irdevices) {
                    this.debugLog(`IR Device Config Not Set: ${JSON.stringify(this.config.options?.irdevices)}`);
                    const devices = irDeviceLists.map((v) => v);
                    for (const device of devices) {
                        if (device.remoteType) {
                            this.createIRDevice(device);
                        }
                    }
                }
                else {
                    this.debugLog(`IR Device Config Set: ${JSON.stringify(this.config.options?.irdevices)}`);
                    const irDeviceConfig = this.config.options?.irdevices;
                    const mergeIRBydeviceId = (a1, a2) => a1.map((itm) => ({
                        ...a2.find((item) => item.deviceId.toUpperCase().replace(/[^A-Z0-9]+/g, '') === itm.deviceId.toUpperCase().replace(/[^A-Z0-9]+/g, '') && item),
                        ...itm,
                    }));
                    const devices = mergeIRBydeviceId(irDeviceLists, irDeviceConfig);
                    this.debugLog(`IR Devices: ${JSON.stringify(devices)}`);
                    for (const device of devices) {
                        this.createIRDevice(device);
                    }
                }
                if (devicesAPI.body.infraredRemoteList.length !== 0) {
                    this.infoLog(`Total IR Devices Found: ${devicesAPI.body.infraredRemoteList.length}`);
                }
                else {
                    this.debugLog(`Total IR Devices Found: ${devicesAPI.body.infraredRemoteList.length}`);
                }
            }
            catch (e) {
                this.debugErrorLog(`Failed to Discover Devices, Error Message: ${JSON.stringify(e.message)}, Submit Bugs Here: `
                    + 'https://tinyurl.com/SwitchBotBug');
                this.debugErrorLog(`Failed to Discover Devices, Error: ${e}`);
            }
        }
        else if (!this.config.credentials?.token && this.config.options?.devices) {
            this.debugLog(`SwitchBot Device Manual Config Set: ${JSON.stringify(this.config.options?.devices)}`);
            const deviceConfigs = this.config.options?.devices;
            const devices = deviceConfigs.map((v) => v);
            for (const device of devices) {
                device.deviceType = device.configDeviceType;
                device.deviceName = device.configDeviceName;
                if (device.deviceType) {
                    this.createDevice(device);
                }
            }
        }
        else {
            this.errorLog('Neither SwitchBot Token or Device Config are not set.');
        }
    }
    createDevice(device) {
        switch (device.deviceType) {
            case 'Humidifier':
                this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
                this.createHumidifier(device);
                break;
            case 'Hub Mini':
                this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
                break;
            case 'Hub Plus':
                this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
                break;
            case 'Hub 2':
                this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
                this.createHub2(device);
                break;
            case 'Bot':
                this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
                this.createBot(device);
                break;
            case 'Meter':
                this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
                this.createMeter(device);
                break;
            case 'MeterPlus':
            case 'Meter Plus (JP)':
                this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
                this.createMeterPlus(device);
                break;
            case 'WoIOSensor':
                this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
                this.createIOSensor(device);
                break;
            case 'Motion Sensor':
                this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
                this.createMotion(device);
                break;
            case 'Contact Sensor':
                this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
                this.createContact(device);
                break;
            case 'Curtain':
                this.debugLog(`Discovered ${device.deviceType} ${device.deviceName}: ${device.deviceId}`);
                this.createCurtain(device);
                break;
            case 'Blind Tilt':
                this.debugLog(`Discovered ${device.deviceType} ${device.deviceName}: ${device.deviceId}`);
                this.createBlindTilt(device);
                break;
            case 'Plug':
            case 'Plug Mini (US)':
            case 'Plug Mini (JP)':
                this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
                this.createPlug(device);
                break;
            case 'Smart Lock':
                this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
                this.createLock(device);
                break;
            case 'Color Bulb':
                this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
                this.createColorBulb(device);
                break;
            case 'Robot Vacuum Cleaner S1':
            case 'Robot Vacuum Cleaner S1 Plus':
                this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
                this.createRobotVacuumCleaner(device);
                break;
            case 'Ceiling Light':
            case 'Ceiling Light Pro':
                this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
                this.createCeilingLight(device);
                break;
            case 'Strip Light':
                this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
                this.createStripLight(device);
                break;
            case 'Indoor Cam':
                this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId}`);
                this.warnLog(`Device: ${device.deviceName} with Device Type: ${device.deviceType}, is currently not supported.`);
                break;
            case 'Remote':
                this.debugLog(`Discovered ${device.deviceType}: ${device.deviceId} is Not Supported.`);
                break;
            default:
                this.warnLog(`Device: ${device.deviceName} with Device Type: ${device.deviceType}, is currently not supported.`);
                // eslint-disable-next-line max-len
                this.warnLog('Submit Feature Requests Here: ' + 'https://tinyurl.com/SwitchBotFeatureRequest');
        }
    }
    createIRDevice(device) {
        if (device.connectionType === undefined) {
            device.connectionType = 'OpenAPI';
        }
        switch (device.remoteType) {
            case 'TV':
            case 'DIY TV':
            case 'Projector':
            case 'DIY Projector':
            case 'Set Top Box':
            case 'DIY Set Top Box':
            case 'IPTV':
            case 'DIY IPTV':
            case 'DVD':
            case 'DIY DVD':
            case 'Speaker':
            case 'DIY Speaker':
                this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
                if (device.external === undefined) {
                    device.external = true;
                    this.createTV(device);
                }
                else {
                    this.createTV(device);
                }
                break;
            case 'Fan':
            case 'DIY Fan':
                this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
                this.createFan(device);
                break;
            case 'Air Conditioner':
            case 'DIY Air Conditioner':
                this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
                this.createAirConditioner(device);
                break;
            case 'Light':
            case 'DIY Light':
                this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
                this.createLight(device);
                break;
            case 'Air Purifier':
            case 'DIY Air Purifier':
                this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
                this.createAirPurifier(device);
                break;
            case 'Water Heater':
            case 'DIY Water Heater':
                this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
                this.createWaterHeater(device);
                break;
            case 'Vacuum Cleaner':
            case 'DIY Vacuum Cleaner':
                this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
                this.createVacuumCleaner(device);
                break;
            case 'Camera':
            case 'DIY Camera':
                this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
                this.createCamera(device);
                break;
            case 'Others':
                this.debugLog(`Discovered ${device.remoteType}: ${device.deviceId}`);
                this.createOthers(device);
                break;
            default:
                this.debugLog(`Unsupported Device: ${JSON.stringify(device)}`);
                this.warnLog(`Device: ${device.deviceName} with Device Type: ${device.remoteType}, is currently not supported.`);
                this.warnLog('Submit Feature Requests Here: ' + 'https://tinyurl.com/SwitchBotFeatureRequest');
        }
    }
    async createHumidifier(device) {
        const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);
        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);
        if (existingAccessory) {
            // the accessory already exists
            if (await this.registerDevice(device)) {
                // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                existingAccessory.context.model = device.deviceType;
                existingAccessory.context.deviceID = device.deviceId;
                existingAccessory.displayName = device.configDeviceName || device.deviceName;
                existingAccessory.context.firmwareRevision = device.firmware;
                existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
                this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
                existingAccessory.context.connectionType = await this.connectionType(device);
                this.api.updatePlatformAccessories([existingAccessory]);
                // create the accessory handler for the restored accessory
                // this is imported from `platformAccessory.ts`
                new humidifier_1.Humidifier(this, existingAccessory, device);
                this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
            }
            else {
                this.unregisterPlatformAccessories(existingAccessory);
            }
        }
        else if (await this.registerDevice(device)) {
            // the accessory does not yet exist, so we need to create it
            if (!device.external) {
                this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
            }
            // create a new accessory
            const accessory = new this.api.platformAccessory(device.deviceName, uuid);
            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = device;
            accessory.context.model = device.deviceType;
            accessory.context.deviceID = device.deviceId;
            accessory.context.firmwareRevision = device.firmware;
            accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
            accessory.context.connectionType = await this.connectionType(device);
            // create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            new humidifier_1.Humidifier(this, accessory, device);
            this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);
            // publish device externally or link the accessory to your platform
            this.externalOrPlatform(device, accessory);
            this.accessories.push(accessory);
        }
        else {
            this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
        }
    }
    async createBot(device) {
        const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);
        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);
        if (existingAccessory) {
            // the accessory already exists
            if (await this.registerDevice(device)) {
                // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                existingAccessory.context.model = device.deviceType;
                existingAccessory.context.deviceID = device.deviceId;
                existingAccessory.displayName = device.configDeviceName || device.deviceName;
                existingAccessory.context.firmwareRevision = device.firmware;
                existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
                this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
                existingAccessory.context.connectionType = await this.connectionType(device);
                this.api.updatePlatformAccessories([existingAccessory]);
                // create the accessory handler for the restored accessory
                // this is imported from `platformAccessory.ts`
                new bot_1.Bot(this, existingAccessory, device);
                this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
            }
            else {
                this.unregisterPlatformAccessories(existingAccessory);
            }
        }
        else if (await this.registerDevice(device)) {
            // the accessory does not yet exist, so we need to create it
            if (!device.external) {
                this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
            }
            // create a new accessory
            const accessory = new this.api.platformAccessory(device.deviceName, uuid);
            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = device;
            accessory.context.model = device.deviceType;
            accessory.context.deviceID = device.deviceId;
            accessory.context.firmwareRevision = device.firmware;
            accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
            accessory.context.connectionType = await this.connectionType(device);
            // accessory.context.firmwareRevision = findaccessories.accessoryAttribute.softwareRevision;
            // create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            new bot_1.Bot(this, accessory, device);
            this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);
            // publish device externally or link the accessory to your platform
            this.externalOrPlatform(device, accessory);
            this.accessories.push(accessory);
        }
        else {
            this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
        }
    }
    async createMeter(device) {
        const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);
        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);
        if (existingAccessory) {
            // the accessory already exists
            if (await this.registerDevice(device)) {
                // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                existingAccessory.context.model = device.deviceType;
                existingAccessory.context.deviceID = device.deviceId;
                existingAccessory.displayName = device.configDeviceName || device.deviceName;
                existingAccessory.context.firmwareRevision = device.firmware;
                existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
                this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
                existingAccessory.context.connectionType = await this.connectionType(device);
                this.api.updatePlatformAccessories([existingAccessory]);
                // create the accessory handler for the restored accessory
                // this is imported from `platformAccessory.ts`
                new meter_1.Meter(this, existingAccessory, device);
                this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
            }
            else {
                this.unregisterPlatformAccessories(existingAccessory);
            }
        }
        else if (await this.registerDevice(device)) {
            // the accessory does not yet exist, so we need to create it
            if (!device.external) {
                this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
            }
            // create a new accessory
            const accessory = new this.api.platformAccessory(device.deviceName, uuid);
            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = device;
            accessory.context.model = device.deviceType;
            accessory.context.deviceID = device.deviceId;
            accessory.context.firmwareRevision = device.firmware;
            accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
            accessory.context.connectionType = await this.connectionType(device);
            // create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            new meter_1.Meter(this, accessory, device);
            this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);
            // publish device externally or link the accessory to your platform
            this.externalOrPlatform(device, accessory);
            this.accessories.push(accessory);
        }
        else {
            this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
        }
    }
    async createMeterPlus(device) {
        const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);
        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);
        if (existingAccessory) {
            // the accessory already exists
            if (await this.registerDevice(device)) {
                // console.log("existingAccessory", existingAccessory);
                // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                existingAccessory.context.model = device.deviceType;
                existingAccessory.context.deviceID = device.deviceId;
                existingAccessory.displayName = device.configDeviceName || device.deviceName;
                existingAccessory.context.firmwareRevision = device.firmware;
                existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
                this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
                existingAccessory.context.connectionType = await this.connectionType(device);
                this.api.updatePlatformAccessories([existingAccessory]);
                // create the accessory handler for the restored accessory
                // this is imported from `platformAccessory.ts`
                new meterplus_1.MeterPlus(this, existingAccessory, device);
                this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
            }
            else {
                this.unregisterPlatformAccessories(existingAccessory);
            }
        }
        else if (await this.registerDevice(device)) {
            // the accessory does not yet exist, so we need to create it
            if (!device.external) {
                this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
            }
            // create a new accessory
            const accessory = new this.api.platformAccessory(device.deviceName, uuid);
            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = device;
            accessory.context.model = device.deviceType;
            accessory.context.deviceID = device.deviceId;
            accessory.context.firmwareRevision = device.firmware;
            accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
            accessory.context.connectionType = await this.connectionType(device);
            // create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            new meterplus_1.MeterPlus(this, accessory, device);
            this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);
            // publish device externally or link the accessory to your platform
            this.externalOrPlatform(device, accessory);
            this.accessories.push(accessory);
        }
        else {
            this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
        }
    }
    async createHub2(device) {
        const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);
        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);
        if (existingAccessory) {
            // the accessory already exists
            if (await this.registerDevice(device)) {
                // console.log("existingAccessory", existingAccessory);
                // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                existingAccessory.context.model = device.deviceType;
                existingAccessory.context.deviceID = device.deviceId;
                existingAccessory.displayName = device.configDeviceName || device.deviceName;
                existingAccessory.context.firmwareRevision = device.firmware;
                existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
                this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
                existingAccessory.context.connectionType = await this.connectionType(device);
                this.api.updatePlatformAccessories([existingAccessory]);
                // create the accessory handler for the restored accessory
                // this is imported from `platformAccessory.ts`
                new hub_1.Hub(this, existingAccessory, device);
                this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
            }
            else {
                this.unregisterPlatformAccessories(existingAccessory);
            }
        }
        else if (await this.registerDevice(device)) {
            // the accessory does not yet exist, so we need to create it
            if (!device.external) {
                this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
            }
            // create a new accessory
            const accessory = new this.api.platformAccessory(device.deviceName, uuid);
            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = device;
            accessory.context.model = device.deviceType;
            accessory.context.deviceID = device.deviceId;
            accessory.context.firmwareRevision = device.firmware;
            accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
            accessory.context.connectionType = await this.connectionType(device);
            // create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            new hub_1.Hub(this, accessory, device);
            this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);
            // publish device externally or link the accessory to your platform
            this.externalOrPlatform(device, accessory);
            this.accessories.push(accessory);
        }
        else {
            this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
        }
    }
    async createIOSensor(device) {
        const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);
        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);
        if (existingAccessory) {
            // the accessory already exists
            if (await this.registerDevice(device)) {
                // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                existingAccessory.context.model = device.deviceType;
                existingAccessory.context.deviceID = device.deviceId;
                existingAccessory.displayName = device.configDeviceName || device.deviceName;
                existingAccessory.context.firmwareRevision = device.firmware;
                existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
                this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
                existingAccessory.context.connectionType = await this.connectionType(device);
                this.api.updatePlatformAccessories([existingAccessory]);
                // create the accessory handler for the restored accessory
                // this is imported from `platformAccessory.ts`
                new iosensor_1.IOSensor(this, existingAccessory, device);
                this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
            }
            else {
                this.unregisterPlatformAccessories(existingAccessory);
            }
        }
        else if (await this.registerDevice(device)) {
            // the accessory does not yet exist, so we need to create it
            if (!device.external) {
                this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
            }
            // create a new accessory
            const accessory = new this.api.platformAccessory(device.deviceName, uuid);
            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = device;
            accessory.context.model = device.deviceType;
            accessory.context.deviceID = device.deviceId;
            accessory.context.firmwareRevision = device.firmware;
            accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
            accessory.context.connectionType = await this.connectionType(device);
            // create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            new iosensor_1.IOSensor(this, accessory, device);
            this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);
            // publish device externally or link the accessory to your platform
            this.externalOrPlatform(device, accessory);
            this.accessories.push(accessory);
        }
        else {
            this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
        }
    }
    async createMotion(device) {
        const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);
        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);
        if (existingAccessory) {
            // the accessory already exists
            if (await this.registerDevice(device)) {
                // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                existingAccessory.context.model = device.deviceType;
                existingAccessory.context.deviceID = device.deviceId;
                existingAccessory.displayName = device.configDeviceName || device.deviceName;
                existingAccessory.context.firmwareRevision = device.firmware;
                existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
                this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
                existingAccessory.context.connectionType = await this.connectionType(device);
                this.api.updatePlatformAccessories([existingAccessory]);
                // create the accessory handler for the restored accessory
                // this is imported from `platformAccessory.ts`
                new motion_1.Motion(this, existingAccessory, device);
                this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
            }
            else {
                this.unregisterPlatformAccessories(existingAccessory);
            }
        }
        else if (await this.registerDevice(device)) {
            // the accessory does not yet exist, so we need to create it
            if (!device.external) {
                this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
            }
            // create a new accessory
            const accessory = new this.api.platformAccessory(device.deviceName, uuid);
            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = device;
            accessory.context.model = device.deviceType;
            accessory.context.deviceID = device.deviceId;
            accessory.context.firmwareRevision = device.firmware;
            accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
            accessory.context.connectionType = await this.connectionType(device);
            // create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            new motion_1.Motion(this, accessory, device);
            this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);
            // publish device externally or link the accessory to your platform
            this.externalOrPlatform(device, accessory);
            this.accessories.push(accessory);
        }
        else {
            this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
        }
    }
    async createContact(device) {
        const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);
        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);
        if (existingAccessory) {
            // the accessory already exists
            if (await this.registerDevice(device)) {
                // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                existingAccessory.context.model = device.deviceType;
                existingAccessory.context.deviceID = device.deviceId;
                existingAccessory.displayName = device.configDeviceName || device.deviceName;
                existingAccessory.context.firmwareRevision = device.firmware;
                existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
                this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
                existingAccessory.context.connectionType = await this.connectionType(device);
                this.api.updatePlatformAccessories([existingAccessory]);
                // create the accessory handler for the restored accessory
                // this is imported from `platformAccessory.ts`
                new contact_1.Contact(this, existingAccessory, device);
                this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
            }
            else {
                this.unregisterPlatformAccessories(existingAccessory);
            }
        }
        else if (await this.registerDevice(device)) {
            // the accessory does not yet exist, so we need to create it
            if (!device.external) {
                this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
            }
            // create a new accessory
            const accessory = new this.api.platformAccessory(device.deviceName, uuid);
            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = device;
            accessory.context.model = device.deviceType;
            accessory.context.deviceID = device.deviceId;
            accessory.context.firmwareRevision = device.firmware;
            accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
            accessory.context.connectionType = await this.connectionType(device);
            // create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            new contact_1.Contact(this, accessory, device);
            this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);
            // publish device externally or link the accessory to your platform
            this.externalOrPlatform(device, accessory);
            this.accessories.push(accessory);
        }
        else {
            this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
        }
    }
    async createBlindTilt(device) {
        const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);
        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);
        if (existingAccessory) {
            // the accessory already exists
            if (await this.registerDevice(device)) {
                // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                existingAccessory.context.model = device.deviceType;
                existingAccessory.context.deviceID = device.deviceId;
                existingAccessory.displayName = device.configDeviceName || device.deviceName;
                existingAccessory.context.firmwareRevision = device.firmware;
                existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
                this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
                existingAccessory.context.connectionType = await this.connectionType(device);
                this.api.updatePlatformAccessories([existingAccessory]);
                // create the accessory handler for the restored accessory
                // this is imported from `platformAccessory.ts`
                new blindtilt_1.BlindTilt(this, existingAccessory, device);
                this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
            }
            else {
                this.unregisterPlatformAccessories(existingAccessory);
            }
        }
        else if (await this.registerDevice(device)) {
            // the accessory does not yet exist, so we need to create it
            if (!device.external) {
                this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
            }
            if (device.group && !device.curtain?.disable_group) {
                this.debugLog('Your Curtains are grouped, '
                    + `, Secondary curtain automatically hidden. Main Curtain: ${device.deviceName}, DeviceID: ${device.deviceId}`);
            }
            else {
                if (device.master) {
                    this.warnLog(`Main Curtain: ${device.deviceName}, DeviceID: ${device.deviceId}`);
                }
                else {
                    this.errorLog(`Secondary Curtain: ${device.deviceName}, DeviceID: ${device.deviceId}`);
                }
            }
            // create a new accessory
            const accessory = new this.api.platformAccessory(device.deviceName, uuid);
            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = device;
            accessory.context.model = device.deviceType;
            accessory.context.deviceID = device.deviceId;
            accessory.context.firmwareRevision = device.firmware;
            accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
            accessory.context.connectionType = await this.connectionType(device);
            // create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            new blindtilt_1.BlindTilt(this, accessory, device);
            this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);
            // publish device externally or link the accessory to your platform
            this.externalOrPlatform(device, accessory);
            this.accessories.push(accessory);
        }
        else {
            this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
        }
    }
    async createCurtain(device) {
        const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);
        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);
        if (existingAccessory) {
            // the accessory already exists
            if (await this.registerDevice(device)) {
                // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                existingAccessory.context.model = device.deviceType;
                existingAccessory.context.deviceID = device.deviceId;
                existingAccessory.displayName = device.configDeviceName || device.deviceName;
                existingAccessory.context.firmwareRevision = device.firmware;
                existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
                this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
                existingAccessory.context.connectionType = await this.connectionType(device);
                this.api.updatePlatformAccessories([existingAccessory]);
                // create the accessory handler for the restored accessory
                // this is imported from `platformAccessory.ts`
                new curtain_1.Curtain(this, existingAccessory, device);
                this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
            }
            else {
                this.unregisterPlatformAccessories(existingAccessory);
            }
        }
        else if (await this.registerDevice(device)) {
            // the accessory does not yet exist, so we need to create it
            if (!device.external) {
                this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
            }
            if (device.group && !device.curtain?.disable_group) {
                this.debugLog('Your Curtains are grouped, '
                    + `, Secondary curtain automatically hidden. Main Curtain: ${device.deviceName}, DeviceID: ${device.deviceId}`);
            }
            else {
                if (device.master) {
                    this.warnLog(`Main Curtain: ${device.deviceName}, DeviceID: ${device.deviceId}`);
                }
                else {
                    this.errorLog(`Secondary Curtain: ${device.deviceName}, DeviceID: ${device.deviceId}`);
                }
            }
            // create a new accessory
            const accessory = new this.api.platformAccessory(device.deviceName, uuid);
            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = device;
            accessory.context.model = device.deviceType;
            accessory.context.deviceID = device.deviceId;
            accessory.context.firmwareRevision = device.firmware;
            accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
            accessory.context.connectionType = await this.connectionType(device);
            // create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            new curtain_1.Curtain(this, accessory, device);
            this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);
            // publish device externally or link the accessory to your platform
            this.externalOrPlatform(device, accessory);
            this.accessories.push(accessory);
        }
        else {
            this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
        }
    }
    async createPlug(device) {
        const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);
        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);
        if (existingAccessory) {
            // the accessory already exists
            if (await this.registerDevice(device)) {
                // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                existingAccessory.context.model = device.deviceType;
                existingAccessory.context.deviceID = device.deviceId;
                existingAccessory.displayName = device.configDeviceName || device.deviceName;
                existingAccessory.context.firmwareRevision = device.firmware;
                existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
                this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
                existingAccessory.context.connectionType = await this.connectionType(device);
                this.api.updatePlatformAccessories([existingAccessory]);
                // create the accessory handler for the restored accessory
                // this is imported from `platformAccessory.ts`
                new plug_1.Plug(this, existingAccessory, device);
                this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
            }
            else {
                this.unregisterPlatformAccessories(existingAccessory);
            }
        }
        else if (await this.registerDevice(device)) {
            // the accessory does not yet exist, so we need to create it
            if (!device.external) {
                this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
            }
            // create a new accessory
            const accessory = new this.api.platformAccessory(device.deviceName, uuid);
            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = device;
            accessory.context.model = device.deviceType;
            accessory.context.deviceID = device.deviceId;
            accessory.context.firmwareRevision = device.firmware;
            accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
            accessory.context.connectionType = await this.connectionType(device);
            // create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            new plug_1.Plug(this, accessory, device);
            this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);
            // publish device externally or link the accessory to your platform
            this.externalOrPlatform(device, accessory);
            this.accessories.push(accessory);
        }
        else {
            this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
        }
    }
    async createLock(device) {
        const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);
        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);
        if (existingAccessory) {
            // the accessory already exists
            if (await this.registerDevice(device)) {
                // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                existingAccessory.context.model = device.deviceType;
                existingAccessory.context.deviceID = device.deviceId;
                existingAccessory.displayName = device.configDeviceName || device.deviceName;
                existingAccessory.context.firmwareRevision = device.firmware;
                existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
                this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
                existingAccessory.context.connectionType = await this.connectionType(device);
                this.api.updatePlatformAccessories([existingAccessory]);
                // create the accessory handler for the restored accessory
                // this is imported from `platformAccessory.ts`
                new lock_1.Lock(this, existingAccessory, device);
                this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
            }
            else {
                this.unregisterPlatformAccessories(existingAccessory);
            }
        }
        else if (await this.registerDevice(device)) {
            // the accessory does not yet exist, so we need to create it
            if (!device.external) {
                this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
            }
            // create a new accessory
            const accessory = new this.api.platformAccessory(device.deviceName, uuid);
            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = device;
            accessory.context.model = device.deviceType;
            accessory.context.deviceID = device.deviceId;
            accessory.context.firmwareRevision = device.firmware;
            accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
            accessory.context.connectionType = await this.connectionType(device);
            // create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            new lock_1.Lock(this, accessory, device);
            this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);
            // publish device externally or link the accessory to your platform
            this.externalOrPlatform(device, accessory);
            this.accessories.push(accessory);
        }
        else {
            this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
        }
    }
    async createColorBulb(device) {
        const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);
        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);
        if (existingAccessory) {
            // the accessory already exists
            if (await this.registerDevice(device)) {
                // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                existingAccessory.context.model = device.deviceType;
                existingAccessory.context.deviceID = device.deviceId;
                existingAccessory.displayName = device.configDeviceName || device.deviceName;
                existingAccessory.context.firmwareRevision = device.firmware;
                existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
                this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
                existingAccessory.context.connectionType = await this.connectionType(device);
                this.api.updatePlatformAccessories([existingAccessory]);
                // create the accessory handler for the restored accessory
                // this is imported from `platformAccessory.ts`
                new colorbulb_1.ColorBulb(this, existingAccessory, device);
                this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
            }
            else {
                this.unregisterPlatformAccessories(existingAccessory);
            }
        }
        else if (await this.registerDevice(device)) {
            // the accessory does not yet exist, so we need to create it
            if (!device.external) {
                this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
            }
            // create a new accessory
            const accessory = new this.api.platformAccessory(device.deviceName, uuid);
            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = device;
            accessory.context.model = device.deviceType;
            accessory.context.deviceID = device.deviceId;
            accessory.context.firmwareRevision = device.firmware;
            accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
            accessory.context.connectionType = await this.connectionType(device);
            // create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            new colorbulb_1.ColorBulb(this, accessory, device);
            this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);
            // publish device externally or link the accessory to your platform
            this.externalOrPlatform(device, accessory);
            this.accessories.push(accessory);
        }
        else {
            this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
        }
    }
    async createCeilingLight(device) {
        const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);
        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);
        if (existingAccessory) {
            // the accessory already exists
            if (await this.registerDevice(device)) {
                // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                existingAccessory.context.model = device.deviceType;
                existingAccessory.context.deviceID = device.deviceId;
                existingAccessory.displayName = device.configDeviceName || device.deviceName;
                existingAccessory.context.firmwareRevision = device.firmware;
                existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
                this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
                existingAccessory.context.connectionType = await this.connectionType(device);
                this.api.updatePlatformAccessories([existingAccessory]);
                // create the accessory handler for the restored accessory
                // this is imported from `platformAccessory.ts`
                new ceilinglight_1.CeilingLight(this, existingAccessory, device);
                this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
            }
            else {
                this.unregisterPlatformAccessories(existingAccessory);
            }
        }
        else if (await this.registerDevice(device)) {
            // the accessory does not yet exist, so we need to create it
            if (!device.external) {
                this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
            }
            // create a new accessory
            const accessory = new this.api.platformAccessory(device.deviceName, uuid);
            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = device;
            accessory.context.model = device.deviceType;
            accessory.context.deviceID = device.deviceId;
            accessory.context.firmwareRevision = device.firmware;
            accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
            accessory.context.connectionType = await this.connectionType(device);
            // create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            new ceilinglight_1.CeilingLight(this, accessory, device);
            this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);
            // publish device externally or link the accessory to your platform
            this.externalOrPlatform(device, accessory);
            this.accessories.push(accessory);
        }
        else {
            this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
        }
    }
    async createStripLight(device) {
        const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);
        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);
        if (existingAccessory) {
            // the accessory already exists
            if (await this.registerDevice(device)) {
                // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                existingAccessory.context.model = device.deviceType;
                existingAccessory.context.deviceID = device.deviceId;
                existingAccessory.displayName = device.configDeviceName || device.deviceName;
                existingAccessory.context.firmwareRevision = device.firmware;
                existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
                this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
                existingAccessory.context.connectionType = await this.connectionType(device);
                this.api.updatePlatformAccessories([existingAccessory]);
                // create the accessory handler for the restored accessory
                // this is imported from `platformAccessory.ts`
                new lightstrip_1.StripLight(this, existingAccessory, device);
                this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
            }
            else {
                this.unregisterPlatformAccessories(existingAccessory);
            }
        }
        else if (await this.registerDevice(device)) {
            // the accessory does not yet exist, so we need to create it
            if (!device.external) {
                this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
            }
            // create a new accessory
            const accessory = new this.api.platformAccessory(device.deviceName, uuid);
            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = device;
            accessory.context.model = device.deviceType;
            accessory.context.deviceID = device.deviceId;
            accessory.context.firmwareRevision = device.firmware;
            accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
            accessory.context.connectionType = await this.connectionType(device);
            // create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            new lightstrip_1.StripLight(this, accessory, device);
            this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);
            // publish device externally or link the accessory to your platform
            this.externalOrPlatform(device, accessory);
            this.accessories.push(accessory);
        }
        else {
            this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
        }
    }
    async createRobotVacuumCleaner(device) {
        const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.deviceType}`);
        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);
        if (existingAccessory) {
            // the accessory already exists
            if (await this.registerDevice(device)) {
                // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                existingAccessory.context.model = device.deviceType;
                existingAccessory.context.deviceID = device.deviceId;
                existingAccessory.displayName = device.configDeviceName || device.deviceName;
                existingAccessory.context.firmwareRevision = device.firmware;
                existingAccessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
                this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
                existingAccessory.context.connectionType = await this.connectionType(device);
                this.api.updatePlatformAccessories([existingAccessory]);
                // create the accessory handler for the restored accessory
                // this is imported from `platformAccessory.ts`
                new robotvacuumcleaner_1.RobotVacuumCleaner(this, existingAccessory, device);
                this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${existingAccessory.UUID})`);
            }
            else {
                this.unregisterPlatformAccessories(existingAccessory);
            }
        }
        else if (await this.registerDevice(device)) {
            // the accessory does not yet exist, so we need to create it
            if (!device.external) {
                this.infoLog(`Adding new accessory: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
            }
            // create a new accessory
            const accessory = new this.api.platformAccessory(device.deviceName, uuid);
            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = device;
            accessory.context.model = device.deviceType;
            accessory.context.deviceID = device.deviceId;
            accessory.context.firmwareRevision = device.firmware;
            accessory.context.deviceType = `SwitchBot: ${device.deviceType}`;
            accessory.context.connectionType = await this.connectionType(device);
            // create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            new robotvacuumcleaner_1.RobotVacuumCleaner(this, accessory, device);
            this.debugLog(`${device.deviceType} uuid: ${device.deviceId}-${device.deviceType}, (${accessory.UUID})`);
            // publish device externally or link the accessory to your platform
            this.externalOrPlatform(device, accessory);
            this.accessories.push(accessory);
        }
        else {
            this.debugLog(`Device not registered: ${device.deviceName} ${device.deviceType} DeviceID: ${device.deviceId}`);
        }
    }
    async createTV(device) {
        const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);
        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);
        if (!device.hide_device && existingAccessory) {
            // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
            existingAccessory.context.model = device.remoteType;
            existingAccessory.context.deviceID = device.deviceId;
            existingAccessory.displayName = device.configDeviceName || device.deviceName;
            existingAccessory.context.firmwareRevision = device.firmware;
            existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
            this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
            existingAccessory.context.connectionType = device.connectionType;
            this.api.updatePlatformAccessories([existingAccessory]);
            // create the accessory handler for the restored accessory
            // this is imported from `platformAccessory.ts`
            new tv_1.TV(this, existingAccessory, device);
            this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
        }
        else if (!device.hide_device && device.hubDeviceId) {
            // the accessory does not yet exist, so we need to create it
            if (!device.external) {
                this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
            }
            // create a new accessory
            const accessory = new this.api.platformAccessory(device.deviceName, uuid);
            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = device;
            accessory.context.model = device.remoteType;
            accessory.context.deviceID = device.deviceId;
            accessory.context.firmwareRevision = device.firmware;
            accessory.context.deviceType = `IR: ${device.remoteType}`;
            accessory.context.connectionType = device.connectionType;
            // create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            new tv_1.TV(this, accessory, device);
            this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);
            this.externalOrPlatformIR(device, accessory);
            this.accessories.push(accessory);
        }
        else {
            this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
        }
    }
    async createFan(device) {
        const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);
        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);
        if (existingAccessory) {
            // the accessory already exists
            if (!device.hide_device && device.hubDeviceId) {
                // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                existingAccessory.context.model = device.remoteType;
                existingAccessory.context.deviceID = device.deviceId;
                existingAccessory.displayName = device.configDeviceName || device.deviceName;
                existingAccessory.context.firmwareRevision = device.firmware;
                existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
                this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
                existingAccessory.context.connectionType = device.connectionType;
                this.api.updatePlatformAccessories([existingAccessory]);
                // create the accessory handler for the restored accessory
                // this is imported from `platformAccessory.ts`
                new fan_1.Fan(this, existingAccessory, device);
                this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
            }
            else {
                this.unregisterPlatformAccessories(existingAccessory);
            }
        }
        else if (!device.hide_device && device.hubDeviceId) {
            // the accessory does not yet exist, so we need to create it
            if (!device.external) {
                this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
            }
            // create a new accessory
            const accessory = new this.api.platformAccessory(device.deviceName, uuid);
            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = device;
            accessory.context.model = device.remoteType;
            accessory.context.deviceID = device.deviceId;
            accessory.context.firmwareRevision = device.firmware;
            accessory.context.deviceType = `IR: ${device.remoteType}`;
            accessory.context.connectionType = device.connectionType;
            // create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            new fan_1.Fan(this, accessory, device);
            this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);
            // publish device externally or link the accessory to your platform
            this.externalOrPlatformIR(device, accessory);
            this.accessories.push(accessory);
        }
        else {
            this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
        }
    }
    async createLight(device) {
        const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);
        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);
        if (existingAccessory) {
            // the accessory already exists
            if (!device.hide_device && device.hubDeviceId) {
                // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                existingAccessory.context.model = device.remoteType;
                existingAccessory.context.deviceID = device.deviceId;
                existingAccessory.displayName = device.configDeviceName || device.deviceName;
                existingAccessory.context.firmwareRevision = device.firmware;
                existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
                this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
                existingAccessory.context.connectionType = device.connectionType;
                this.api.updatePlatformAccessories([existingAccessory]);
                // create the accessory handler for the restored accessory
                // this is imported from `platformAccessory.ts`
                new light_1.Light(this, existingAccessory, device);
                this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
            }
            else {
                this.unregisterPlatformAccessories(existingAccessory);
            }
        }
        else if (!device.hide_device && device.hubDeviceId) {
            // the accessory does not yet exist, so we need to create it
            if (!device.external) {
                this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
            }
            // create a new accessory
            const accessory = new this.api.platformAccessory(device.deviceName, uuid);
            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = device;
            accessory.context.model = device.remoteType;
            accessory.context.deviceID = device.deviceId;
            accessory.context.firmwareRevision = device.firmware;
            accessory.context.deviceType = `IR: ${device.remoteType}`;
            accessory.context.connectionType = device.connectionType;
            // create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            new light_1.Light(this, accessory, device);
            this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);
            // publish device externally or link the accessory to your platform
            this.externalOrPlatformIR(device, accessory);
            this.accessories.push(accessory);
        }
        else {
            this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
        }
    }
    async createAirConditioner(device) {
        const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);
        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);
        if (existingAccessory) {
            // the accessory already exists
            if (!device.hide_device && device.hubDeviceId) {
                // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                existingAccessory.context.model = device.remoteType;
                existingAccessory.context.deviceID = device.deviceId;
                existingAccessory.displayName = device.configDeviceName || device.deviceName;
                existingAccessory.context.firmwareRevision = device.firmware;
                existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
                this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
                existingAccessory.context.connectionType = device.connectionType;
                this.api.updatePlatformAccessories([existingAccessory]);
                // create the accessory handler for the restored accessory
                // this is imported from `platformAccessory.ts`
                new airconditioner_1.AirConditioner(this, existingAccessory, device);
                this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
            }
            else {
                this.unregisterPlatformAccessories(existingAccessory);
            }
        }
        else if (!device.hide_device && device.hubDeviceId) {
            // the accessory does not yet exist, so we need to create it
            if (!device.external) {
                this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
            }
            // create a new accessory
            const accessory = new this.api.platformAccessory(device.deviceName, uuid);
            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = device;
            accessory.context.model = device.remoteType;
            accessory.context.deviceID = device.deviceId;
            accessory.context.firmwareRevision = device.firmware;
            accessory.context.deviceType = `IR: ${device.remoteType}`;
            accessory.context.connectionType = device.connectionType;
            // create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            new airconditioner_1.AirConditioner(this, accessory, device);
            this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);
            // publish device externally or link the accessory to your platform
            this.externalOrPlatformIR(device, accessory);
            this.accessories.push(accessory);
        }
        else {
            this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
        }
    }
    async createAirPurifier(device) {
        const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);
        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);
        if (existingAccessory) {
            // the accessory already exists
            if (!device.hide_device && device.hubDeviceId) {
                // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                existingAccessory.context.model = device.remoteType;
                existingAccessory.context.deviceID = device.deviceId;
                existingAccessory.displayName = device.configDeviceName || device.deviceName;
                existingAccessory.context.firmwareRevision = device.firmware;
                existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
                this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
                existingAccessory.context.connectionType = device.connectionType;
                this.api.updatePlatformAccessories([existingAccessory]);
                // create the accessory handler for the restored accessory
                // this is imported from `platformAccessory.ts`
                new airpurifier_1.AirPurifier(this, existingAccessory, device);
                this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
            }
            else {
                this.unregisterPlatformAccessories(existingAccessory);
            }
        }
        else if (!device.hide_device && device.hubDeviceId) {
            // the accessory does not yet exist, so we need to create it
            if (!device.external) {
                this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
            }
            // create a new accessory
            const accessory = new this.api.platformAccessory(device.deviceName, uuid);
            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = device;
            accessory.context.model = device.remoteType;
            accessory.context.deviceID = device.deviceId;
            accessory.context.firmwareRevision = device.firmware;
            accessory.context.deviceType = `IR: ${device.remoteType}`;
            accessory.context.connectionType = device.connectionType;
            // create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            new airpurifier_1.AirPurifier(this, accessory, device);
            this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);
            // publish device externally or link the accessory to your platform
            this.externalOrPlatformIR(device, accessory);
            this.accessories.push(accessory);
        }
        else {
            this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
        }
    }
    async createWaterHeater(device) {
        const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);
        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);
        if (existingAccessory) {
            // the accessory already exists
            if (!device.hide_device && device.hubDeviceId) {
                // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                existingAccessory.context.model = device.remoteType;
                existingAccessory.context.deviceID = device.deviceId;
                existingAccessory.displayName = device.configDeviceName || device.deviceName;
                existingAccessory.context.firmwareRevision = device.firmware;
                existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
                this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
                existingAccessory.context.connectionType = device.connectionType;
                this.api.updatePlatformAccessories([existingAccessory]);
                // create the accessory handler for the restored accessory
                // this is imported from `platformAccessory.ts`
                new waterheater_1.WaterHeater(this, existingAccessory, device);
                this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
            }
            else {
                this.unregisterPlatformAccessories(existingAccessory);
            }
        }
        else if (!device.hide_device && device.hubDeviceId) {
            // the accessory does not yet exist, so we need to create it
            if (!device.external) {
                this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
            }
            // create a new accessory
            const accessory = new this.api.platformAccessory(device.deviceName, uuid);
            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = device;
            accessory.context.model = device.remoteType;
            accessory.context.deviceID = device.deviceId;
            accessory.context.firmwareRevision = device.firmware;
            accessory.context.deviceType = `IR: ${device.remoteType}`;
            accessory.context.connectionType = device.connectionType;
            // create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            new waterheater_1.WaterHeater(this, accessory, device);
            this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);
            // publish device externally or link the accessory to your platform
            this.externalOrPlatformIR(device, accessory);
            this.accessories.push(accessory);
        }
        else {
            this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
        }
    }
    async createVacuumCleaner(device) {
        const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);
        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);
        if (existingAccessory) {
            // the accessory already exists
            if (!device.hide_device && device.hubDeviceId) {
                // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                existingAccessory.context.model = device.remoteType;
                existingAccessory.context.deviceID = device.deviceId;
                existingAccessory.displayName = device.configDeviceName || device.deviceName;
                existingAccessory.context.firmwareRevision = device.firmware;
                existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
                this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
                existingAccessory.context.connectionType = device.connectionType;
                this.api.updatePlatformAccessories([existingAccessory]);
                // create the accessory handler for the restored accessory
                // this is imported from `platformAccessory.ts`
                new vacuumcleaner_1.VacuumCleaner(this, existingAccessory, device);
                this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
            }
            else {
                this.unregisterPlatformAccessories(existingAccessory);
            }
        }
        else if (!device.hide_device && device.hubDeviceId) {
            // the accessory does not yet exist, so we need to create it
            if (!device.external) {
                this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
            }
            // create a new accessory
            const accessory = new this.api.platformAccessory(device.deviceName, uuid);
            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = device;
            accessory.context.model = device.remoteType;
            accessory.context.deviceID = device.deviceId;
            accessory.context.firmwareRevision = device.firmware;
            accessory.context.deviceType = `IR: ${device.remoteType}`;
            accessory.context.connectionType = device.connectionType;
            // create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            new vacuumcleaner_1.VacuumCleaner(this, accessory, device);
            this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);
            // publish device externally or link the accessory to your platform
            this.externalOrPlatformIR(device, accessory);
            this.accessories.push(accessory);
        }
        else {
            this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
        }
    }
    async createCamera(device) {
        const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);
        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);
        if (existingAccessory) {
            // the accessory already exists
            if (!device.hide_device && device.hubDeviceId) {
                // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                existingAccessory.context.model = device.remoteType;
                existingAccessory.context.deviceID = device.deviceId;
                existingAccessory.displayName = device.configDeviceName || device.deviceName;
                existingAccessory.context.firmwareRevision = device.firmware;
                existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
                this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
                existingAccessory.context.connectionType = device.connectionType;
                this.api.updatePlatformAccessories([existingAccessory]);
                // create the accessory handler for the restored accessory
                // this is imported from `platformAccessory.ts`
                new camera_1.Camera(this, existingAccessory, device);
                this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
            }
            else {
                this.unregisterPlatformAccessories(existingAccessory);
            }
        }
        else if (!device.hide_device && device.hubDeviceId) {
            // the accessory does not yet exist, so we need to create it
            if (!device.external) {
                this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
            }
            // create a new accessory
            const accessory = new this.api.platformAccessory(device.deviceName, uuid);
            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = device;
            accessory.context.model = device.remoteType;
            accessory.context.deviceID = device.deviceId;
            accessory.context.firmwareRevision = device.firmware;
            accessory.context.deviceType = `IR: ${device.remoteType}`;
            accessory.context.connectionType = device.connectionType;
            // create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            new camera_1.Camera(this, accessory, device);
            this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);
            // publish device externally or link the accessory to your platform
            this.externalOrPlatformIR(device, accessory);
            this.accessories.push(accessory);
        }
        else {
            this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
        }
    }
    async createOthers(device) {
        const uuid = this.api.hap.uuid.generate(`${device.deviceId}-${device.remoteType}`);
        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);
        if (existingAccessory) {
            // the accessory already exists
            if (!device.hide_device && device.hubDeviceId) {
                // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
                existingAccessory.context.model = device.remoteType;
                existingAccessory.context.deviceID = device.deviceId;
                existingAccessory.displayName = device.configDeviceName || device.deviceName;
                existingAccessory.context.firmwareRevision = device.firmware;
                existingAccessory.context.deviceType = `IR: ${device.remoteType}`;
                this.infoLog(`Restoring existing accessory from cache: ${existingAccessory.displayName} DeviceID: ${device.deviceId}`);
                existingAccessory.context.connectionType = device.connectionType;
                this.api.updatePlatformAccessories([existingAccessory]);
                // create the accessory handler for the restored accessory
                // this is imported from `platformAccessory.ts`
                new other_1.Others(this, existingAccessory, device);
                this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${existingAccessory.UUID})`);
            }
            else {
                this.unregisterPlatformAccessories(existingAccessory);
            }
        }
        else if (!device.hide_device && device.hubDeviceId) {
            // the accessory does not yet exist, so we need to create it
            if (!device.external) {
                this.infoLog(`Adding new accessory: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
            }
            // create a new accessory
            const accessory = new this.api.platformAccessory(device.deviceName, uuid);
            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = device;
            accessory.context.model = device.remoteType;
            accessory.context.deviceID = device.deviceId;
            accessory.context.firmwareRevision = device.firmware;
            accessory.context.deviceType = `IR: ${device.remoteType}`;
            accessory.context.connectionType = device.connectionType;
            // create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            new other_1.Others(this, accessory, device);
            this.debugLog(`${device.remoteType} uuid: ${device.deviceId}-${device.remoteType}, (${accessory.UUID})`);
            // publish device externally or link the accessory to your platform
            this.externalOrPlatformIR(device, accessory);
            this.accessories.push(accessory);
        }
        else {
            this.debugLog(`Device not registered: ${device.deviceName} ${device.remoteType} DeviceID: ${device.deviceId}`);
        }
    }
    async registerCurtains(device) {
        if (device.deviceType === 'Curtain') {
            this.debugWarnLog(`deviceName: ${device.deviceName} deviceId: ${device.deviceId}, curtainDevicesIds: ${device.curtainDevicesIds}, master: `
                + `${device.master}, group: ${device.group}, disable_group: ${device.curtain?.disable_group}, connectionType: ${device.connectionType}`);
        }
        else {
            this.debugWarnLog(`deviceName: ${device.deviceName} deviceId: ${device.deviceId}, blindTiltDevicesIds: ${device.blindTiltDevicesIds}, master: `
                + `${device.master}, group: ${device.group}, disable_group: ${device.curtain?.disable_group}, connectionType: ${device.connectionType}`);
        }
        let registerCurtain;
        if (device.master && device.group) {
            // OpenAPI: Master Curtains/Blind Tilt in Group
            registerCurtain = true;
            this.debugLog(`deviceName: ${device.deviceName} [${device.deviceType} Config] device.master: ${device.master}, device.group: ${device.group}`
                + ` connectionType; ${device.connectionType}`);
            this.debugWarnLog(`Device: ${device.deviceName} registerCurtains: ${registerCurtain}`);
        }
        else if (!device.master && device.curtain?.disable_group) { //!device.group && device.connectionType === 'BLE'
            // OpenAPI: Non-Master Curtains/Blind Tilts that has Disable Grouping Checked
            registerCurtain = true;
            this.debugLog(`deviceName: ${device.deviceName} [${device.deviceType} Config] device.master: ${device.master}, disable_group: `
                + `${device.curtain?.disable_group}, connectionType; ${device.connectionType}`);
            this.debugWarnLog(`Device: ${device.deviceName} registerCurtains: ${registerCurtain}`);
        }
        else if (device.master && !device.group) {
            // OpenAPI: Master Curtains/Blind Tilts not in Group
            registerCurtain = true;
            this.debugLog(`deviceName: ${device.deviceName} [${device.deviceType} Config] device.master: ${device.master}, device.group: ${device.group}`
                + ` connectionType; ${device.connectionType}`);
            this.debugWarnLog(`Device: ${device.deviceName} registerCurtains: ${registerCurtain}`);
        }
        else if (device.connectionType === 'BLE') {
            // BLE: Curtains/Blind Tilt
            registerCurtain = true;
            this.debugLog(`deviceName: ${device.deviceName} [${device.deviceType} Config] connectionType: ${device.connectionType}, `
                + ` group: ${device.group}`);
            this.debugWarnLog(`Device: ${device.deviceName} registerCurtains: ${registerCurtain}`);
        }
        else {
            registerCurtain = false;
            this.debugErrorLog(`deviceName: ${device.deviceName} [${device.deviceType} Config] disable_group: ${device.curtain?.disable_group},`
                + ` device.master: ${device.master}, device.group: ${device.group}`);
            this.debugWarnLog(`Device: ${device.deviceName} registerCurtains: ${registerCurtain}, device.connectionType: ${device.connectionType}`);
        }
        return registerCurtain;
    }
    async connectionType(device) {
        let connectionType;
        if (!device.connectionType && this.config.credentials?.token && this.config.credentials.secret) {
            connectionType = 'OpenAPI';
        }
        else {
            connectionType = device.connectionType;
        }
        return connectionType;
    }
    async registerDevice(device) {
        device.connectionType = await this.connectionType(device);
        let registerDevice;
        if (!device.hide_device && device.connectionType === 'BLE/OpenAPI') {
            if (device.deviceType === 'Curtain' || device.deviceType === 'Blind Tilt') {
                registerDevice = await this.registerCurtains(device);
                this.debugWarnLog(`Device: ${device.deviceName} ${device.deviceType} registerDevice: ${registerDevice}`);
            }
            else {
                registerDevice = true;
                this.debugWarnLog(`Device: ${device.deviceName} registerDevice: ${registerDevice}`);
            }
            this.debugWarnLog(`Device: ${device.deviceName} connectionType: ${device.connectionType}, will display in HomeKit`);
        }
        else if (!device.hide_device && device.deviceId && device.configDeviceType && device.configDeviceName
            && device.connectionType === 'BLE') {
            if (device.deviceType === 'Curtain' || device.deviceType === 'Blind Tilt') {
                registerDevice = await this.registerCurtains(device);
                this.debugWarnLog(`Device: ${device.deviceName} ${device.deviceType} registerDevice: ${registerDevice}`);
            }
            else {
                registerDevice = true;
                this.debugWarnLog(`Device: ${device.deviceName} registerDevice: ${registerDevice}`);
            }
            this.debugWarnLog(`Device: ${device.deviceName} connectionType: ${device.connectionType}, will display in HomeKit`);
        }
        else if (!device.hide_device && device.connectionType === 'OpenAPI') {
            if (device.deviceType === 'Curtain' || device.deviceType === 'Blind Tilt') {
                registerDevice = await this.registerCurtains(device);
                this.debugWarnLog(`Device: ${device.deviceName} ${device.deviceType} registerDevice: ${registerDevice}`);
            }
            else {
                registerDevice = true;
                this.debugWarnLog(`Device: ${device.deviceName} registerDevice: ${registerDevice}`);
            }
            this.debugWarnLog(`Device: ${device.deviceName} connectionType: ${device.connectionType}, will display in HomeKit`);
        }
        else if (!device.hide_device && device.connectionType === 'Disabled') {
            if (device.deviceType === 'Curtain' || device.deviceType === 'Blind Tilt') {
                registerDevice = await this.registerCurtains(device);
                this.debugWarnLog(`Device: ${device.deviceName} ${device.deviceType} registerDevice: ${registerDevice}`);
            }
            else {
                registerDevice = true;
                this.debugWarnLog(`Device: ${device.deviceName} registerDevice: ${registerDevice}`);
            }
            this.debugWarnLog(`Device: ${device.deviceName} connectionType: ${device.connectionType}, will continue to display in HomeKit`);
        }
        else if (!device.connectionType && !device.hide_device) {
            registerDevice = false;
            this.debugErrorLog(`Device: ${device.deviceName} connectionType: ${device.connectionType}, will not display in HomeKit`);
        }
        else if (device.hide_device) {
            registerDevice = false;
            this.debugErrorLog(`Device: ${device.deviceName} hide_device: ${device.hide_device}, will not display in HomeKit`);
        }
        else {
            registerDevice = false;
            this.debugErrorLog(`Device: ${device.deviceName} connectionType: ${device.connectionType}, hide_device: `
                + `${device.hide_device},  will not display in HomeKit`);
        }
        return registerDevice;
    }
    async externalOrPlatformIR(device, accessory) {
        /**
           * Publish as external accessory
           * Only one TV can exist per bridge, to bypass this limitation, you should
           * publish your TV as an external accessory.
           */
        if (device.external) {
            this.debugWarnLog(`${accessory.displayName} External Accessory Mode`);
            this.externalAccessory(accessory);
        }
        else {
            this.debugLog(`${accessory.displayName} External Accessory Mode: ${device.external}`);
            this.api.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [accessory]);
        }
    }
    async externalOrPlatform(device, accessory) {
        if (device.external) {
            this.debugWarnLog(`${accessory.displayName} External Accessory Mode`);
            this.externalAccessory(accessory);
        }
        else {
            this.debugLog(`${accessory.displayName} External Accessory Mode: ${device.external}`);
            this.api.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [accessory]);
        }
    }
    async externalAccessory(accessory) {
        this.api.publishExternalAccessories(settings_1.PLUGIN_NAME, [accessory]);
    }
    unregisterPlatformAccessories(existingAccessory) {
        // remove platform accessories when no longer present
        this.api.unregisterPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [existingAccessory]);
        this.warnLog(`Removing existing accessory from cache: ${existingAccessory.displayName}`);
    }
    async statusCode(statusCode) {
        switch (statusCode) {
            case 151:
                this.errorLog(`Command not supported by this device type, statusCode: ${statusCode}, Submit Feature Request Here: `
                    + 'https://tinyurl.com/SwitchBotFeatureRequest');
                break;
            case 152:
                this.errorLog(`Device not found, statusCode: ${statusCode}`);
                break;
            case 160:
                this.errorLog(`Command is not supported, statusCode: ${statusCode}, Submit Bugs Here: ' + 'https://tinyurl.com/SwitchBotBug`);
                break;
            case 161:
                this.errorLog(`Device is offline, statusCode: ${statusCode}`);
                break;
            case 171:
                this.errorLog(`is offline, statusCode: ${statusCode}`);
                break;
            case 190:
                this.errorLog(`Requests reached the daily limit, statusCode: ${statusCode}`);
                break;
            case 100:
                this.debugLog(`Command successfully sent, statusCode: ${statusCode}`);
                break;
            case 200:
                this.debugLog(`Request successful, statusCode: ${statusCode}`);
                break;
            default:
                this.infoLog(`Unknown statusCode, statusCode: ${statusCode}, Submit Bugs Here: ' + 'https://tinyurl.com/SwitchBotBug`);
        }
    }
    // BLE Connection
    connectBLE() {
        let Switchbot;
        let switchbot;
        try {
            Switchbot = require('node-switchbot');
            rxjs_1.queueScheduler.schedule(() => switchbot = new Switchbot());
        }
        catch (e) {
            switchbot = false;
            this.errorLog(`Was 'node-switchbot' found: ${switchbot}`);
        }
        return switchbot;
    }
    logs() {
        this.debugMode = process.argv.includes('-D') || process.argv.includes('--debug');
        if (this.config.options?.logging === 'debug' || this.config.options?.logging === 'standard' || this.config.options?.logging === 'none') {
            this.platformLogging = this.config.options.logging;
            this.debugWarnLog(`Using Config Logging: ${this.platformLogging}`);
        }
        else if (this.debugMode) {
            this.platformLogging = 'debugMode';
            this.debugWarnLog(`Using ${this.platformLogging} Logging`);
        }
        else {
            this.platformLogging = 'standard';
            this.debugWarnLog(`Using ${this.platformLogging} Logging`);
        }
    }
    /**
     * If device level logging is turned on, log to log.warn
     * Otherwise send debug logs to log.debug
     */
    infoLog(...log) {
        if (this.enablingPlatfromLogging()) {
            this.log.info(String(...log));
        }
    }
    warnLog(...log) {
        if (this.enablingPlatfromLogging()) {
            this.log.warn(String(...log));
        }
    }
    debugWarnLog(...log) {
        if (this.enablingPlatfromLogging()) {
            if (this.platformLogging?.includes('debug')) {
                this.log.warn('[DEBUG]', String(...log));
            }
        }
    }
    errorLog(...log) {
        if (this.enablingPlatfromLogging()) {
            this.log.error(String(...log));
        }
    }
    debugErrorLog(...log) {
        if (this.enablingPlatfromLogging()) {
            if (this.platformLogging?.includes('debug')) {
                this.log.error('[DEBUG]', String(...log));
            }
        }
    }
    debugLog(...log) {
        if (this.enablingPlatfromLogging()) {
            if (this.platformLogging === 'debugMode') {
                this.log.debug(String(...log));
            }
            else if (this.platformLogging === 'debug') {
                this.log.info('[DEBUG]', String(...log));
            }
        }
    }
    enablingPlatfromLogging() {
        return this.platformLogging?.includes('debug') || this.platformLogging === 'standard';
    }
}
exports.SwitchBotPlatform = SwitchBotPlatform;
//# sourceMappingURL=platform.js.map