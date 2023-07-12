/// <reference types="node" />
import { Context } from 'vm';
import { Subject } from 'rxjs';
import { SwitchBotPlatform } from '../platform';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { device, devicesConfig, deviceStatus, ad, serviceData, switchbot } from '../settings';
/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export declare class Bot {
    private readonly platform;
    private accessory;
    device: device & devicesConfig;
    fanService?: Service;
    doorService?: Service;
    lockService?: Service;
    faucetService?: Service;
    windowService?: Service;
    switchService?: Service;
    outletService?: Service;
    batteryService?: Service;
    garageDoorService?: Service;
    windowCoveringService?: Service;
    statefulProgrammableSwitchService?: Service;
    On: CharacteristicValue;
    BatteryLevel: CharacteristicValue;
    StatusLowBattery: CharacteristicValue;
    power: deviceStatus['power'];
    deviceStatus: any;
    connected?: boolean;
    switchbot: switchbot;
    serviceData: serviceData;
    address: ad['address'];
    mode: serviceData['mode'];
    state: serviceData['state'];
    battery: serviceData['battery'];
    botMode: string;
    allowPush?: boolean;
    doublePress: number;
    pushRatePress: number;
    scanDuration: number;
    deviceLogging: string;
    deviceRefreshRate: number;
    multiPressCount: number;
    botUpdateInProgress: boolean;
    doBotUpdate: Subject<void>;
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
     * Pushes the requested changes to the SwitchBot API
     * deviceType	commandType	  Command	    command parameter	  Description
     * Bot   -    "command"     "turnOff"   "default"	  =        set to OFF state
     * Bot   -    "command"     "turnOn"    "default"	  =        set to ON state
     * Bot   -    "command"     "press"     "default"	  =        trigger press
     */
    pushChanges(): Promise<void>;
    BLEpushChanges(): Promise<void>;
    openAPIpushChanges(): Promise<void>;
    /**
     * Handle requests to set the "On" characteristic
     */
    OnSet(value: CharacteristicValue): Promise<void>;
    /**
     * Updates the status for each of the HomeKit Characteristics
     */
    updateHomeKitCharacteristics(): Promise<void>;
    removeOutletService(accessory: PlatformAccessory): Promise<void>;
    removeGarageDoorService(accessory: PlatformAccessory): Promise<void>;
    removeDoorService(accessory: PlatformAccessory): Promise<void>;
    removeLockService(accessory: PlatformAccessory): Promise<void>;
    removeFaucetService(accessory: PlatformAccessory): Promise<void>;
    removeFanService(accessory: PlatformAccessory): Promise<void>;
    removeWindowService(accessory: PlatformAccessory): Promise<void>;
    removeWindowCoveringService(accessory: PlatformAccessory): Promise<void>;
    removeStatefulProgrammableSwitchService(accessory: PlatformAccessory): Promise<void>;
    removeSwitchService(accessory: PlatformAccessory): Promise<void>;
    private DoublePress;
    stopScanning(switchbot: any): Promise<void>;
    getCustomBLEAddress(switchbot: any): Promise<void>;
    BLEPushConnection(): Promise<void>;
    BLERefreshConnection(switchbot: any): Promise<void>;
    retry({ max, fn }: {
        max: number;
        fn: {
            (): any;
            (): Promise<any>;
        };
    }): Promise<null>;
    maxRetry(): number;
    PressOrSwitch(device: device & devicesConfig): Promise<void>;
    allowPushChanges(device: device & devicesConfig): Promise<void>;
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
//# sourceMappingURL=bot.d.ts.map