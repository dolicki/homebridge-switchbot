"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Curtain = void 0;
const undici_1 = require("undici");
const utils_1 = require("../utils");
const rxjs_1 = require("rxjs");
const async_mqtt_1 = require("async-mqtt");
const operators_1 = require("rxjs/operators");
const settings_1 = require("../settings");
class Curtain {
    constructor(platform, accessory, device) {
        this.platform = platform;
        this.accessory = accessory;
        this.device = device;
        //MQTT stuff
        this.mqttClient = null;
        // Connection
        this.BLE = (this.device.connectionType === 'BLE' || this.device.connectionType === 'BLE/OpenAPI');
        this.OpenAPI = (this.device.connectionType === 'OpenAPI' || this.device.connectionType === 'BLE/OpenAPI');
        // default placeholders
        this.logs(device);
        this.refreshRate(device);
        this.scan(device);
        this.config(device);
        this.setupMqtt(device);
        this.context();
        // this is subject we use to track when we need to POST changes to the SwitchBot API
        this.doCurtainUpdate = new rxjs_1.Subject();
        this.curtainUpdateInProgress = false;
        this.setNewTarget = false;
        // Retrieve initial values and updateHomekit
        this.refreshStatus();
        // set accessory information
        accessory
            .getService(this.platform.Service.AccessoryInformation)
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'SwitchBot')
            .setCharacteristic(this.platform.Characteristic.Model, 'W0701600')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, device.deviceId)
            .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.FirmwareRevision(accessory, device))
            .getCharacteristic(this.platform.Characteristic.FirmwareRevision)
            .updateValue(this.FirmwareRevision(accessory, device));
        // get the WindowCovering service if it exists, otherwise create a new WindowCovering service
        // you can create multiple services for each accessory
        (this.windowCoveringService =
            accessory.getService(this.platform.Service.WindowCovering) || accessory.addService(this.platform.Service.WindowCovering)),
            `${device.deviceName} ${device.deviceType}`;
        // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
        // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
        // accessory.getService('NAME') ?? accessory.addService(this.platform.Service.WindowCovering, 'NAME', 'USER_DEFINED_SUBTYPE');
        // set the service name, this is what is displayed as the default name on the Home app
        // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
        this.windowCoveringService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
        if (!this.windowCoveringService.testCharacteristic(this.platform.Characteristic.ConfiguredName)) {
            this.windowCoveringService.addCharacteristic(this.platform.Characteristic.ConfiguredName, accessory.displayName);
        }
        // each service must implement at-minimum the "required characteristics" for the given service type
        // see https://developers.homebridge.io/#/service/WindowCovering
        // create handlers for required characteristics
        this.windowCoveringService.setCharacteristic(this.platform.Characteristic.PositionState, this.PositionState);
        this.windowCoveringService
            .getCharacteristic(this.platform.Characteristic.CurrentPosition)
            .setProps({
            minStep: this.minStep(device),
            minValue: 0,
            maxValue: 100,
            validValueRanges: [0, 100],
        })
            .onGet(() => {
            return this.CurrentPosition;
        });
        this.windowCoveringService
            .getCharacteristic(this.platform.Characteristic.TargetPosition)
            .setProps({
            minStep: this.minStep(device),
            minValue: 0,
            maxValue: 100,
            validValueRanges: [0, 100],
        })
            .onSet(this.TargetPositionSet.bind(this));
        // Light Sensor Service
        if (device.curtain?.hide_lightsensor) {
            this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Light Sensor Service`);
            this.lightSensorService = this.accessory.getService(this.platform.Service.LightSensor);
            accessory.removeService(this.lightSensorService);
        }
        else if (!this.lightSensorService) {
            this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Add Light Sensor Service`);
            (this.lightSensorService =
                this.accessory.getService(this.platform.Service.LightSensor) || this.accessory.addService(this.platform.Service.LightSensor)),
                `${accessory.displayName} Light Sensor`;
            this.lightSensorService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Light Sensor`);
            if (!this.lightSensorService?.testCharacteristic(this.platform.Characteristic.ConfiguredName)) {
                this.lightSensorService.addCharacteristic(this.platform.Characteristic.ConfiguredName, `${accessory.displayName} Light Sensor`);
            }
        }
        else {
            this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Light Sensor Service Not Added`);
        }
        // Battery Service
        if (!this.BLE) {
            this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Removing Battery Service`);
            this.batteryService = this.accessory.getService(this.platform.Service.Battery);
            accessory.removeService(this.batteryService);
        }
        else if (this.BLE && !this.batteryService) {
            this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Add Battery Service`);
            (this.batteryService = this.accessory.getService(this.platform.Service.Battery) || this.accessory.addService(this.platform.Service.Battery)),
                `${accessory.displayName} Battery`;
            this.batteryService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Battery`);
            if (!this.batteryService.testCharacteristic(this.platform.Characteristic.ConfiguredName)) {
                this.batteryService.addCharacteristic(this.platform.Characteristic.ConfiguredName, `${accessory.displayName} Battery`);
            }
        }
        else {
            this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Battery Service Not Added`);
        }
        // Update Homekit
        this.updateHomeKitCharacteristics();
        // Start an update interval
        (0, rxjs_1.interval)(this.deviceRefreshRate * 1000)
            .pipe((0, operators_1.skipWhile)(() => this.curtainUpdateInProgress))
            .subscribe(async () => {
            await this.refreshStatus();
        });
        // update slide progress
        (0, rxjs_1.interval)(this.updateRate * 1000)
            //.pipe(skipWhile(() => this.curtainUpdateInProgress))
            .subscribe(async () => {
            if (this.PositionState === this.platform.Characteristic.PositionState.STOPPED) {
                return;
            }
            this.debugLog(`${this.device.deviceType}: ${accessory.displayName} Refresh Status When Moving, PositionState: ${this.PositionState}`);
            await this.refreshStatus();
        });
        // Watch for Curtain change events
        // We put in a debounce of 100ms so we don't make duplicate calls
        this.doCurtainUpdate
            .pipe((0, operators_1.tap)(() => {
            this.curtainUpdateInProgress = true;
        }), (0, operators_1.debounceTime)(this.platform.config.options.pushRate * 1000))
            .subscribe(async () => {
            try {
                await this.pushChanges();
            }
            catch (e) {
                this.apiError(e);
                this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed pushChanges with ${this.device.connectionType} Connection,`
                    + ` Error Message: ${JSON.stringify(e.message)}`);
            }
            this.curtainUpdateInProgress = false;
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
            this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Connection Type:`
                + ` ${this.device.connectionType}, parseStatus will not happen.`);
        }
    }
    async BLEparseStatus() {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEparseStatus`);
        // CurrentPosition
        this.CurrentPosition = 100 - Number(this.position);
        await this.setMinMax();
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentPosition ${this.CurrentPosition}`);
        if (this.setNewTarget) {
            this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Checking Status ...`);
            await this.setMinMax();
            if (Number(this.TargetPosition) > this.CurrentPosition) {
                this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Closing, CurrentPosition: ${this.CurrentPosition}`);
                this.PositionState = this.platform.Characteristic.PositionState.INCREASING;
                this.windowCoveringService.getCharacteristic(this.platform.Characteristic.PositionState).updateValue(this.PositionState);
                this.debugLog(`${this.device.deviceType}: ${this.CurrentPosition} INCREASING PositionState: ${this.PositionState}`);
            }
            else if (Number(this.TargetPosition) < this.CurrentPosition) {
                this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Opening, CurrentPosition: ${this.CurrentPosition}`);
                this.PositionState = this.platform.Characteristic.PositionState.DECREASING;
                this.windowCoveringService.getCharacteristic(this.platform.Characteristic.PositionState).updateValue(this.PositionState);
                this.debugLog(`${this.device.deviceType}: ${this.CurrentPosition} DECREASING PositionState: ${this.PositionState}`);
            }
            else {
                this.debugLog(`${this.device.deviceType}: ${this.CurrentPosition} Standby, CurrentPosition: ${this.CurrentPosition}`);
                this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
                this.windowCoveringService.getCharacteristic(this.platform.Characteristic.PositionState).updateValue(this.PositionState);
                this.debugLog(`${this.device.deviceType}: ${this.CurrentPosition} STOPPED PositionState: ${this.PositionState}`);
            }
        }
        else {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Standby, CurrentPosition: ${this.CurrentPosition}`);
            this.TargetPosition = this.CurrentPosition;
            this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Stopped`);
        }
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentPosition: ${this.CurrentPosition},` +
            ` TargetPosition: ${this.TargetPosition}, PositionState: ${this.PositionState},`);
        if (!this.device.curtain?.hide_lightsensor) {
            this.set_minLux = this.minLux();
            this.set_maxLux = this.maxLux();
            this.spaceBetweenLevels = 9;
            // Brightness
            switch (this.lightLevel) {
                case 1:
                    this.CurrentAmbientLightLevel = this.set_minLux;
                    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
                    break;
                case 2:
                    this.CurrentAmbientLightLevel = (this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels;
                    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel},` +
                        ` Calculation: ${(this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels}`);
                    break;
                case 3:
                    this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 2;
                    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
                    break;
                case 4:
                    this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 3;
                    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
                    break;
                case 5:
                    this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 4;
                    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
                    break;
                case 6:
                    this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 5;
                    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
                    break;
                case 7:
                    this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 6;
                    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
                    break;
                case 8:
                    this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 7;
                    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
                    break;
                case 9:
                    this.CurrentAmbientLightLevel = ((this.set_maxLux - this.set_minLux) / this.spaceBetweenLevels) * 8;
                    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel}`);
                    break;
                case 10:
                default:
                    this.CurrentAmbientLightLevel = this.set_maxLux;
                    this.debugLog();
            }
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} LightLevel: ${this.lightLevel},`
                + ` CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`);
        }
        // Battery
        this.BatteryLevel = Number(this.battery);
        if (this.BatteryLevel < 10) {
            this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
        }
        else {
            this.StatusLowBattery = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
        }
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel},`
            + ` StatusLowBattery: ${this.StatusLowBattery}`);
    }
    async openAPIparseStatus() {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIparseStatus`);
        // CurrentPosition
        this.CurrentPosition = 100 - Number(this.slidePosition);
        await this.setMinMax();
        this.debugLog(`Curtain ${this.accessory.displayName} CurrentPosition: ${this.CurrentPosition}`);
        if (this.setNewTarget) {
            this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Checking Status ...`);
        }
        if (this.setNewTarget && this.moving) {
            await this.setMinMax();
            if (Number(this.TargetPosition) > this.CurrentPosition) {
                this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Closing, CurrentPosition: ${this.CurrentPosition} `);
                this.PositionState = this.platform.Characteristic.PositionState.INCREASING;
                this.windowCoveringService.getCharacteristic(this.platform.Characteristic.PositionState).updateValue(this.PositionState);
                this.debugLog(`${this.device.deviceType}: ${this.CurrentPosition} INCREASING PositionState: ${this.PositionState}`);
            }
            else if (Number(this.TargetPosition) < this.CurrentPosition) {
                this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Opening, CurrentPosition: ${this.CurrentPosition} `);
                this.PositionState = this.platform.Characteristic.PositionState.DECREASING;
                this.windowCoveringService.getCharacteristic(this.platform.Characteristic.PositionState).updateValue(this.PositionState);
                this.debugLog(`${this.device.deviceType}: ${this.CurrentPosition} DECREASING PositionState: ${this.PositionState}`);
            }
            else {
                this.debugLog(`${this.device.deviceType}: ${this.CurrentPosition} Standby, CurrentPosition: ${this.CurrentPosition}`);
                this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
                this.windowCoveringService.getCharacteristic(this.platform.Characteristic.PositionState).updateValue(this.PositionState);
                this.debugLog(`${this.device.deviceType}: ${this.CurrentPosition} STOPPED PositionState: ${this.PositionState}`);
            }
        }
        else {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Standby, CurrentPosition: ${this.CurrentPosition}`);
            this.TargetPosition = this.CurrentPosition;
            this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Stopped`);
        }
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentPosition: ${this.CurrentPosition},` +
            ` TargetPosition: ${this.TargetPosition}, PositionState: ${this.PositionState},`);
        if (!this.device.curtain?.hide_lightsensor) {
            this.set_minLux = this.minLux();
            this.set_maxLux = this.maxLux();
            // Brightness
            switch (this.brightness) {
                case 'dim':
                    this.CurrentAmbientLightLevel = this.set_minLux;
                    break;
                case 'bright':
                default:
                    this.CurrentAmbientLightLevel = this.set_maxLux;
            }
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`);
        }
    }
    async refreshStatus() {
        if (!this.device.enableCloudService && this.OpenAPI) {
            this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} refreshStatus enableCloudService: ${this.device.enableCloudService}`);
        }
        else if (this.BLE) {
            await this.BLERefreshStatus();
        }
        else if (this.OpenAPI && this.platform.config.credentials?.token) {
            await this.openAPIRefreshStatus();
        }
        else {
            await this.offlineOff();
            this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Connection Type:`
                + ` ${this.device.connectionType}, refreshStatus will not happen.`);
        }
    }
    async BLERefreshStatus() {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLERefreshStatus`);
        const switchbot = await this.platform.connectBLE();
        // Convert to BLE Address
        this.device.bleMac = this.device
            .deviceId.match(/.{1,2}/g)
            .join(':')
            .toLowerCase();
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
        this.getCustomBLEAddress(switchbot);
        // Start to monitor advertisement packets
        if (switchbot !== false) {
            switchbot
                .startScan({
                model: 'c',
                id: this.device.bleMac,
            })
                .then(async () => {
                // Set an event hander
                switchbot.onadvertisement = async (ad) => {
                    this.address = ad.address;
                    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Config BLE Address: ${this.device.bleMac},`
                        + ` BLE Address Found: ${this.address}`);
                    this.serviceData = ad.serviceData;
                    this.calibration = ad.serviceData.calibration;
                    this.battery = ad.serviceData.battery;
                    this.inMotion = ad.serviceData.inMotion;
                    this.position = ad.serviceData.position;
                    this.lightLevel = ad.serviceData.lightLevel;
                    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} serviceData: ${JSON.stringify(ad.serviceData)}`);
                    this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} calibration: ${ad.serviceData.calibration}, ` +
                        `position: ${ad.serviceData.position}, lightLevel: ${ad.serviceData.lightLevel}, battery: ${ad.serviceData.battery}, ` +
                        `inMotion: ${ad.serviceData.inMotion}`);
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
                this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed BLERefreshStatus with ${this.device.connectionType}`
                    + ` Connection, Error Message: ${JSON.stringify(e.message)}`);
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
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Devices: ${JSON.stringify(deviceStatus.body)}`);
            this.statusCode(statusCode);
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Headers: ${JSON.stringify(headers)}`);
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} refreshStatus: ${JSON.stringify(deviceStatus)}`);
            this.slidePosition = deviceStatus.body.slidePosition;
            this.moving = deviceStatus.body.moving;
            this.brightness = deviceStatus.body.brightness;
            this.openAPIparseStatus();
            this.updateHomeKitCharacteristics();
        }
        catch (e) {
            this.apiError(e);
            this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed openAPIRefreshStatus with ${this.device.connectionType}`
                + ` Connection, Error Message: ${JSON.stringify(e.message)}`);
        }
    }
    async pushChanges() {
        if (!this.device.enableCloudService && this.OpenAPI) {
            this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} pushChanges enableCloudService: ${this.device.enableCloudService}`);
        }
        else if (this.BLE) {
            await this.BLEpushChanges();
        }
        else if (this.OpenAPI && this.platform.config.credentials?.token) {
            await this.openAPIpushChanges();
        }
        else {
            await this.offlineOff();
            this.debugWarnLog(`${this.device.deviceType}: ${this.accessory.displayName} Connection Type:`
                + ` ${this.device.connectionType}, pushChanges will not happen.`);
        }
        // Refresh the status from the API
        (0, rxjs_1.interval)(15000)
            .pipe((0, operators_1.skipWhile)(() => this.curtainUpdateInProgress))
            .pipe((0, operators_1.take)(1))
            .subscribe(async () => {
            await this.refreshStatus();
        });
    }
    async BLEpushChanges() {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLEpushChanges`);
        if (this.TargetPosition !== this.CurrentPosition) {
            const switchbot = await this.platform.connectBLE();
            // Convert to BLE Address
            this.device.bleMac = this.device
                .deviceId.match(/.{1,2}/g)
                .join(':')
                .toLowerCase();
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BLE Address: ${this.device.bleMac}`);
            this.SilentPerformance();
            const adjustedMode = this.setPositionMode || null;
            if (adjustedMode === null) {
                this.Mode = 'Default Mode';
            }
            this.debugLog(`${this.accessory.displayName} Mode: ${this.Mode}`);
            if (switchbot !== false) {
                await this.retry({
                    max: this.maxRetry(),
                    fn: () => {
                        return switchbot
                            .discover({ model: 'c', quick: true, id: this.device.bleMac })
                            .then(async (device_list) => {
                            this.infoLog(`${this.accessory.displayName} Target Position: ${this.TargetPosition}`);
                            return await device_list[0].runToPos(100 - Number(this.TargetPosition), adjustedMode);
                        })
                            .then(() => {
                            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Done.`);
                        })
                            .catch(async (e) => {
                            this.apiError(e);
                            this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed BLEpushChanges with ${this.device.connectionType}`
                                + ` Connection, Error Message: ${JSON.stringify(e.message)}`);
                            await this.BLEPushConnection();
                            throw new Error('Connection error');
                        });
                    },
                });
            }
            else {
                this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} wasn't able to establish BLE Connection`);
                await this.BLEPushConnection();
            }
        }
        else {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No BLEpushChanges, CurrentPosition & TargetPosition Are the Same.` +
                `  CurrentPosition: ${this.CurrentPosition}, TargetPosition  ${this.TargetPosition}`);
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
    async openAPIpushChanges() {
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} openAPIpushChanges`);
        if ((this.TargetPosition !== this.CurrentPosition) || this.device.disableCaching) {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Pushing ${this.TargetPosition}`);
            const adjustedTargetPosition = 100 - Number(this.TargetPosition);
            if (Number(this.TargetPosition) > 50) {
                this.setPositionMode = this.device.curtain?.setOpenMode;
            }
            else {
                this.setPositionMode = this.device.curtain?.setCloseMode;
            }
            if (this.setPositionMode === '1') {
                this.Mode = 'Silent Mode';
            }
            else if (this.setPositionMode === '0') {
                this.Mode = 'Performance Mode';
            }
            else {
                this.Mode = 'Default Mode';
            }
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Mode: ${this.Mode}`);
            const adjustedMode = this.setPositionMode || 'ff';
            const bodyChange = JSON.stringify({
                'command': 'setPosition',
                'parameter': `0,${adjustedMode},${adjustedTargetPosition}`,
                'commandType': 'command',
            });
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Sending request to SwitchBot API, body: ${bodyChange},`);
            try {
                const { body, statusCode, headers } = await (0, undici_1.request)(`${settings_1.Devices}/${this.device.deviceId}/commands`, {
                    body: bodyChange,
                    method: 'POST',
                    headers: this.platform.generateHeaders(),
                });
                const deviceStatus = await body.json();
                this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Devices: ${JSON.stringify(deviceStatus.body)}`);
                this.statusCode(statusCode);
                this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Headers: ${JSON.stringify(headers)}`);
            }
            catch (e) {
                this.apiError(e);
                this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} failed openAPIpushChanges with ${this.device.connectionType}`
                    + ` Connection, Error Message: ${JSON.stringify(e.message)}`);
            }
        }
        else {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No OpenAPI Changes, CurrentPosition & TargetPosition Are the Same.`
                + ` CurrentPosition: ${this.CurrentPosition}, TargetPosition  ${this.TargetPosition}`);
        }
    }
    /**
     * Handle requests to set the value of the "Target Position" characteristic
     */
    async TargetPositionSet(value) {
        if (this.TargetPosition === this.accessory.context.TargetPosition) {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} No Changes, Set TargetPosition: ${value}`);
        }
        else {
            this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Set TargetPosition: ${value}`);
        }
        this.TargetPosition = value;
        if (this.device.mqttURL) {
            this.mqttPublish('TargetPosition', this.TargetPosition);
        }
        await this.setMinMax();
        if (value > this.CurrentPosition) {
            this.PositionState = this.platform.Characteristic.PositionState.INCREASING;
            this.setNewTarget = true;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} value: ${value}, CurrentPosition: ${this.CurrentPosition}`);
        }
        else if (value < this.CurrentPosition) {
            this.PositionState = this.platform.Characteristic.PositionState.DECREASING;
            this.setNewTarget = true;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} value: ${value}, CurrentPosition: ${this.CurrentPosition}`);
        }
        else {
            this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
            this.setNewTarget = false;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} value: ${value}, CurrentPosition: ${this.CurrentPosition}`);
        }
        this.windowCoveringService.setCharacteristic(this.platform.Characteristic.PositionState, this.PositionState);
        this.windowCoveringService.getCharacteristic(this.platform.Characteristic.PositionState).updateValue(this.PositionState);
        /**
         * If Curtain movement time is short, the moving flag from backend is always false.
         * The minimum time depends on the network control latency.
         */
        clearTimeout(this.setNewTargetTimer);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateRate: ${this.updateRate}`);
        if (this.setNewTarget) {
            this.setNewTargetTimer = setTimeout(() => {
                this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} setNewTarget ${this.setNewTarget} timeout`);
                this.setNewTarget = false;
            }, this.updateRate * 1000);
        }
        this.doCurtainUpdate.next();
    }
    async updateHomeKitCharacteristics() {
        await this.setMinMax();
        if (this.CurrentPosition === undefined || Number.isNaN(this.CurrentPosition)) {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentPosition: ${this.CurrentPosition}`);
        }
        else {
            if (this.device.mqttURL) {
                this.mqttPublish('CurrentPosition', this.CurrentPosition);
            }
            this.accessory.context.CurrentPosition = this.CurrentPosition;
            this.windowCoveringService.updateCharacteristic(this.platform.Characteristic.CurrentPosition, Number(this.CurrentPosition));
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic CurrentPosition: ${this.CurrentPosition}`);
        }
        if (this.PositionState === undefined) {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} PositionState: ${this.PositionState}`);
        }
        else {
            if (this.device.mqttURL) {
                this.mqttPublish('PositionState', this.PositionState);
            }
            this.accessory.context.PositionState = this.PositionState;
            this.windowCoveringService.updateCharacteristic(this.platform.Characteristic.PositionState, Number(this.PositionState));
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic PositionState: ${this.PositionState}`);
        }
        if (this.TargetPosition === undefined || Number.isNaN(this.TargetPosition)) {
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} TargetPosition: ${this.TargetPosition}`);
        }
        else {
            if (this.device.mqttURL) {
                this.mqttPublish('TargetPosition', this.TargetPosition);
            }
            this.accessory.context.TargetPosition = this.TargetPosition;
            this.windowCoveringService.updateCharacteristic(this.platform.Characteristic.TargetPosition, Number(this.TargetPosition));
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic TargetPosition: ${this.TargetPosition}`);
        }
        if (!this.device.curtain?.hide_lightsensor) {
            if (this.CurrentAmbientLightLevel === undefined || Number.isNaN(this.CurrentAmbientLightLevel)) {
                this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`);
            }
            else {
                if (this.device.mqttURL) {
                    this.mqttPublish('CurrentAmbientLightLevel', this.CurrentAmbientLightLevel);
                }
                this.accessory.context.CurrentAmbientLightLevel = this.CurrentAmbientLightLevel;
                this.lightSensorService?.updateCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel, this.CurrentAmbientLightLevel);
                this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
                    + ` updateCharacteristic CurrentAmbientLightLevel: ${this.CurrentAmbientLightLevel}`);
            }
        }
        if (this.BLE) {
            if (this.BatteryLevel === undefined) {
                this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} BatteryLevel: ${this.BatteryLevel}`);
            }
            else {
                if (this.device.mqttURL) {
                    this.mqttPublish('BatteryLevel', this.BatteryLevel);
                }
                this.accessory.context.BatteryLevel = this.BatteryLevel;
                this.batteryService?.updateCharacteristic(this.platform.Characteristic.BatteryLevel, this.BatteryLevel);
                this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic BatteryLevel: ${this.BatteryLevel}`);
            }
            if (this.StatusLowBattery === undefined) {
                this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} StatusLowBattery: ${this.StatusLowBattery}`);
            }
            else {
                if (this.device.mqttURL) {
                    this.mqttPublish('StatusLowBattery', this.StatusLowBattery);
                }
                this.accessory.context.StatusLowBattery = this.StatusLowBattery;
                this.batteryService?.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, this.StatusLowBattery);
                this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} updateCharacteristic StatusLowBattery: ${this.StatusLowBattery}`);
            }
        }
    }
    /*
     * Publish MQTT message for topics of
     * 'homebridge-switchbot/curtain/xx:xx:xx:xx:xx:xx'
     */
    mqttPublish(topic, message) {
        const mac = this.device.deviceId
            ?.toLowerCase()
            .match(/[\s\S]{1,2}/g)
            ?.join(':');
        const options = this.device.mqttPubOptions || {};
        this.mqttClient?.publish(`homebridge-switchbot/curtain/${mac}/${topic}`, `${message}`, options);
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} MQTT message: ${topic}/${message} options:${JSON.stringify(options)}`);
    }
    /*
     * Setup MQTT hadler if URL is specifed.
     */
    async setupMqtt(device) {
        if (device.mqttURL) {
            try {
                this.mqttClient = await (0, async_mqtt_1.connectAsync)(device.mqttURL, device.mqttOptions || {});
                this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} MQTT connection has been established successfully.`);
                this.mqttClient.on('error', (e) => {
                    this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Failed to publish MQTT messages. ${e}`);
                });
            }
            catch (e) {
                this.mqttClient = null;
                this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Failed to establish MQTT connection. ${e}`);
            }
        }
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
        if (this.device.customBLEaddress && this.deviceLogging.includes('debug')) {
            (async () => {
                // Start to monitor advertisement packets
                await switchbot.startScan({
                    model: 'c',
                });
                // Set an event handler
                switchbot.onadvertisement = (ad) => {
                    this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} ad: ${JSON.stringify(ad, null, '  ')}`);
                };
                await (0, utils_1.sleep)(10000);
                // Stop to monitor
                switchbot.stopScan();
            })();
        }
    }
    async BLEPushConnection() {
        if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
            this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} Using OpenAPI Connection to Push Changes`);
            await this.openAPIpushChanges();
        }
    }
    async BLERefreshConnection(switchbot) {
        this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} wasn't able to establish BLE Connection, node-switchbot: ${switchbot}`);
        if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
            this.warnLog(`${this.device.deviceType}: ${this.accessory.displayName} Using OpenAPI Connection to Refresh Status`);
            await this.openAPIRefreshStatus();
        }
    }
    async SilentPerformance() {
        if (Number(this.TargetPosition) > 50) {
            if (this.device.curtain?.setOpenMode === '1') {
                this.setPositionMode = 1;
                this.Mode = 'Silent Mode';
            }
            else {
                this.setPositionMode = 0;
                this.Mode = 'Performance Mode';
            }
        }
        else {
            if (this.device.curtain?.setCloseMode === '1') {
                this.setPositionMode = 1;
                this.Mode = 'Silent Mode';
            }
            else {
                this.setPositionMode = 0;
                this.Mode = 'Performance Mode';
            }
        }
    }
    async setMinMax() {
        if (this.device.curtain?.set_min) {
            if (Number(this.CurrentPosition) <= this.device.curtain?.set_min) {
                this.CurrentPosition = 0;
            }
        }
        if (this.device.curtain?.set_max) {
            if (Number(this.CurrentPosition) >= this.device.curtain?.set_max) {
                this.CurrentPosition = 100;
            }
        }
    }
    minStep(device) {
        if (device.curtain?.set_minStep) {
            this.set_minStep = device.curtain?.set_minStep;
        }
        else {
            this.set_minStep = 1;
        }
        return this.set_minStep;
    }
    minLux() {
        if (this.device.curtain?.set_minLux) {
            this.set_minLux = this.device.curtain?.set_minLux;
        }
        else {
            this.set_minLux = 1;
        }
        return this.set_minLux;
    }
    maxLux() {
        if (this.device.curtain?.set_maxLux) {
            this.set_maxLux = this.device.curtain?.set_maxLux;
        }
        else {
            this.set_maxLux = 6001;
        }
        return this.set_maxLux;
    }
    async scan(device) {
        if (device.scanDuration) {
            if (this.updateRate > device.scanDuration) {
                this.scanDuration = this.updateRate;
                if (this.BLE) {
                    this.warnLog(`${this.device.deviceType}: `
                        + `${this.accessory.displayName} scanDuration is less than updateRate, overriding scanDuration with updateRate`);
                }
            }
            else {
                this.scanDuration = this.accessory.context.scanDuration = device.scanDuration;
            }
            if (this.BLE) {
                this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Config scanDuration: ${this.scanDuration}`);
            }
        }
        else {
            if (this.updateRate > 1) {
                this.scanDuration = this.updateRate;
            }
            else {
                this.scanDuration = this.accessory.context.scanDuration = 1;
            }
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
                this.errorLog(`${this.device.deviceType}: ${this.accessory.displayName} Hub Device is offline, statusCode: ${statusCode}. `
                    + `Hub: ${this.device.hubDeviceId}`);
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
                this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Unknown statusCode: `
                    + `${statusCode}, Submit Bugs Here: ' + 'https://tinyurl.com/SwitchBotBug`);
        }
    }
    async offlineOff() {
        if (this.device.offline) {
            await this.context();
            await this.updateHomeKitCharacteristics();
        }
    }
    async apiError(e) {
        this.windowCoveringService.updateCharacteristic(this.platform.Characteristic.CurrentPosition, e);
        this.windowCoveringService.updateCharacteristic(this.platform.Characteristic.PositionState, e);
        this.windowCoveringService.updateCharacteristic(this.platform.Characteristic.TargetPosition, e);
        if (!this.device.curtain?.hide_lightsensor) {
            this.lightSensorService?.updateCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel, e);
        }
        if (this.BLE) {
            this.batteryService?.updateCharacteristic(this.platform.Characteristic.BatteryLevel, e);
            this.batteryService?.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, e);
        }
        //throw new this.platform.api.hap.HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    FirmwareRevision(accessory, device) {
        let FirmwareRevision;
        this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName}`
            + ` accessory.context.FirmwareRevision: ${accessory.context.FirmwareRevision}`);
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
        if (this.CurrentPosition === undefined) {
            this.CurrentPosition = 0;
        }
        else {
            this.CurrentPosition = this.accessory.context.CurrentPosition;
        }
        if (this.TargetPosition === undefined) {
            this.TargetPosition = 0;
        }
        else {
            this.TargetPosition = this.accessory.context.TargetPosition;
        }
        if (this.PositionState === undefined) {
            this.PositionState = this.platform.Characteristic.PositionState.STOPPED;
        }
        else {
            this.PositionState = this.accessory.context.PositionState;
        }
    }
    async refreshRate(device) {
        // refreshRate
        if (device.refreshRate) {
            this.deviceRefreshRate = this.accessory.context.refreshRate = device.refreshRate;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Config refreshRate: ${this.deviceRefreshRate}`);
        }
        else if (this.platform.config.options.refreshRate) {
            this.deviceRefreshRate = this.accessory.context.refreshRate = this.platform.config.options.refreshRate;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Platform Config refreshRate: ${this.deviceRefreshRate}`);
        }
        // updateRate
        if (device?.curtain?.updateRate) {
            this.updateRate = device?.curtain?.updateRate;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Device Config Curtain updateRate: ${this.updateRate}`);
        }
        else {
            this.updateRate = 7;
            this.debugLog(`${this.device.deviceType}: ${this.accessory.displayName} Using Default Curtain updateRate: ${this.updateRate}`);
        }
    }
    async config(device) {
        let config = {};
        if (device.curtain) {
            config = device.curtain;
        }
        if (device.connectionType !== undefined) {
            config['connectionType'] = device.connectionType;
        }
        if (device.external !== undefined) {
            config['external'] = device.external;
        }
        if (device.mqttURL !== undefined) {
            config['mqttURL'] = device.mqttURL;
        }
        if (device.logging !== undefined) {
            config['logging'] = device.logging;
        }
        if (device.refreshRate !== undefined) {
            config['refreshRate'] = device.refreshRate;
        }
        if (device.scanDuration !== undefined) {
            config['scanDuration'] = device.scanDuration;
        }
        if (device.maxRetry !== undefined) {
            config['maxRetry'] = device.maxRetry;
        }
        if (Object.entries(config).length !== 0) {
            this.infoLog(`${this.device.deviceType}: ${this.accessory.displayName} Config: ${JSON.stringify(config)}`);
        }
    }
    async logs(device) {
        if (this.platform.debugMode) {
            this.deviceLogging = this.accessory.context.logging = 'debugMode';
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
            this.deviceLogging = this.accessory.context.logging = 'standard';
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
exports.Curtain = Curtain;
//# sourceMappingURL=curtain.js.map