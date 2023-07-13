/// <reference types="node" />
import { Context } from 'vm';
import { SwitchBotPlatform } from '../platform';
import { device, devicesConfig } from '../settings';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
export declare class Hub {
    private readonly platform;
    private accessory;
    device: device & devicesConfig;
    hubTemperatureSensor: Service;
    hubHumiditySensor: Service;
    CurrentRelativeHumidity: number;
    CurrentTemperature: number;
    deviceStatus: any;
    set_minStep: number;
    updateRate: number;
    set_minLux: number;
    set_maxLux: number;
    scanDuration: number;
    deviceLogging: string;
    deviceRefreshRate: number;
    private readonly BLE;
    private readonly OpenAPI;
    constructor(platform: SwitchBotPlatform, accessory: PlatformAccessory, device: device & devicesConfig);
    /**
     * Parse the device status from the SwitchBot api
     */
    parseStatus(): Promise<void>;
    openAPIparseStatus(): Promise<void>;
    refreshStatus(): Promise<void>;
    openAPIRefreshStatus(): Promise<void>;
    retry({ max, fn }: {
        max: number;
        fn: {
            (): any;
            (): Promise<any>;
        };
    }): Promise<null>;
    maxRetry(): number;
    /**
     * Handle requests to set the value of the "Target Position" characteristic
     */
    updateHomeKitCharacteristics(): Promise<void>;
    statusCode(statusCode: number): Promise<void>;
    offlineOff(): Promise<void>;
    apiError(e: any): Promise<void>;
    FirmwareRevision(accessory: PlatformAccessory<Context>, device: device & devicesConfig): CharacteristicValue;
    refreshRate(device: device & devicesConfig): Promise<void>;
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
//# sourceMappingURL=hub.d.ts.map