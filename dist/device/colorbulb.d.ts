/// <reference types="node" />
import { Context } from "vm";
import { Subject } from "rxjs";
import { SwitchBotPlatform } from "../platform";
import { device, devicesConfig, deviceStatus, switchbot, serviceData, ad } from "../settings";
import { Service, PlatformAccessory, CharacteristicValue, ControllerConstructor, Controller, ControllerServiceMap } from "homebridge";
/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export declare class ColorBulb {
    private readonly platform;
    private accessory;
    device: device & devicesConfig;
    lightBulbService: Service;
    On: CharacteristicValue;
    Hue: CharacteristicValue;
    Saturation: CharacteristicValue;
    Brightness: CharacteristicValue;
    ColorTemperature?: CharacteristicValue;
    power: deviceStatus["power"];
    color: deviceStatus["color"];
    brightness: deviceStatus["brightness"];
    colorTemperature?: deviceStatus["colorTemperature"];
    deviceStatus: any;
    connected?: boolean;
    switchbot: switchbot;
    address: ad["address"];
    serviceData: serviceData;
    powerState: serviceData["power"];
    state: serviceData["state"];
    red: serviceData["red"];
    green: serviceData["green"];
    blue: serviceData["blue"];
    delay: serviceData["delay"];
    wifiRssi: serviceData["wifiRssi"];
    brightnessBLE: serviceData["brightness"];
    color_temperature: serviceData["color_temperature"];
    preset: any;
    color_mode: any;
    speed: any;
    loop_index: any;
    set_minStep?: number;
    scanDuration: number;
    deviceLogging: string;
    deviceRefreshRate: number;
    adaptiveLightingShift?: number;
    AdaptiveLightingController?: ControllerConstructor | Controller<ControllerServiceMap>;
    minKelvin: number;
    maxKelvin: number;
    cacheKelvin: number;
    colorBulbUpdateInProgress: boolean;
    doColorBulbUpdate: Subject<void>;
    lastApiUpdate: number;
    private readonly BLE;
    private readonly OpenAPI;
    constructor(platform: SwitchBotPlatform, accessory: PlatformAccessory, device: device & devicesConfig);
    private init;
    /**
     * Parse the device status from the SwitchBot api
     */
    parseStatus(): Promise<void>;
    BLEparseStatus(): Promise<void>;
    openAPIparseStatus(): Promise<void>;
    openAPIRefreshStatus(): Promise<void>;
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
    private pushOnOffCommand;
    pushHueSaturationChanges(): Promise<void>;
    pushColorTemperatureChanges(): Promise<void>;
    pushBrightnessChanges(value: CharacteristicValue): Promise<void>;
    /**
     * Handle requests to set the value of the "On" characteristic
     */
    OnSet(value: CharacteristicValue): Promise<void>;
    /**
     * Handle requests to set the value of the "Brightness" characteristic
     */
    brightnessDebounceHandler: (...args: any[]) => void;
    BrightnessSet(value: CharacteristicValue): Promise<void>;
    brightnessSetDebounceWrapper(value: any): Promise<void>;
    /**
     * Handle requests to set the value of the "ColorTemperature" characteristic
     */
    ColorTemperatureSet(value: CharacteristicValue): Promise<void>;
    /**
     * Handle requests to set the value of the "Hue" characteristic
     */
    hueAndSaturationDebounceHandler: (...args: any[]) => void;
    HueSet(value: CharacteristicValue): Promise<void>;
    /**
     * Handle requests to set the value of the "Saturation" characteristic
     */
    SaturationSet(value: CharacteristicValue): Promise<void>;
    hueAndSaturationSetDebounceWrapper(): Promise<void>;
    updateHomeKitCharacteristics(): Promise<void>;
    adaptiveLighting(device: device & devicesConfig): Promise<void>;
    retry({ max, fn }: {
        max: number;
        fn: {
            (): any;
            (): Promise<any>;
        };
    }): Promise<null>;
    maxRetry(): number;
    minStep(device: device & devicesConfig): number;
    statusCode(statusCode: number): Promise<void>;
    offlineOff(): Promise<void>;
    apiError(e: any): void;
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
//# sourceMappingURL=colorbulb.d.ts.map