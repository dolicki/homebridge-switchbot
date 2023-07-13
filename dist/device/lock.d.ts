/// <reference types="node" />
import { Context } from 'vm';
import { Subject } from 'rxjs';
import { SwitchBotPlatform } from '../platform';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { device, devicesConfig, deviceStatus, switchbot, ad, serviceData } from '../settings';
export declare class Lock {
    private readonly platform;
    private accessory;
    device: device & devicesConfig;
    lockService: Service;
    contactSensorService?: Service;
    ContactSensorState: CharacteristicValue;
    LockCurrentState: CharacteristicValue;
    LockTargetState: CharacteristicValue;
    doorState: deviceStatus['doorState'];
    lockState: deviceStatus['lockState'];
    deviceStatus: any;
    connected?: boolean;
    switchbot: switchbot;
    address: ad['address'];
    serviceData: serviceData;
    scanDuration: number;
    deviceLogging: string;
    deviceRefreshRate: number;
    lockUpdateInProgress: boolean;
    doLockUpdate: Subject<void>;
    private readonly BLE;
    private readonly OpenAPI;
    battery: any;
    calibration: any;
    status: any;
    update_from_secondary_lock: any;
    door_open: any;
    double_lock_mode: any;
    unclosed_alarm: any;
    unlocked_alarm: any;
    auto_lock_paused: any;
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
     * Lock   -    "command"     "lock"     "default"	 =        set to ???? state
     * Lock   -    "command"     "unlock"   "default"	 =        set to ???? state - LockCurrentState
     */
    pushChanges(): Promise<void>;
    BLEpushChanges(): Promise<void>;
    openAPIpushChanges(): Promise<void>;
    /**
     * Handle requests to set the value of the "On" characteristic
     */
    LockTargetStateSet(value: CharacteristicValue): Promise<void>;
    updateHomeKitCharacteristics(): Promise<void>;
    stopScanning(switchbot: any): Promise<void>;
    getCustomBLEAddress(switchbot: any): Promise<void>;
    BLEPushConnection(): Promise<void>;
    BLERefreshConnection(switchbot: any): Promise<void>;
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
//# sourceMappingURL=lock.d.ts.map