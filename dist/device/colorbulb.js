"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ColorBulb = void 0;
const undici_1 = require("undici");
const utils_1 = require("../utils");
const rxjs_1 = require("rxjs");
const settings_1 = require("../settings");
const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};
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
        this.lastApiUpdate = Date.now() - 45 * 1000; //so we dont have to wait 30s for the first refresh
        // Connection
        this.BLE = this.device.connectionType === "BLE" || this.device.connectionType === "BLE/OpenAPI";
        this.OpenAPI = this.device.connectionType === "OpenAPI" || this.device.connectionType === "BLE/OpenAPI";
        /**
         * Handle requests to set the value of the "Brightness" characteristic
         */
        this.brightnessDebounceHandler = debounce(this.brightnessSetDebounceWrapper.bind(this), 375);
        /**
         * Handle requests to set the value of the "Hue" characteristic
         */
        this.hueAndSaturationDebounceHandler = debounce(this.hueAndSaturationSetDebounceWrapper.bind(this), 200);
        // default placeholders
        this.init(device, accessory, platform);
    }
    async init(device, accessory, platform) {
        await this.logs(device);
        await this.refreshRate(device);
        await this.adaptiveLighting(device);
        await this.config(device);
        await this.context();
        // this is subject we use to track when we need to POST changes to the SwitchBot API
        this.doColorBulbUpdate = new rxjs_1.Subject();
        this.colorBulbUpdateInProgress = false;
        // Retrieve initial values and updateHomekit
        //this.refreshStatus();
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
        await this.openAPIRefreshStatus();
        setInterval(() => {
            this.openAPIRefreshStatus();
        }, 5 * 60 * 1000);
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
        this.lightBulbService
            .getCharacteristic(this.platform.Characteristic.On)
            .onGet(async () => {
            this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Get Bulb Status: ${this.On}`);
            await this.openAPIRefreshStatus();
            await this.updateHomeKitCharacteristics();
            return this.On;
        })
            .onSet(this.OnSet.bind(this));
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
            this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Get Brightness Status: ${this.Brightness}`);
            return this.Brightness;
        })
            .onSet(this.BrightnessSet.bind(this));
        // handle ColorTemperature events using the ColorTemperature characteristic
        this.lightBulbService
            .getCharacteristic(this.platform.Characteristic.ColorTemperature)
            .setProps({
            minValue: 140,
            maxValue: 500,
            validValueRanges: [140, 500],
        })
            .onGet(() => {
            return this.ColorTemperature;
        })
            .onSet(this.ColorTemperatureSet.bind(this));
        // handle Hue events using the Hue characteristic
        this.lightBulbService
            .getCharacteristic(this.platform.Characteristic.Hue)
            .setProps({
            minValue: 0,
            maxValue: 360,
            validValueRanges: [0, 360],
        })
            .onGet(() => {
            return this.Hue;
        })
            .onSet(this.HueSet.bind(this));
        // handle Hue events using the Hue characteristic
        this.lightBulbService
            .getCharacteristic(this.platform.Characteristic.Saturation)
            .setProps({
            minValue: 0,
            maxValue: 100,
            validValueRanges: [0, 100],
        })
            .onGet(() => {
            return this.Saturation;
        })
            .onSet(this.SaturationSet.bind(this));
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
        if (this.color) {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} color: ${JSON.stringify(this.color)}`);
            const [red, green, blue] = this.color.split(":");
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} red: ${JSON.stringify(red)}`);
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} green: ${JSON.stringify(green)}`);
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} blue: ${JSON.stringify(blue)}`);
            const [hue, saturation] = (0, settings_1.rgb2hs)(Number(red), Number(green), Number(blue));
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}` + ` hs: ${JSON.stringify((0, settings_1.rgb2hs)(Number(red), Number(green), Number(blue)))}`);
            // Hue
            this.Hue = hue;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Hue: ${this.Hue}`);
            // Saturation
            this.Saturation = saturation;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Saturation: ${this.Saturation}`);
        }
        // ColorTemperature
        // if (!Number.isNaN(this.colorTemperature)) {
        //   this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} OpenAPI ColorTemperature: ${this.colorTemperature}`);
        //   const mired = Math.round(1000000 / this.colorTemperature!);
        //   this.ColorTemperature = Number(mired);
        //   this.ColorTemperature = Math.max(Math.min(this.ColorTemperature, 500), 140);
        //   this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ColorTemperature: ${this.ColorTemperature}`);
        // }
    }
    async openAPIRefreshStatus() {
        if (Date.now() - this.lastApiUpdate < 60000) {
            return;
        }
        this.lastApiUpdate = Date.now();
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIRefreshStatus`);
        try {
            const { body, statusCode, headers } = await (0, undici_1.request)(`${settings_1.Devices}/${this.device.deviceId}/status`, {
                headers: this.platform.generateHeaders(),
            });
            const deviceStatus = await body.json();
            //this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Devices: ${JSON.stringify(deviceStatus.body)}`);
            this.statusCode(statusCode);
            //this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Headers: ${JSON.stringify(headers)}`);
            this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} refreshStatus: ${JSON.stringify(deviceStatus)}`);
            this.power = deviceStatus.body.power;
            this.color = deviceStatus.body.color;
            this.brightness = deviceStatus.body.brightness;
            this.colorTemperature = deviceStatus.body.colorTemperature;
            await this.openAPIparseStatus();
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
    async pushOnOffCommand(value) {
        this.debugLog(`this.On: ${this.On} == value: ${value}`);
        if (this.On == value) {
            return;
        }
        let command = "";
        if (value) {
            command = "turnOn";
        }
        else {
            command = "turnOff";
        }
        const bodyChange = JSON.stringify({
            command: `${command}`,
            parameter: "default",
            commandType: "command",
        });
        //this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Sending request to SwitchBot API, body: ${bodyChange},`);
        try {
            const { body, statusCode, headers } = await (0, undici_1.request)(`${settings_1.Devices}/${this.device.deviceId}/commands`, {
                body: bodyChange,
                method: "POST",
                headers: this.platform.generateHeaders(),
            });
            const deviceStatus = await body.json();
            //this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Devices: ${JSON.stringify(deviceStatus.body)}`);
            this.statusCode(statusCode);
            this.On = value;
            //this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Headers: ${JSON.stringify(headers)}`);
        }
        catch (e) {
            this.apiError(e);
            this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed openAPIpushChanges with ${this.device.connectionType}` +
                ` Connection, Error Message: ${JSON.stringify(e.message)}`);
        }
    }
    async pushHueSaturationChanges() {
        return;
        this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} pushHueSaturationChanges`);
        // if (this.Hue !== this.accessory.context.Hue || this.Saturation !== this.accessory.context.Saturation) {
        //this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Hue: ${JSON.stringify(this.Hue)}`);
        //this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Saturation: ${JSON.stringify(this.Saturation)}`);
        const [red, green, blue] = (0, settings_1.hs2rgb)(Number(this.Hue), Number(this.Saturation));
        this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} rgb: ${JSON.stringify([red, green, blue])}`);
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
            //this.debugLog(`Devices: ${JSON.stringify(deviceStatus.body)}`);
            this.statusCode(statusCode);
            //this.debugLog(`Headers: ${JSON.stringify(headers)}`);
        }
        catch (e) {
            this.apiError(e);
            this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed pushHueSaturationChanges with ${this.device.connectionType}` +
                ` Connection, Error Message: ${JSON.stringify(e.message)}`);
        }
    }
    async pushColorTemperatureChanges() {
        return;
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
    async pushBrightnessChanges(value) {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} pushBrightnessChanges`);
        this.debugLog(`this.Brightness: ${this.Brightness} == value: ${value}`);
        if (this.Brightness == value) {
            return;
        }
        const bodyChange = JSON.stringify({
            command: "setBrightness",
            parameter: `${value}`,
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
            // this.debugLog(`Devices: ${JSON.stringify(deviceStatus.body)}`);
            this.statusCode(statusCode);
            // this.debugLog(`Headers: ${JSON.stringify(headers)}`);
            this.Brightness = value;
        }
        catch (e) {
            this.apiError(e);
            this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed pushBrightnessChanges with ${this.device.connectionType}` +
                ` Connection, Error Message: ${JSON.stringify(e.message)}`);
        }
    }
    /**
     * Handle requests to set the value of the "On" characteristic
     */
    async OnSet(value) {
        this.infoLog(`OnSet - value: ${value}`);
        await this.pushOnOffCommand(value);
    }
    async BrightnessSet(value) {
        this.infoLog(`BrightnessSet - value: ${value}`);
        this.brightnessDebounceHandler(value);
    }
    async brightnessSetDebounceWrapper(value) {
        this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} - API CALL: ${value}`);
        await this.pushBrightnessChanges(value);
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
    async HueSet(value) {
        this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Hue - value: ${value}`);
        this.Hue = value;
        this.hueAndSaturationDebounceHandler();
    }
    /**
     * Handle requests to set the value of the "Saturation" characteristic
     */
    async SaturationSet(value) {
        this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Saturation - value: ${value}`);
        this.Saturation = value;
        this.hueAndSaturationDebounceHandler();
    }
    async hueAndSaturationSetDebounceWrapper() {
        // const data = {
        //   hue: 0,
        //   saturation: 0,
        // };
        // if (value.hue) {
        //   data.hue = value.hue;
        // }
        // if (value.saturation) {
        //   data.saturation = value.saturation;
        // }
        this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Hue and Saturation - value: ${this.Hue}, ${this.Saturation}`);
        // this.Hue = data.saturation;
        // this.Saturation = data.saturation;
        //await this.updateHueAndSaturationCharacteristics();
        await this.pushHueSaturationChanges();
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
        await this.updateHueAndSaturationCharacteristics();
        // if (this.ColorTemperature === undefined) {
        //   this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} ColorTemperature: ${this.ColorTemperature}`);
        // } else {
        //   this.accessory.context.ColorTemperature = this.ColorTemperature;
        //   this.lightBulbService.updateCharacteristic(this.platform.Characteristic.ColorTemperature, this.ColorTemperature);
        //   this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic ColorTemperature: ${this.ColorTemperature}`);
        // }
    }
    updateHueAndSaturationCharacteristics() {
        if (this.Hue === undefined) {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Hue: ${this.Hue}`);
        }
        else {
            this.accessory.context.Hue = this.Hue;
            this.lightBulbService.updateCharacteristic(this.platform.Characteristic.Hue, this.Hue);
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic Hue: ${this.Hue}`);
        }
        if (this.Saturation === undefined) {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Saturation: ${this.Saturation}`);
        }
        else {
            this.accessory.context.Saturation = this.Saturation;
            this.lightBulbService.updateCharacteristic(this.platform.Characteristic.Saturation, this.Saturation);
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic Saturation: ${this.Saturation}`);
        }
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