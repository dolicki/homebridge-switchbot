"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ColorBulb = void 0;
const undici_1 = require("undici");
const utils_1 = require("../utils");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
const settings_1 = require("../settings");
/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
class ColorBulb {
    constructor(platform, accessory, device) {
        this.platform = platform;
        this.accessory = accessory;
        this.device = device;
        // Connection
        this.BLE = this.device.connectionType === "BLE" || this.device.connectionType === "BLE/OpenAPI";
        this.OpenAPI = this.device.connectionType === "OpenAPI" || this.device.connectionType === "BLE/OpenAPI";
        // default placeholders
        this.logs(device);
        this.scan(device);
        this.refreshRate(device);
        this.adaptiveLighting(device);
        this.config(device);
        this.context();
        // this is subject we use to track when we need to POST changes to the SwitchBot API
        this.doColorBulbUpdate = new rxjs_1.Subject();
        this.colorBulbUpdateInProgress = false;
        // Retrieve initial values and updateHomekit
        this.refreshStatus();
        // set accessory information
        accessory
            .getService(this.platform.Service.AccessoryInformation)
            .setCharacteristic(this.platform.Characteristic.Manufacturer, "SwitchBot")
            .setCharacteristic(this.platform.Characteristic.Model, "W1401400")
            .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId)
            .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.FirmwareRevision(accessory, device))
            .getCharacteristic(this.platform.Characteristic.FirmwareRevision)
            .updateValue(this.FirmwareRevision(accessory, device));
        // get the Lightbulb service if it exists, otherwise create a new Lightbulb service
        // you can create multiple services for each accessory
        (this.lightBulbService = accessory.getService(this.platform.Service.Lightbulb) || accessory.addService(this.platform.Service.Lightbulb)),
            `${accessory.displayName} ${device.deviceType}`;
        if (this.adaptiveLightingShift === -1 && this.accessory.context.adaptiveLighting) {
            this.accessory.removeService(this.lightBulbService);
            this.lightBulbService = this.accessory.addService(this.platform.Service.Lightbulb);
            this.accessory.context.adaptiveLighting = false;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} adaptiveLighting: ${this.accessory.context.adaptiveLighting}`);
        }
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
        // handle Brightness events using the Brightness characteristic
        this.lightBulbService
            .getCharacteristic(this.platform.Characteristic.Brightness)
            .setProps({
            minStep: this.minStep(device),
            minValue: 0,
            maxValue: 100,
            validValueRanges: [0, 100],
        })
            .onGet(() => {
            return this.Brightness;
        })
            .onSet(this.BrightnessSet.bind(this));
        // handle ColorTemperature events using the ColorTemperature characteristic
        // this.lightBulbService
        //   .getCharacteristic(this.platform.Characteristic.ColorTemperature)
        //   .setProps({
        //     minValue: 140,
        //     maxValue: 500,
        //     validValueRanges: [140, 500],
        //   })
        //   .onGet(() => {
        //     return this.ColorTemperature!;
        //   })
        //   .onSet(this.ColorTemperatureSet.bind(this));
        // // handle Hue events using the Hue characteristic
        // this.lightBulbService
        //   .getCharacteristic(this.platform.Characteristic.Hue)
        //   .setProps({
        //     minValue: 0,
        //     maxValue: 360,
        //     validValueRanges: [0, 360],
        //   })
        //   .onGet(() => {
        //     return this.Hue;
        //   })
        //   .onSet(this.HueSet.bind(this));
        // // handle Hue events using the Hue characteristic
        // this.lightBulbService
        //   .getCharacteristic(this.platform.Characteristic.Saturation)
        //   .setProps({
        //     minValue: 0,
        //     maxValue: 100,
        //     validValueRanges: [0, 100],
        //   })
        //   .onGet(() => {
        //     return this.Saturation;
        //   })
        //   .onSet(this.SaturationSet.bind(this));
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} adaptiveLightingShift: ${this.adaptiveLightingShift}`);
        if (this.adaptiveLightingShift !== -1) {
            this.AdaptiveLightingController = new platform.api.hap.AdaptiveLightingController(this.lightBulbService, {
                customTemperatureAdjustment: this.adaptiveLightingShift,
            });
            this.accessory.configureController(this.AdaptiveLightingController);
            this.accessory.context.adaptiveLighting = true;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} adaptiveLighting: ${this.accessory.context.adaptiveLighting},` +
                ` adaptiveLightingShift: ${this.adaptiveLightingShift}`);
        }
        // Update Homekit
        this.updateHomeKitCharacteristics();
        // Start an update interval
        (0, rxjs_1.interval)(this.deviceRefreshRate * 1000)
            .pipe((0, operators_1.skipWhile)(() => this.colorBulbUpdateInProgress))
            .subscribe(async () => {
            await this.refreshStatus();
        });
        // Watch for Bulb change events
        // We put in a debounce of 100ms so we don't make duplicate calls
        this.doColorBulbUpdate
            .pipe((0, operators_1.tap)(() => {
            this.colorBulbUpdateInProgress = true;
        }))
            .subscribe(async () => {
            try {
                await this.pushChanges();
            }
            catch (e) {
                this.apiError(e);
                this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed pushChanges with ${this.device.connectionType} Connection,` +
                    ` Error Message: ${JSON.stringify(e.message)}`);
            }
            this.colorBulbUpdateInProgress = false;
        });
    }
    /**
     * Parse the device status from the SwitchBot api
     */
    async parseStatus() {
        if (!this.device.enableCloudService && this.OpenAPI) {
            this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} parseStatus enableCloudService: ${this.device.enableCloudService}`);
        }
        else if (this.BLE) {
            await this.BLEparseStatus();
        }
        else if (this.OpenAPI && this.platform.config.credentials?.token) {
            await this.openAPIparseStatus();
        }
        else {
            await this.offlineOff();
            this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Connection Type:` + ` ${this.device.connectionType}, parseStatus will not happen.`);
        }
    }
    async BLEparseStatus() {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEparseStatus`);
        // State
        switch (this.state) {
            case true:
                this.On = true;
                break;
            default:
                this.On = false;
        }
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);
        // Brightness
        this.Brightness = Number(this.brightnessBLE);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Brightness: ${this.Brightness}`);
        // Color, Hue & Brightness
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} red: ${this.red}`);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} green: ${this.green}`);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} blue: ${this.blue}`);
        const [hue, saturation] = (0, settings_1.rgb2hs)(Number(this.red), Number(this.green), Number(this.blue));
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}` +
            ` hs: ${JSON.stringify((0, settings_1.rgb2hs)(Number(this.red), Number(this.green), Number(this.blue)))}`);
        // Hue
        this.Hue = hue;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Hue: ${this.Hue}`);
        // Saturation
        this.Saturation = saturation;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Saturation: ${this.Saturation}`);
        // ColorTemperature
        if (this.color_temperature) {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE ColorTemperature: ${this.color_temperature}`);
            this.ColorTemperature = this.color_temperature;
            this.ColorTemperature = Math.max(Math.min(this.ColorTemperature, 500), 140);
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ColorTemperature: ${this.ColorTemperature}`);
        }
    }
    async openAPIparseStatus() {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIparseStatus`);
        switch (this.power) {
            case "on":
                this.On = true;
                break;
            default:
                this.On = false;
        }
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);
        // Brightness
        this.Brightness = Number(this.brightness);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Brightness: ${this.Brightness}`);
        // Color, Hue & Brightness
        // if (this.color) {
        //   this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} color: ${JSON.stringify(this.color)}`);
        //   const [red, green, blue] = this.color!.split(":");
        //   this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} red: ${JSON.stringify(red)}`);
        //   this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} green: ${JSON.stringify(green)}`);
        //   this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} blue: ${JSON.stringify(blue)}`);
        //   const [hue, saturation] = rgb2hs(Number(red), Number(green), Number(blue));
        //   this.debugLog(
        //     `${this.device.deviceType}: ${this.accessory.displayName}` + ` hs: ${JSON.stringify(rgb2hs(Number(red), Number(green), Number(blue)))}`,
        //   );
        //   // Hue
        //   this.Hue = hue;
        //   this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Hue: ${this.Hue}`);
        //   // Saturation
        //   this.Saturation = saturation;
        //   this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Saturation: ${this.Saturation}`);
        // }
        // ColorTemperature
        // if (!Number.isNaN(this.colorTemperature)) {
        //   this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} OpenAPI ColorTemperature: ${this.colorTemperature}`);
        //   const mired = Math.round(1000000 / this.colorTemperature!);
        //   this.ColorTemperature = Number(mired);
        //   this.ColorTemperature = Math.max(Math.min(this.ColorTemperature, 500), 140);
        //   this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ColorTemperature: ${this.ColorTemperature}`);
        // }
    }
    /**
     * Asks the SwitchBot API for the latest device information
     */
    async refreshStatus() {
        if (!this.device.enableCloudService && this.OpenAPI) {
            this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} refreshStatus enableCloudService: ${this.device.enableCloudService}`);
        }
        else if (this.BLE) {
            await this.BLERefreshStatus();
        }
        else if (this.OpenAPI && this.platform.config.credentials?.token) {
            //await this.openAPIRefreshStatus();
        }
        else {
            await this.offlineOff();
            this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Connection Type:` +
                ` ${this.device.connectionType}, refreshStatus will not happen.`);
        }
    }
    async BLERefreshStatus() {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLERefreshStatus`);
        const switchbot = await this.platform.connectBLE();
        // Convert to BLE Address
        this.device.bleMac = this.device
            .deviceId.match(/.{1,2}/g)
            .join(":")
            .toLowerCase();
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
        this.getCustomBLEAddress(switchbot);
        // Start to monitor advertisement packets
        if (switchbot !== false) {
            switchbot
                .startScan({
                model: "u",
                id: this.device.bleMac,
            })
                .then(async () => {
                // Set an event hander
                switchbot.onadvertisement = async (ad) => {
                    this.address = ad.address;
                    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Config BLE Address: ${this.device.bleMac},` +
                        ` BLE Address Found: ${this.address}`);
                    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
                    this.serviceData = ad.serviceData;
                    this.powerState = ad.serviceData.power;
                    this.state = ad.serviceData.state;
                    this.red = ad.serviceData.red;
                    this.green = ad.serviceData.green;
                    this.blue = ad.serviceData.blue;
                    this.color_temperature = ad.serviceData.color_temperature;
                    this.brightnessBLE = ad.serviceData.brightness;
                    this.delay = ad.serviceData.delay;
                    this.preset = ad.serviceData.preset;
                    this.color_mode = ad.serviceData.color_mode;
                    this.speed = ad.serviceData.speed;
                    this.loop_index = ad.serviceData.loop_index;
                    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
                    /*this.debugLog(
                      `${this.device.deviceType}: ${this.accessory.displayName} state: ${ad.serviceData.state}, ` +
                        `delay: ${ad.serviceData.delay}, timer: ${ad.serviceData.timer}, syncUtcTime: ${ad.serviceData.syncUtcTime} ` +
                        `wifiRssi: ${ad.serviceData.wifiRssi}, overload: ${ad.serviceData.overload}, currentPower: ${ad.serviceData.currentPower}`,
                    );*/
                    if (this.serviceData) {
                        this.connected = true;
                        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} connected: ${this.connected}`);
                        await this.stopScanning(switchbot);
                    }
                    else {
                        this.connected = false;
                        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} connected: ${this.connected}`);
                    }
                };
                // Wait
                return await (0, utils_1.sleep)(this.scanDuration * 1000);
            })
                .then(async () => {
                // Stop to monitor
                await this.stopScanning(switchbot);
            })
                .catch(async (e) => {
                this.apiError(e);
                this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed BLERefreshStatus with ${this.device.connectionType}` +
                    ` Connection, Error Message: ${JSON.stringify(e.message)}`);
                await this.BLERefreshConnection(switchbot);
            });
        }
        else {
            await this.BLERefreshConnection(switchbot);
        }
    }
    async openAPIRefreshStatus() {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIRefreshStatus`);
        try {
            const { body, statusCode, headers } = await (0, undici_1.request)(`${settings_1.Devices}/${this.device.deviceId}/status`, {
                headers: this.platform.generateHeaders(),
            });
            const deviceStatus = await body.json();
            //this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Devices: ${JSON.stringify(deviceStatus.body)}`);
            this.statusCode(statusCode);
            //this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Headers: ${JSON.stringify(headers)}`);
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} refreshStatus: ${JSON.stringify(deviceStatus)}`);
            this.power = deviceStatus.body.power;
            this.color = deviceStatus.body.color;
            this.brightness = deviceStatus.body.brightness;
            this.colorTemperature = deviceStatus.body.colorTemperature;
            await this.openAPIparseStatus();
            await this.updateHomeKitCharacteristics();
        }
        catch (e) {
            this.apiError(e);
            this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed openAPIRefreshStatus with ${this.device.connectionType}` +
                ` Connection, Error Message: ${JSON.stringify(e.message)}`);
        }
    }
    /**
     * Pushes the requested changes to the SwitchBot API
     * deviceType	      commandType	          Command	               command parameter	                     Description
     * Color Bulb   -    "command"            "turnOff"                  "default"	              =        set to OFF state
     * Color Bulb   -    "command"            "turnOn"                   "default"	              =        set to ON state
     * Color Bulb   -    "command"            "toggle"                   "default"	              =        toggle state
     * Color Bulb   -    "command"         "setBrightness"	             "{1-100}"	              =        set brightness
     * Color Bulb   -    "command"           "setColor"	         "{0-255}:{0-255}:{0-255}"	      =        set RGB color value
     * Color Bulb   -    "command"     "setColorTemperature"	         "{2700-6500}"	            =        set color temperature
     *
     */
    async pushChanges() {
        if (!this.device.enableCloudService && this.OpenAPI) {
            this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} pushChanges enableCloudService: ${this.device.enableCloudService}`);
        } /* if (this.BLE) {
          await this.BLEpushChanges();
        } else*/
        else if (this.OpenAPI && this.platform.config.credentials?.token) {
            //await this.openAPIpushChanges();
        }
        else {
            await this.offlineOff();
            this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Connection Type:` + ` ${this.device.connectionType}, pushChanges will not happen.`);
        }
        // Refresh the status from the API
        (0, rxjs_1.interval)(15000)
            .pipe((0, operators_1.skipWhile)(() => this.colorBulbUpdateInProgress))
            .pipe((0, operators_1.take)(1))
            .subscribe(async () => {
            //await this.refreshStatus();
        });
    }
    async BLEpushChanges() {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEpushChanges`);
        if (this.On !== this.accessory.context.On) {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEpushChanges On: ${this.On} OnCached: ${this.accessory.context.On}`);
            const switchbot = await this.platform.connectBLE();
            // Convert to BLE Address
            this.device.bleMac = this.device
                .deviceId.match(/.{1,2}/g)
                .join(":")
                .toLowerCase();
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
            switchbot
                .discover({
                model: "u",
                id: this.device.bleMac,
            })
                .then(async (device_list) => {
                this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);
                return await this.retry({
                    max: this.maxRetry(),
                    fn: async () => {
                        if (this.On) {
                            return await device_list[0].turnOn({ id: this.device.bleMac });
                        }
                        else {
                            return await device_list[0].turnOff({ id: this.device.bleMac });
                        }
                    },
                });
            })
                .then(() => {
                this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Done.`);
                this.On = false;
            })
                .catch(async (e) => {
                this.apiError(e);
                this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed BLEpushChanges with ${this.device.connectionType}` +
                    ` Connection, Error Message: ${JSON.stringify(e.message)}`);
                await this.BLEPushConnection();
            });
            // Push Brightness Update
            if (this.On) {
                await this.BLEpushBrightnessChanges();
            }
            // Push ColorTemperature Update
            if (this.On) {
                await this.BLEpushColorTemperatureChanges();
            }
            // Push Hue & Saturation Update
            if (this.On) {
                await this.BLEpushRGBChanges();
            }
        }
        else {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No BLEpushChanges.` + `On: ${this.On}, ` + `OnCached: ${this.accessory.context.On}`);
        }
    }
    async BLEpushBrightnessChanges() {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEpushBrightnessChanges`);
        if (this.Brightness !== this.accessory.context.Brightness) {
            const switchbot = await this.platform.connectBLE();
            // Convert to BLE Address
            this.device.bleMac = this.device
                .deviceId.match(/.{1,2}/g)
                .join(":")
                .toLowerCase();
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
            switchbot
                .discover({
                model: "u",
                id: this.device.bleMac,
            })
                .then(async (device_list) => {
                this.infoLog(`${this.accessory.displayName} Target Brightness: ${this.Brightness}`);
                return await device_list[0].setBrightness(this.Brightness);
            })
                .then(() => {
                this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Done.`);
                this.On = false;
            })
                .catch(async (e) => {
                this.apiError(e);
                this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed BLEpushBrightnessChanges with ${this.device.connectionType}` +
                    ` Connection, Error Message: ${JSON.stringify(e.message)}`);
                await this.BLEPushConnection();
            });
        }
        else {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No BLEpushBrightnessChanges.` +
                `Brightness: ${this.Brightness}, ` +
                `BrightnessCached: ${this.accessory.context.Brightness}`);
        }
    }
    async BLEpushColorTemperatureChanges() {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEpushColorTemperatureChanges`);
        if (this.ColorTemperature !== this.accessory.context.ColorTemperature) {
            const switchbot = await this.platform.connectBLE();
            // Convert to BLE Address
            this.device.bleMac = this.device
                .deviceId.match(/.{1,2}/g)
                .join(":")
                .toLowerCase();
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
            switchbot
                .discover({
                model: "u",
                id: this.device.bleMac,
            })
                .then(async (device_list) => {
                this.infoLog(`${this.accessory.displayName} Target ColorTemperature: ${this.ColorTemperature}`);
                return await device_list[0].setColorTemperature(this.ColorTemperature);
            })
                .then(() => {
                this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Done.`);
                this.On = false;
            })
                .catch(async (e) => {
                this.apiError(e);
                this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed BLEpushColorTemperatureChanges with ` +
                    `${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`);
                await this.BLEPushConnection();
            });
        }
        else {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No BLEpushColorTemperatureChanges.` +
                `ColorTemperature: ${this.ColorTemperature}, ColorTemperatureCached: ${this.accessory.context.ColorTemperature}`);
        }
    }
    async BLEpushRGBChanges() {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEpushRGBChanges`);
        if (this.Hue !== this.accessory.context.Hue || this.Saturation !== this.accessory.context.Saturation) {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Hue: ${JSON.stringify(this.Hue)}`);
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Saturation: ${JSON.stringify(this.Saturation)}`);
            const [red, green, blue] = (0, settings_1.hs2rgb)(Number(this.Hue), Number(this.Saturation));
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} rgb: ${JSON.stringify([red, green, blue])}`);
            const switchbot = await this.platform.connectBLE();
            // Convert to BLE Address
            this.device.bleMac = this.device
                .deviceId.match(/.{1,2}/g)
                .join(":")
                .toLowerCase();
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
            switchbot
                .discover({
                model: "u",
                id: this.device.bleMac,
            })
                .then(async (device_list) => {
                this.infoLog(`${this.accessory.displayName} Target RGB: ${(this.Brightness, red, green, blue)}`);
                return await device_list[0].setRGB(this.Brightness, red, green, blue);
            })
                .then(() => {
                this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Done.`);
                this.On = false;
            })
                .catch(async (e) => {
                this.apiError(e);
                this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed BLEpushRGBChanges with ${this.device.connectionType}` +
                    ` Connection, Error Message: ${JSON.stringify(e.message)}`);
                await this.BLEPushConnection();
            });
        }
        else {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No BLEpushRGBChanges. Hue: ${this.Hue}, ` +
                `HueCached: ${this.accessory.context.Hue}, Saturation: ${this.Saturation}, SaturationCached: ${this.accessory.context.Saturation}`);
        }
    }
    async openAPIpushChanges() {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIpushChanges`);
        // if (this.On !== this.accessory.context.On) {
        //await this.pushOnOffCommand();
        // } else {
        //   this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No openAPIpushChanges.` + `On: ${this.On}, `
        //     + `OnCached: ${this.accessory.context.On}`);
        // }
        // Push Hue & Saturation Update
        if (this.On) {
            // await this.pushHueSaturationChanges();
        }
        // Push ColorTemperature Update
        if (this.On) {
            // await this.pushColorTemperatureChanges();
        }
        // Push Brightness Update
        if (this.On) {
            //await this.pushBrightnessChanges();
        }
    }
    async pushOnOffCommand(value) {
        if (this.On == value) {
            return;
        }
        let command = "";
        if (this.On) {
            command = "turnOn";
        }
        else {
            command = "turnOff";
        }
        this.On = value;
        const bodyChange = JSON.stringify({
            command: `${command}`,
            parameter: "default",
            commandType: "command",
        });
        //this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Sending request to SwitchBot API, body: ${bodyChange},`);
        //this.debugLog("Goran: ligthbulb");
        try {
            const { body, statusCode, headers } = await (0, undici_1.request)(`${settings_1.Devices}/${this.device.deviceId}/commands`, {
                body: bodyChange,
                method: "POST",
                headers: this.platform.generateHeaders(),
            });
            const deviceStatus = await body.json();
            //this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Devices: ${JSON.stringify(deviceStatus.body)}`);
            this.statusCode(statusCode);
            //this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Headers: ${JSON.stringify(headers)}`);
        }
        catch (e) {
            this.apiError(e);
            this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed openAPIpushChanges with ${this.device.connectionType}` +
                ` Connection, Error Message: ${JSON.stringify(e.message)}`);
        }
    }
    async pushHueSaturationChanges() {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} pushHueSaturationChanges`);
        // if (this.Hue !== this.accessory.context.Hue || this.Saturation !== this.accessory.context.Saturation) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Hue: ${JSON.stringify(this.Hue)}`);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Saturation: ${JSON.stringify(this.Saturation)}`);
        const [red, green, blue] = (0, settings_1.hs2rgb)(Number(this.Hue), Number(this.Saturation));
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} rgb: ${JSON.stringify([red, green, blue])}`);
        const bodyChange = JSON.stringify({
            command: "setColor",
            parameter: `${red}:${green}:${blue}`,
            commandType: "command",
        });
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Sending request to SwitchBot API, body: ${bodyChange},`);
        try {
            const { body, statusCode, headers } = await (0, undici_1.request)(`${settings_1.Devices}/${this.device.deviceId}/commands`, {
                body: bodyChange,
                method: "POST",
                headers: this.platform.generateHeaders(),
            });
            const deviceStatus = await body.json();
            this.debugLog(`Devices: ${JSON.stringify(deviceStatus.body)}`);
            this.statusCode(statusCode);
            this.debugLog(`Headers: ${JSON.stringify(headers)}`);
        }
        catch (e) {
            this.apiError(e);
            this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed pushHueSaturationChanges with ${this.device.connectionType}` +
                ` Connection, Error Message: ${JSON.stringify(e.message)}`);
        }
        // } else {
        //   this.debugLog(
        //     `${this.device.deviceType}: ${this.accessory.displayName} No pushHueSaturationChanges. Hue: ${this.Hue}, ` +
        //       `HueCached: ${this.accessory.context.Hue}, Saturation: ${this.Saturation}, SaturationCached: ${this.accessory.context.Saturation}`,
        //   );
        // }
    }
    async pushColorTemperatureChanges() {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} pushColorTemperatureChanges`);
        // if (this.ColorTemperature !== this.accessory.context.ColorTemperature) {
        const kelvin = Math.round(1000000 / Number(this.ColorTemperature));
        this.cacheKelvin = kelvin;
        const bodyChange = JSON.stringify({
            command: "setColorTemperature",
            parameter: `${kelvin}`,
            commandType: "command",
        });
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Sending request to SwitchBot API, body: ${bodyChange},`);
        try {
            const { body, statusCode, headers } = await (0, undici_1.request)(`${settings_1.Devices}/${this.device.deviceId}/commands`, {
                body: bodyChange,
                method: "POST",
                headers: this.platform.generateHeaders(),
            });
            const deviceStatus = await body.json();
            this.debugLog(`Devices: ${JSON.stringify(deviceStatus.body)}`);
            this.statusCode(statusCode);
            this.debugLog(`Headers: ${JSON.stringify(headers)}`);
        }
        catch (e) {
            this.apiError(e);
            this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed pushColorTemperatureChanges with ${this.device.connectionType}` +
                ` Connection, Error Message: ${JSON.stringify(e.message)}`);
        }
        // } else {
        //   this.debugLog(
        //     `${this.device.deviceType}: ${this.accessory.displayName} No pushColorTemperatureChanges.` +
        //       `ColorTemperature: ${this.ColorTemperature}, ColorTemperatureCached: ${this.accessory.context.ColorTemperature}`,
        //   );
        // }
    }
    async pushBrightnessChanges() {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} pushBrightnessChanges`);
        if (this.Brightness !== this.accessory.context.Brightness) {
            const bodyChange = JSON.stringify({
                command: "setBrightness",
                parameter: `${this.Brightness}`,
                commandType: "command",
            });
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Sending request to SwitchBot API, body: ${bodyChange},`);
            try {
                const { body, statusCode, headers } = await (0, undici_1.request)(`${settings_1.Devices}/${this.device.deviceId}/commands`, {
                    body: bodyChange,
                    method: "POST",
                    headers: this.platform.generateHeaders(),
                });
                const deviceStatus = await body.json();
                this.debugLog(`Devices: ${JSON.stringify(deviceStatus.body)}`);
                this.statusCode(statusCode);
                this.debugLog(`Headers: ${JSON.stringify(headers)}`);
            }
            catch (e) {
                this.apiError(e);
                this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed pushBrightnessChanges with ${this.device.connectionType}` +
                    ` Connection, Error Message: ${JSON.stringify(e.message)}`);
            }
        }
        else {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No pushBrightnessChanges.` +
                `Brightness: ${this.Brightness}, ` +
                `BrightnessCached: ${this.accessory.context.Brightness}`);
        }
    }
    /**
     * Handle requests to set the value of the "On" characteristic
     */
    async OnSet(value) {
        if (this.On === this.accessory.context.On) {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No Changes, Set On: ${value}`);
        }
        else {
            this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set On: ${value}`);
        }
        this.On = value;
        await this.pushOnOffCommand(value);
        //this.doColorBulbUpdate.next();
    }
    /**
     * Handle requests to set the value of the "Brightness" characteristic
     */
    async BrightnessSet(value) {
        if (this.Brightness === this.accessory.context.Brightness) {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No Changes, Set Brightness: ${value}`);
        }
        else if (this.On) {
            this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set Brightness: ${value}`);
        }
        else {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Set Brightness: ${value}`);
        }
        this.Brightness = value;
        await this.pushBrightnessChanges();
        //this.doColorBulbUpdate.next();
    }
    /**
     * Handle requests to set the value of the "ColorTemperature" characteristic
     */
    async ColorTemperatureSet(value) {
        if (this.ColorTemperature === this.accessory.context.ColorTemperature) {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No Changes, Set ColorTemperature: ${value}`);
        }
        else if (this.On) {
            this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set ColorTemperature: ${value}`);
        }
        else {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Set ColorTemperature: ${value}`);
        }
        // Convert mired to kelvin to nearest 100 (SwitchBot seems to need this)
        const kelvin = Math.round(1000000 / Number(value) / 100) * 100;
        // Check and increase/decrease kelvin to range of device
        const k = Math.min(Math.max(kelvin, this.minKelvin), this.maxKelvin);
        if (!this.accessory.context.On || this.cacheKelvin === k) {
            return;
        }
        // Updating the hue/sat to the corresponding values mimics native adaptive lighting
        const hs = (0, settings_1.m2hs)(value);
        this.lightBulbService.updateCharacteristic(this.platform.Characteristic.Hue, hs[0]);
        this.lightBulbService.updateCharacteristic(this.platform.Characteristic.Saturation, hs[1]);
        this.ColorTemperature = value;
        //this.doColorBulbUpdate.next();
    }
    /**
     * Handle requests to set the value of the "Hue" characteristic
     */
    async HueSet(value) {
        if (this.Hue === this.accessory.context.Hue) {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No Changes, Set Hue: ${value}`);
        }
        else if (this.On) {
            this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set Hue: ${value}`);
        }
        else {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Set Hue: ${value}`);
        }
        this.lightBulbService.updateCharacteristic(this.platform.Characteristic.ColorTemperature, 140);
        this.Hue = value;
        //this.doColorBulbUpdate.next();
    }
    /**
     * Handle requests to set the value of the "Saturation" characteristic
     */
    async SaturationSet(value) {
        if (this.Saturation === this.accessory.context.Saturation) {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No Changes, Set Saturation: ${value}`);
        }
        else if (this.On) {
            this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set Saturation: ${value}`);
        }
        else {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Set Saturation: ${value}`);
        }
        this.lightBulbService.updateCharacteristic(this.platform.Characteristic.ColorTemperature, 140);
        this.Saturation = value;
        //this.doColorBulbUpdate.next();
    }
    async updateHomeKitCharacteristics() {
        if (this.On === undefined) {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} On: ${this.On}`);
        }
        else {
            this.accessory.context.On = this.On;
            this.lightBulbService.updateCharacteristic(this.platform.Characteristic.On, this.On);
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic On: ${this.On}`);
        }
        if (this.Brightness === undefined) {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Brightness: ${this.Brightness}`);
        }
        else {
            this.accessory.context.Brightness = this.Brightness;
            this.lightBulbService.updateCharacteristic(this.platform.Characteristic.Brightness, this.Brightness);
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic Brightness: ${this.Brightness}`);
        }
        // if (this.ColorTemperature === undefined) {
        //   this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ColorTemperature: ${this.ColorTemperature}`);
        // } else {
        //   this.accessory.context.ColorTemperature = this.ColorTemperature;
        //   this.lightBulbService.updateCharacteristic(this.platform.Characteristic.ColorTemperature, this.ColorTemperature);
        //   this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic ColorTemperature: ${this.ColorTemperature}`);
        // }
        // if (this.Hue === undefined) {
        //   this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Hue: ${this.Hue}`);
        // } else {
        //   this.accessory.context.Hue = this.Hue;
        //   this.lightBulbService.updateCharacteristic(this.platform.Characteristic.Hue, this.Hue);
        //   this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic Hue: ${this.Hue}`);
        // }
        // if (this.Saturation === undefined) {
        //   this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Saturation: ${this.Saturation}`);
        // } else {
        //   this.accessory.context.Saturation = this.Saturation;
        //   this.lightBulbService.updateCharacteristic(this.platform.Characteristic.Saturation, this.Saturation);
        //   this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic Saturation: ${this.Saturation}`);
        // }
    }
    async adaptiveLighting(device) {
        // if (device.colorbulb?.adaptiveLightingShift) {
        //   this.adaptiveLightingShift = device.colorbulb.adaptiveLightingShift;
        //   this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} adaptiveLightingShift: ${this.adaptiveLightingShift}`);
        // } else {
        //   this.adaptiveLightingShift = 0;
        //   this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} adaptiveLightingShift: ${this.adaptiveLightingShift}`);
        // }
        this.adaptiveLightingShift = 0;
    }
    async stopScanning(switchbot) {
        switchbot.stopScan();
        if (this.connected) {
            await this.BLEparseStatus();
            await this.updateHomeKitCharacteristics();
        }
        else {
            await this.BLERefreshConnection(switchbot);
        }
    }
    async getCustomBLEAddress(switchbot) {
        if (this.device.customBLEaddress && this.deviceLogging.includes("debug")) {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} customBLEaddress: ${this.device.customBLEaddress}`);
            (async () => {
                // Start to monitor advertisement packets
                await switchbot.startScan({
                    model: "u",
                });
                // Set an event handler
                switchbot.onadvertisement = (ad) => {
                    this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} ad: ${JSON.stringify(ad, null, "  ")}`);
                };
                await (0, utils_1.sleep)(10000);
                // Stop to monitor
                switchbot.stopScan();
            })();
        }
    }
    async BLEPushConnection() {
        if (this.platform.config.credentials?.token && this.device.connectionType === "BLE/OpenAPI") {
            this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} Using OpenAPI Connection to Push Changes`);
            await this.openAPIpushChanges();
        }
    }
    async BLERefreshConnection(switchbot) {
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} wasn't able to establish BLE Connection, node-switchbot: ${switchbot}`);
        if (this.platform.config.credentials?.token && this.device.connectionType === "BLE/OpenAPI") {
            this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} Using OpenAPI Connection to Refresh Status`);
            await this.openAPIRefreshStatus();
        }
    }
    async retry({ max, fn }) {
        return fn().catch(async (e) => {
            if (max === 0) {
                throw e;
            }
            this.infoLog(e);
            this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Retrying`);
            await (0, utils_1.sleep)(1000);
            return this.retry({ max: max - 1, fn });
        });
    }
    maxRetry() {
        if (this.device.maxRetry) {
            return this.device.maxRetry;
        }
        else {
            return 5;
        }
    }
    minStep(device) {
        if (device.colorbulb?.set_minStep) {
            this.set_minStep = device.colorbulb?.set_minStep;
        }
        else {
            this.set_minStep = 1;
        }
        return this.set_minStep;
    }
    async scan(device) {
        if (device.scanDuration) {
            this.scanDuration = this.accessory.context.scanDuration = device.scanDuration;
            if (this.BLE) {
                this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Config scanDuration: ${this.scanDuration}`);
            }
        }
        else {
            this.scanDuration = this.accessory.context.scanDuration = 1;
            if (this.BLE) {
                this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Default scanDuration: ${this.scanDuration}`);
            }
        }
    }
    async statusCode(statusCode) {
        switch (statusCode) {
            case 151:
                this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Command not supported by this deviceType, statusCode: ${statusCode}`);
                break;
            case 152:
                this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Device not found, statusCode: ${statusCode}`);
                break;
            case 160:
                this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Command is not supported, statusCode: ${statusCode}`);
                break;
            case 161:
                this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Device is offline, statusCode: ${statusCode}`);
                this.offlineOff();
                break;
            case 171:
                this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Hub Device is offline, statusCode: ${statusCode}. ` +
                    `Hub: ${this.device.hubDeviceId}`);
                this.offlineOff();
                break;
            case 190:
                this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Device internal error due to device states not synchronized with server,` +
                    ` Or command format is invalid, statusCode: ${statusCode}`);
                break;
            case 100:
                this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Command successfully sent, statusCode: ${statusCode}`);
                break;
            case 200:
                this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Request successful, statusCode: ${statusCode}`);
                break;
            default:
                this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Unknown statusCode: ` +
                    `${statusCode}, Submit Bugs Here: ' + 'https://tinyurl.com/SwitchBotBug`);
        }
    }
    async offlineOff() {
        if (this.device.offline) {
            await this.context();
            await this.updateHomeKitCharacteristics();
        }
    }
    apiError(e) {
        this.lightBulbService.updateCharacteristic(this.platform.Characteristic.On, e);
        this.lightBulbService.updateCharacteristic(this.platform.Characteristic.Hue, e);
        this.lightBulbService.updateCharacteristic(this.platform.Characteristic.Brightness, e);
        this.lightBulbService.updateCharacteristic(this.platform.Characteristic.Saturation, e);
        this.lightBulbService.updateCharacteristic(this.platform.Characteristic.ColorTemperature, e);
    }
    FirmwareRevision(accessory, device) {
        let FirmwareRevision;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}` + ` accessory.context.FirmwareRevision: ${accessory.context.FirmwareRevision}`);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} device.firmware: ${device.firmware}`);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} this.platform.version: ${this.platform.version}`);
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
        if (this.Hue === undefined) {
            this.Hue = 0;
        }
        else {
            this.Hue = this.accessory.context.Hue;
        }
        if (this.Brightness === undefined) {
            this.Brightness = 0;
        }
        else {
            this.Brightness = this.accessory.context.Brightness;
        }
        if (this.Brightness === undefined) {
            this.Saturation = 0;
        }
        else {
            this.Saturation = this.accessory.context.Saturation;
        }
        if (this.ColorTemperature === undefined) {
            this.ColorTemperature = 140;
        }
        else {
            this.ColorTemperature = this.accessory.context.ColorTemperature;
        }
        this.minKelvin = 2000;
        this.maxKelvin = 9000;
    }
    async refreshRate(device) {
        if (device.refreshRate) {
            this.deviceRefreshRate = this.accessory.context.refreshRate = device.refreshRate;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Config refreshRate: ${this.deviceRefreshRate}`);
        }
        else if (this.platform.config.options.refreshRate) {
            this.deviceRefreshRate = this.accessory.context.refreshRate = this.platform.config.options.refreshRate;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Platform Config refreshRate: ${this.deviceRefreshRate}`);
        }
    }
    async config(device) {
        let config = {};
        if (device.colorbulb) {
            config = device.colorbulb;
        }
        if (device.connectionType !== undefined) {
            config["connectionType"] = device.connectionType;
        }
        if (device.external !== undefined) {
            config["external"] = device.external;
        }
        if (device.logging !== undefined) {
            config["logging"] = device.logging;
        }
        if (device.refreshRate !== undefined) {
            config["refreshRate"] = device.refreshRate;
        }
        if (device.scanDuration !== undefined) {
            config["scanDuration"] = device.scanDuration;
        }
        if (device.offline !== undefined) {
            config["offline"] = device.offline;
        }
        if (device.maxRetry !== undefined) {
            config["maxRetry"] = device.maxRetry;
        }
        if (Object.entries(config).length !== 0) {
            this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Config: ${JSON.stringify(config)}`);
        }
    }
    async logs(device) {
        if (this.platform.debugMode) {
            this.deviceLogging = this.accessory.context.logging = "debugMode";
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Debug Mode Logging: ${this.deviceLogging}`);
        }
        else if (device.logging) {
            this.deviceLogging = this.accessory.context.logging = device.logging;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Config Logging: ${this.deviceLogging}`);
        }
        else if (this.platform.config.options?.logging) {
            this.deviceLogging = this.accessory.context.logging = this.platform.config.options?.logging;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Platform Config Logging: ${this.deviceLogging}`);
        }
        else {
            this.deviceLogging = this.accessory.context.logging = "standard";
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Logging Not Set, Using: ${this.deviceLogging}`);
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
            if (this.deviceLogging?.includes("debug")) {
                this.platform.log.warn("[DEBUG]", String(...log));
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
            if (this.deviceLogging?.includes("debug")) {
                this.platform.log.error("[DEBUG]", String(...log));
            }
        }
    }
    debugLog(...log) {
        if (this.enablingDeviceLogging()) {
            if (this.deviceLogging === "debug") {
                this.platform.log.info("[DEBUG]", String(...log));
            }
            else {
                this.platform.log.debug(String(...log));
            }
        }
    }
    enablingDeviceLogging() {
        return this.deviceLogging.includes("debug") || this.deviceLogging === "standard";
    }
}
exports.ColorBulb = ColorBulb;
//# sourceMappingURL=colorbulb.js.map