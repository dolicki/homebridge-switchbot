/// <reference types="node" />
import { Context } from 'vm';
import { MqttClient } from 'mqtt';
import { Subject } from 'rxjs';
import { SwitchBotPlatform } from '../platform';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { device, devicesConfig, serviceData, ad, switchbot, temperature, deviceStatus } from '../settings';
/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export declare class MeterPlus {
    private readonly platform;
    private accessory;
    device: device & devicesConfig;
    batteryService?: Service;
    temperatureservice?: Service;
    humidityservice?: Service;
    CurrentRelativeHumidity: CharacteristicValue;
    CurrentTemperature?: CharacteristicValue;
    BatteryLevel?: CharacteristicValue;
    ChargingState?: CharacteristicValue;
    StatusLowBattery?: CharacteristicValue;
    Battery: deviceStatus['battery'];
    Temperature: deviceStatus['temperature'];
    Humidity: deviceStatus['humidity'];
    deviceStatus: any;
    connected?: boolean;
    switchbot: switchbot;
    serviceData: serviceData;
    address: ad['address'];
    temperature: serviceData['temperature'];
    celsius: temperature['c'];
    fahrenheit: temperature['f'];
    battery: serviceData['battery'];
    humidity: serviceData['humidity'];
    mqttClient: MqttClient | null;
    historyService?: any;
    scanDuration: number;
    deviceLogging: string;
    deviceRefreshRate: number;
    meterUpdateInProgress: boolean;
    doMeterUpdate: Subject<void>;
    private readonly BLE;
    private readonly OpenAPI;
    constructor(platform: SwitchBotPlatform, accessory: PlatformAccessory, device: device & devicesConfig);
    /**
     * Parse the device status from the SwitchBot api
     */
    parseStatus(): Promise<void>;
    BLEparseStatus(): Promise<void>;
    openAPIparseStatus(): Promise<void>;
    /**
     * Asks the SwitchBot API for the latest device information
     */
    refreshStatus(): Promise<void>;
    BLERefreshStatus(): Promise<void>;
    openAPIRefreshStatus(): Promise<void>;
    /**
     * Updates the status for each of the HomeKit Characteristics
     */
    updateHomeKitCharacteristics(): Promise<void>;
    mqttPublish(message: any): void;
    setupMqtt(device: device & devicesConfig): Promise<void>;
    setupHistoryService(device: device & devicesConfig): Promise<void>;
    stopScanning(switchbot: any): Promise<void>;
    getCustomBLEAddress(switchbot: any): Promise<void>;
    BLERefreshConnection(switchbot: any): Promise<void>;
    model(device: device & devicesConfig): CharacteristicValue;
    scan(device: device & devicesConfig): Promise<void>;
    statusCode(statusCode: number): Promise<void>;
    offlineOff(): Promise<void>;
    apiError(e: any): Promise<void>;
    FirmwareRevision(accessory: PlatformAccessory<Context>, device: device & devicesConfig): CharacteristicValue;
    context(): Promise<void>;
    refreshRate(device: device & devicesConfig): Promise<void>;
    config(device: device & devicesConfig): Promise<void>;
    logs(device: device & devicesConfig): Promise<void>;
    /**
     * Logging for Device
     */
    infoLog(...log: any[]): void;
    warnLog(...log: any[]): void;
    debugWarnLog(...log: any[]): void;
    errorLog(...log: any[]): void;
    debugErrorLog(...log: any[]): void;
    debugLog(...log: any[]): void;
    enablingDeviceLogging(): boolean;
}
//# sourceMappingURL=meterplus.d.ts.map