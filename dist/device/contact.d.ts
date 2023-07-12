/// <reference types="node" />
import { Context } from 'vm';
import { Subject } from 'rxjs';
import { SwitchBotPlatform } from '../platform';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { device, devicesConfig, serviceData, switchbot, deviceStatus, ad } from '../settings';
/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export declare class Contact {
    private readonly platform;
    private accessory;
    device: device & devicesConfig;
    contactSensorservice: Service;
    motionService?: Service;
    lightSensorService?: Service;
    batteryService?: Service;
    ContactSensorState: CharacteristicValue;
    MotionDetected: CharacteristicValue;
    CurrentAmbientLightLevel: CharacteristicValue;
    BatteryLevel: CharacteristicValue;
    StatusLowBattery: CharacteristicValue;
    openState: deviceStatus['openState'];
    moveDetected: deviceStatus['moveDetected'];
    brightness: deviceStatus['brightness'];
    deviceStatus: any;
    tested: any;
    contact_open: any;
    button_count: any;
    scanning: boolean;
    connected?: boolean;
    contact_timeout: any;
    switchbot: switchbot;
    serviceData: serviceData;
    address: ad['address'];
    battery: serviceData['battery'];
    movement: serviceData['movement'];
    doorState: serviceData['doorState'];
    is_light: any;
    set_minLux: number;
    set_maxLux: number;
    scanDuration: number;
    deviceLogging: string;
    deviceRefreshRate: number;
    contactUbpdateInProgress: boolean;
    doContactUpdate: Subject<void>;
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
    stopScanning(switchbot: any): Promise<void>;
    getCustomBLEAddress(switchbot: any): Promise<void>;
    BLERefreshConnection(switchbot: any): Promise<void>;
    minLux(): number;
    maxLux(): number;
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
//# sourceMappingURL=contact.d.ts.map