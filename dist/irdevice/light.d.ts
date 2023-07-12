import { SwitchBotPlatform } from '../platform';
import { irDevicesConfig, irdevice } from '../settings';
import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export declare class Light {
    private readonly platform;
    private accessory;
    device: irdevice & irDevicesConfig;
    lightBulbService: Service;
    On: CharacteristicValue;
    disablePushOn?: boolean;
    disablePushOff?: boolean;
    deviceLogging: string;
    constructor(platform: SwitchBotPlatform, accessory: PlatformAccessory, device: irdevice & irDevicesConfig);
    OnSet(value: CharacteristicValue): Promise<void>;
    /**
     * Pushes the requested changes to the SwitchBot API
     * deviceType	commandType     Command	          command parameter	         Description
     * Light -        "command"       "turnOff"         "default"	        =        set to OFF state
     * Light -       "command"       "turnOn"          "default"	        =        set to ON state
     * Light -       "command"       "volumeAdd"       "default"	        =        volume up
     * Light -       "command"       "volumeSub"       "default"	        =        volume down
     * Light -       "command"       "channelAdd"      "default"	        =        next channel
     * Light -       "command"       "channelSub"      "default"	        =        previous channel
     */
    pushLightOnChanges(): Promise<void>;
    pushLightOffChanges(): Promise<void>;
    pushLightBrightnessUpChanges(): Promise<void>;
    pushLightBrightnessDownChanges(): Promise<void>;
    pushChanges(bodyChange: any): Promise<void>;
    updateHomeKitCharacteristics(): Promise<void>;
    disablePushOnChanges({ device }: {
        device: irdevice & irDevicesConfig;
    }): Promise<void>;
    disablePushOffChanges({ device }: {
        device: irdevice & irDevicesConfig;
    }): Promise<void>;
    commandType(): Promise<string>;
    commandOn(): Promise<string>;
    commandOff(): Promise<string>;
    statusCode(statusCode: number): Promise<void>;
    apiError(e: any): Promise<void>;
    FirmwareRevision(accessory: PlatformAccessory, device: irdevice & irDevicesConfig): string;
    context(): Promise<void>;
    config(device: irdevice & irDevicesConfig): Promise<void>;
    logs(device: irdevice & irDevicesConfig): Promise<void>;
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
//# sourceMappingURL=light.d.ts.map