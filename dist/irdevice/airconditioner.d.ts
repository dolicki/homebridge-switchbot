import { SwitchBotPlatform } from "../platform";
import { irDevicesConfig, irdevice } from "../settings";
import { CharacteristicValue, PlatformAccessory, Service } from "homebridge";
/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export declare class AirConditioner {
    private readonly platform;
    private accessory;
    device: irdevice & irDevicesConfig;
    coolerService: Service;
    Active: CharacteristicValue;
    RotationSpeed: CharacteristicValue;
    CurrentTemperature: CharacteristicValue;
    TargetHeaterCoolerState: CharacteristicValue;
    CurrentHeaterCoolerState: CharacteristicValue;
    HeatingThresholdTemperature: CharacteristicValue;
    CoolingThresholdTemperature: CharacteristicValue;
    state: string;
    Busy: any;
    Timeout: any;
    CurrentMode: number;
    ValidValues: number[];
    CurrentFanSpeed: number;
    static MODE_AUTO: number;
    static MODE_COOL: number;
    static MODE_HEAT: number;
    disablePushOn?: boolean;
    disablePushOff?: boolean;
    disablePushDetail?: boolean;
    deviceLogging: string;
    hide_automode?: boolean;
    private readonly valid12;
    private readonly valid012;
    constructor(platform: SwitchBotPlatform, accessory: PlatformAccessory, device: irdevice & irDevicesConfig);
    /**
     * Pushes the requested changes to the SwitchBot API
     * deviceType				commandType     Command	          command parameter	         Description
     * AirConditioner:        "command"       "swing"          "default"	        =        swing
     * AirConditioner:        "command"       "timer"          "default"	        =        timer
     * AirConditioner:        "command"       "lowSpeed"       "default"	        =        fan speed to low
     * AirConditioner:        "command"       "middleSpeed"    "default"	        =        fan speed to medium
     * AirConditioner:        "command"       "highSpeed"      "default"	        =        fan speed to high
     */
    pushAirConditionerOnChanges(): Promise<void>;
    pushAirConditionerOffChanges(): Promise<void>;
    pushAirConditionerStatusChanges(): Promise<void>;
    pushAirConditionerDetailsChanges(): Promise<void>;
    pushChanges(bodyChange: any): Promise<void>;
    CurrentTemperatureGet(): Promise<CharacteristicValue>;
    RotationSpeedGet(): Promise<number>;
    RotationSpeedSet(value: CharacteristicValue): Promise<void>;
    ActiveSet(value: CharacteristicValue): Promise<void>;
    TargetHeaterCoolerStateGet(): Promise<CharacteristicValue>;
    TargetHeaterCoolerStateSet(value: CharacteristicValue): Promise<void>;
    TargetHeaterCoolerStateAUTO(): Promise<void>;
    TargetHeaterCoolerStateCOOL(): Promise<void>;
    TargetHeaterCoolerStateHEAT(): Promise<void>;
    CurrentHeaterCoolerStateGet(): Promise<CharacteristicValue>;
    HeatingThresholdTemperatureGet(): Promise<CharacteristicValue>;
    HeatingThresholdTemperatureSet(value: CharacteristicValue): Promise<void>;
    CoolingThresholdTemperatureGet(): Promise<CharacteristicValue>;
    CoolingThresholdTemperatureSet(value: CharacteristicValue): Promise<void>;
    updateHomeKitCharacteristics(): Promise<void>;
    disablePushOnChanges({ device }: {
        device: irdevice & irDevicesConfig;
    }): Promise<void>;
    disablePushOffChanges({ device }: {
        device: irdevice & irDevicesConfig;
    }): Promise<void>;
    disablePushDetailChanges({ device }: {
        device: irdevice & irDevicesConfig;
    }): Promise<void>;
    commandType(): Promise<string>;
    commandOn(): Promise<string>;
    commandOff(): Promise<string>;
    statusCode(statusCode: number): Promise<void>;
    apiError({ e }: {
        e: any;
    }): Promise<void>;
    FirmwareRevision({ accessory, device }: {
        accessory: PlatformAccessory;
        device: irdevice & irDevicesConfig;
    }): string;
    context(): Promise<void>;
    config({ device }: {
        device: irdevice & irDevicesConfig;
    }): Promise<void>;
    logs({ device }: {
        device: irdevice & irDevicesConfig;
    }): Promise<void>;
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
//# sourceMappingURL=airconditioner.d.ts.map